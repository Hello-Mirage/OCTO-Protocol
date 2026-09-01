/**
 * OCTO Protocol — Main Entry Point (MVP)
 * 
 * Starts a local dashboard on http://localhost:3000
 * Provides API for:
 *   - Generating / restoring BIP-39 identity
 *   - Starting Scanner mode (Tor hidden service + simple web page)
 *   - Stopping the session
 * 
 * For MVP: User accesses the .onion site via Tor Browser
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const identity = require('./identity');
const TorManager = require('./tor-manager');

const DASHBOARD_PORT = 3000;
const HIDDEN_SERVICE_LOCAL_PORT = 3001;

// ─── Express Apps ───────────────────────────────────────────────────

// Dashboard app (local only)
const dashboardApp = express();
dashboardApp.use(express.json());
dashboardApp.use(express.static(path.join(__dirname, '..', 'public')));

// Hidden service app (served on .onion)
const hiddenServiceApp = express();
hiddenServiceApp.use(express.static(path.join(__dirname, '..', 'public', 'onion-site')));

// ─── State ──────────────────────────────────────────────────────────

let currentState = {
    mode: null,             // 'scanner' | null
    mnemonic: null,
    onionAddress: null,
    torManager: null,
    hiddenServiceServer: null,
    chatMessages: [],       // Ephemeral in-memory messages
    wsClients: new Set()    // Connected WebSocket clients
};

// ─── Dashboard API ──────────────────────────────────────────────────

// Generate new identity
dashboardApp.post('/api/generate', (req, res) => {
    try {
        const mnemonic = identity.generateMnemonic();
        const onionAddress = identity.mnemonicToOnion(mnemonic);
        const words = mnemonic.split(' ');
        res.json({ success: true, mnemonic, words, onionAddress });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Restore identity from mnemonic
dashboardApp.post('/api/restore', (req, res) => {
    try {
        const { mnemonic } = req.body;
        if (!mnemonic || !identity.validateMnemonic(mnemonic)) {
            return res.status(400).json({ success: false, error: 'Invalid BIP-39 mnemonic' });
        }
        const onionAddress = identity.mnemonicToOnion(mnemonic);
        const words = mnemonic.split(' ');
        res.json({ success: true, mnemonic, words, onionAddress });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Start Scanner mode
dashboardApp.post('/api/start-scanner', async (req, res) => {
    try {
        const { mnemonic } = req.body;
        if (!mnemonic || !identity.validateMnemonic(mnemonic)) {
            return res.status(400).json({ success: false, error: 'Invalid mnemonic' });
        }

        // Don't restart if already running
        if (currentState.mode === 'scanner') {
            return res.json({
                success: true,
                message: 'Scanner already running',
                onionAddress: currentState.onionAddress
            });
        }

        console.log('\n═══════════════════════════════════════════');
        console.log('  STARTING SCANNER MODE');
        console.log('═══════════════════════════════════════════\n');

        // Setup directories
        const dataDir = path.join(__dirname, '..', 'data');
        const hiddenServiceDir = path.join(dataDir, 'hidden_service');

        // Write Tor key files from mnemonic
        const onionAddress = identity.writeTorKeys(hiddenServiceDir, mnemonic);
        console.log(`[scanner] .onion address: ${onionAddress}`);

        // Start the hidden service web server
        const hsServer = http.createServer(hiddenServiceApp);
        
        // Setup WebSocket on hidden service for chat
        const wss = new WebSocket.Server({ server: hsServer });
        setupChatWebSocket(wss);

        await new Promise((resolve) => {
            hsServer.listen(HIDDEN_SERVICE_LOCAL_PORT, '127.0.0.1', () => {
                console.log(`[scanner] Hidden service server on 127.0.0.1:${HIDDEN_SERVICE_LOCAL_PORT}`);
                resolve();
            });
        });

        // Start Tor with hidden service
        const torManager = new TorManager(dataDir);
        const torBinary = torManager.findTorBinary();
        if (!torBinary) {
            hsServer.close();
            return res.status(500).json({
                success: false,
                error: 'Tor binary not found. Install Tor or place tor.exe in the project tor/ directory.'
            });
        }

        const torrcPath = torManager.writeScannerConfig(
            hiddenServiceDir,
            80,
            HIDDEN_SERVICE_LOCAL_PORT
        );

        // Send initial response - Tor bootstrap happens async
        res.json({
            success: true,
            message: 'Starting Tor... This may take 30-60 seconds.',
            onionAddress,
            torBinary
        });

        // Bootstrap Tor (async)
        torManager.on('bootstrap', (progress) => {
            broadcastToDashboard({
                type: 'tor-bootstrap',
                progress
            });
        });

        try {
            await torManager.start(torrcPath);
            console.log('\n═══════════════════════════════════════════');
            console.log('  ✓ SCANNER IS LIVE');
            console.log(`  Address: ${onionAddress}`);
            console.log('  Open this in Tor Browser to access the site');
            console.log('═══════════════════════════════════════════\n');

            currentState.mode = 'scanner';
            currentState.mnemonic = mnemonic;
            currentState.onionAddress = onionAddress;
            currentState.torManager = torManager;
            currentState.hiddenServiceServer = hsServer;

            broadcastToDashboard({
                type: 'scanner-ready',
                onionAddress
            });
        } catch (err) {
            console.error(`[scanner] Tor failed: ${err.message}`);
            hsServer.close();
            broadcastToDashboard({
                type: 'scanner-error',
                error: err.message
            });
        }

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Stop current session
dashboardApp.post('/api/stop', (req, res) => {
    stopSession();
    res.json({ success: true, message: 'Session stopped' });
});

// Get current status
dashboardApp.get('/api/status', (req, res) => {
    res.json({
        mode: currentState.mode,
        onionAddress: currentState.onionAddress,
        torStatus: currentState.torManager ? currentState.torManager.getStatus() : null
    });
});

// ─── Chat WebSocket (on hidden service) ─────────────────────────────

function setupChatWebSocket(wss) {
    wss.on('connection', (ws) => {
        console.log('[chat] New peer connected via .onion');
        currentState.wsClients.add(ws);

        // Send chat history
        ws.send(JSON.stringify({
            type: 'history',
            messages: currentState.chatMessages
        }));

        // Broadcast to dashboard that someone connected
        broadcastToDashboard({
            type: 'peer-connected',
            count: currentState.wsClients.size
        });

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'message') {
                    const chatMsg = {
                        text: msg.text,
                        from: 'peer',
                        timestamp: Date.now()
                    };
                    currentState.chatMessages.push(chatMsg);

                    // Broadcast to all connected clients
                    for (const client of currentState.wsClients) {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: 'message', ...chatMsg }));
                        }
                    }

                    // Also forward to dashboard
                    broadcastToDashboard({ type: 'chat-message', ...chatMsg });
                }
            } catch (err) {
                console.error('[chat] Bad message:', err.message);
            }
        });

        ws.on('close', () => {
            currentState.wsClients.delete(ws);
            console.log('[chat] Peer disconnected');
            broadcastToDashboard({
                type: 'peer-disconnected',
                count: currentState.wsClients.size
            });
        });
    });
}

// ─── Dashboard WebSocket ────────────────────────────────────────────

const dashboardServer = http.createServer(dashboardApp);
const dashboardWss = new WebSocket.Server({ server: dashboardServer });
const dashboardClients = new Set();

dashboardWss.on('connection', (ws) => {
    dashboardClients.add(ws);

    // Send chat message from dashboard to .onion clients
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'message') {
                const chatMsg = {
                    text: msg.text,
                    from: 'scanner',
                    timestamp: Date.now()
                };
                currentState.chatMessages.push(chatMsg);

                // Broadcast to all .onion connected clients
                for (const client of currentState.wsClients) {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'message', ...chatMsg }));
                    }
                }
            }
        } catch (err) {
            console.error('[dashboard-ws] Bad message:', err.message);
        }
    });

    ws.on('close', () => {
        dashboardClients.delete(ws);
    });
});

function broadcastToDashboard(msg) {
    const data = JSON.stringify(msg);
    for (const client of dashboardClients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    }
}

// ─── Session Management ─────────────────────────────────────────────

function stopSession() {
    if (currentState.torManager) {
        currentState.torManager.stop();
    }
    if (currentState.hiddenServiceServer) {
        currentState.hiddenServiceServer.close();
    }
    // Close all WebSocket connections
    for (const client of currentState.wsClients) {
        client.close();
    }
    currentState = {
        mode: null,
        mnemonic: null,
        onionAddress: null,
        torManager: null,
        hiddenServiceServer: null,
        chatMessages: [],
        wsClients: new Set()
    };
    console.log('[main] Session stopped');
}

// ─── Graceful Shutdown ──────────────────────────────────────────────

process.on('SIGINT', () => {
    console.log('\n[main] Shutting down...');
    stopSession();
    dashboardServer.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    stopSession();
    dashboardServer.close();
    process.exit(0);
});

// ─── Start ──────────────────────────────────────────────────────────

dashboardServer.listen(DASHBOARD_PORT, () => {
    console.log('\n═══════════════════════════════════════════');
    console.log('  OCTO PROTOCOL — MVP');
    console.log('═══════════════════════════════════════════');
    console.log(`  Dashboard:  http://localhost:${DASHBOARD_PORT}`);
    console.log('  1. Generate or restore your 24-word identity');
    console.log('  2. Start Scanner to host your .onion site');
    console.log('  3. Open the .onion address in Tor Browser');
    console.log('═══════════════════════════════════════════\n');
});
