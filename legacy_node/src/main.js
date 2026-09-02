const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { SocksProxyAgent } = require('socks-proxy-agent');
const identity = require('./identity');
const TorManager = require('./tor-manager');

const HIDDEN_SERVICE_LOCAL_PORT = 3001;

let mainWindow;

// ─── State ──────────────────────────────────────────────────────────

let currentState = {
    mode: null,             // 'scanner' | 'beacon' | null
    mnemonic: null,
    onionAddress: null,
    targetAddress: null,
    torManager: null,
    hiddenServiceServer: null,
    beaconWs: null,
    chatMessages: [],       // Ephemeral in-memory messages
    wsClients: new Set()    // Connected WebSocket clients (for Scanner)
};

// ─── Electron Window ────────────────────────────────────────────────

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 800,
        minWidth: 500,
        minHeight: 600,
        backgroundColor: '#06060a',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        autoHideMenuBar: true
    });

    mainWindow.loadFile(path.join(__dirname, '..', 'public', 'index.html'));
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    stopSession();
});

// Helper to broadcast to the UI
function sendToUI(channel, data) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
    }
}

// ─── IPC Handlers ───────────────────────────────────────────────────

ipcMain.handle('generate-identity', () => {
    try {
        const mnemonic = identity.generateMnemonic();
        const onionAddress = identity.mnemonicToOnion(mnemonic);
        const words = mnemonic.split(' ');
        return { success: true, mnemonic, words, onionAddress };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('restore-identity', (_event, mnemonic) => {
    try {
        if (!mnemonic || !identity.validateMnemonic(mnemonic)) {
            return { success: false, error: 'Invalid BIP-39 mnemonic' };
        }
        const onionAddress = identity.mnemonicToOnion(mnemonic);
        const words = mnemonic.split(' ');
        return { success: true, mnemonic, words, onionAddress };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('start-scanner', async (_event, mnemonic) => {
    try {
        if (!mnemonic || !identity.validateMnemonic(mnemonic)) {
            return { success: false, error: 'Invalid mnemonic' };
        }
        if (currentState.mode === 'scanner') {
            return { success: true, message: 'Scanner already running' };
        }

        stopSession();

        const dataDir = path.join(__dirname, '..', 'data');
        const hiddenServiceDir = path.join(dataDir, 'hidden_service');
        const onionAddress = identity.writeTorKeys(hiddenServiceDir, mnemonic);

        // Start hidden service server
        const hiddenServiceApp = express();
        hiddenServiceApp.use(express.static(path.join(__dirname, '..', 'public', 'onion-site')));
        const hsServer = http.createServer(hiddenServiceApp);
        const wss = new WebSocket.Server({ server: hsServer });
        setupScannerWebSocket(wss);

        await new Promise((resolve) => hsServer.listen(HIDDEN_SERVICE_LOCAL_PORT, '127.0.0.1', resolve));

        // Start Tor
        const torManager = new TorManager(dataDir);
        const torBinary = torManager.findTorBinary();
        if (!torBinary) throw new Error('Tor binary not found.');

        const torrcPath = torManager.writeScannerConfig(hiddenServiceDir, 80, HIDDEN_SERVICE_LOCAL_PORT);

        torManager.on('bootstrap', (progress) => sendToUI('tor-bootstrap', progress));

        torManager.start(torrcPath).then(() => {
            currentState.mode = 'scanner';
            currentState.mnemonic = mnemonic;
            currentState.onionAddress = onionAddress;
            currentState.torManager = torManager;
            currentState.hiddenServiceServer = hsServer;
            sendToUI('scanner-ready', { onionAddress, torBinary });
        }).catch((err) => {
            hsServer.close();
            sendToUI('scanner-error', err.message);
        });

        return { success: true, message: 'Starting Tor...', onionAddress, torBinary };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('start-beacon', async (_event, targetAddress) => {
    try {
        if (!targetAddress || !targetAddress.endsWith('.onion')) {
            return { success: false, error: 'Invalid .onion address' };
        }

        stopSession();

        const dataDir = path.join(__dirname, '..', 'data');
        const torManager = new TorManager(dataDir);
        const torBinary = torManager.findTorBinary();
        if (!torBinary) throw new Error('Tor binary not found.');

        const torrcPath = torManager.writeBeaconConfig(9050);

        torManager.on('bootstrap', (progress) => sendToUI('tor-bootstrap', progress));

        torManager.start(torrcPath).then(() => {
            currentState.mode = 'beacon';
            currentState.targetAddress = targetAddress;
            currentState.torManager = torManager;
            
            // Connect to target via SOCKS5
            connectBeaconWebSocket(targetAddress);
            
            sendToUI('beacon-ready', { targetAddress, torBinary });
        }).catch((err) => {
            sendToUI('beacon-error', err.message);
        });

        return { success: true, message: 'Starting Tor Client...', torBinary };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('stop-session', () => {
    stopSession();
    return { success: true };
});

ipcMain.on('send-chat-message', (_event, text) => {
    const chatMsg = { text, from: 'self', timestamp: Date.now() };
    currentState.chatMessages.push(chatMsg);

    if (currentState.mode === 'scanner') {
        // Broadcast to all connected peers
        for (const client of currentState.wsClients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'message', text, from: 'scanner', timestamp: chatMsg.timestamp }));
            }
        }
    } else if (currentState.mode === 'beacon') {
        // Send to scanner
        if (currentState.beaconWs && currentState.beaconWs.readyState === WebSocket.OPEN) {
            currentState.beaconWs.send(JSON.stringify({ type: 'message', text, from: 'beacon', timestamp: chatMsg.timestamp }));
        }
    }
});

// ─── Scanner Chat Logic ──────────────────────────────────────────────

function setupScannerWebSocket(wss) {
    wss.on('connection', (ws) => {
        currentState.wsClients.add(ws);
        sendToUI('peer-connected', currentState.wsClients.size);
        ws.send(JSON.stringify({ type: 'history', messages: currentState.chatMessages }));

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'message') {
                    const chatMsg = { text: msg.text, from: 'peer', timestamp: Date.now() };
                    currentState.chatMessages.push(chatMsg);
                    
                    // Broadcast to other peers
                    for (const client of currentState.wsClients) {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: 'message', text: msg.text, from: 'peer', timestamp: chatMsg.timestamp }));
                        }
                    }
                    sendToUI('chat-message', chatMsg);
                }
            } catch (e) {}
        });

        ws.on('close', () => {
            currentState.wsClients.delete(ws);
            sendToUI('peer-disconnected', currentState.wsClients.size);
        });
    });
}

// ─── Beacon Chat Logic ───────────────────────────────────────────────

function connectBeaconWebSocket(onionAddress) {
    const proxy = 'socks5h://127.0.0.1:9050';
    const agent = new SocksProxyAgent(proxy);
    
    // Connect to ws://[onionAddress]
    // The hidden service is on port 80, so ws:// works.
    const wsUrl = `ws://${onionAddress}/`;
    
    sendToUI('chat-message', { text: 'Connecting to ' + onionAddress + '...', from: 'peer' });

    currentState.beaconWs = new WebSocket(wsUrl, { agent });

    currentState.beaconWs.on('open', () => {
        sendToUI('peer-connected', 1);
        sendToUI('chat-message', { text: 'Connected securely via Tor.', from: 'peer' });
    });

    currentState.beaconWs.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'history') {
                currentState.chatMessages = msg.messages.map(m => ({
                    text: m.text,
                    from: m.from === 'scanner' ? 'peer' : 'self',
                    timestamp: m.timestamp
                }));
                sendToUI('chat-history', currentState.chatMessages);
            } else if (msg.type === 'message') {
                const chatMsg = { text: msg.text, from: 'peer', timestamp: msg.timestamp || Date.now() };
                currentState.chatMessages.push(chatMsg);
                sendToUI('chat-message', chatMsg);
            }
        } catch (e) {}
    });

    currentState.beaconWs.on('close', () => {
        sendToUI('peer-disconnected', 0);
        sendToUI('chat-message', { text: 'Disconnected from peer.', from: 'peer' });
    });
    
    currentState.beaconWs.on('error', (err) => {
        sendToUI('beacon-error', 'WebSocket Error: ' + err.message);
    });
}

// ─── Cleanup ────────────────────────────────────────────────────────

function stopSession() {
    if (currentState.torManager) currentState.torManager.stop();
    if (currentState.hiddenServiceServer) currentState.hiddenServiceServer.close();
    if (currentState.beaconWs) currentState.beaconWs.close();
    for (const client of currentState.wsClients) client.close();
    
    currentState = {
        mode: null,
        mnemonic: null,
        onionAddress: null,
        targetAddress: null,
        torManager: null,
        hiddenServiceServer: null,
        beaconWs: null,
        chatMessages: [],
        wsClients: new Set()
    };
}
