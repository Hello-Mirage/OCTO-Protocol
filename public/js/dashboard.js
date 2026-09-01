/**
 * OCTO Protocol — Dashboard Client Logic
 */

let currentMnemonic = null;
let currentOnion = null;
let ws = null;

// ─── WebSocket to backend ────────────────────────────────────

function connectWebSocket() {
    ws = new WebSocket(`ws://${window.location.host}`);

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
    };

    ws.onclose = () => {
        // Reconnect after 2 seconds
        setTimeout(connectWebSocket, 2000);
    };
}

function handleServerMessage(msg) {
    switch (msg.type) {
        case 'tor-bootstrap':
            updateProgress(msg.progress);
            addLog(`Bootstrapping Tor... ${msg.progress}%`, 'info');
            break;

        case 'scanner-ready':
            setStatus('online', `Scanner live — ${msg.onionAddress}`);
            addLog('✓ Hidden service is online!', 'success');
            addLog(`Address: ${msg.onionAddress}`, 'info');
            document.getElementById('chatCard').classList.remove('hidden');
            updateProgress(100);
            break;

        case 'scanner-error':
            setStatus('offline', `Error: ${msg.error}`);
            addLog(`✗ ${msg.error}`, 'error');
            break;

        case 'peer-connected':
            addLog(`Peer connected (${msg.count} total)`, 'success');
            break;

        case 'peer-disconnected':
            addLog(`Peer disconnected (${msg.count} remaining)`, 'info');
            break;

        case 'chat-message':
            addChatMessage(msg.text, 'peer');
            break;
    }
}

// ─── Identity ────────────────────────────────────────────────

async function generateIdentity() {
    try {
        const res = await fetch('/api/generate', { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            currentMnemonic = data.mnemonic;
            currentOnion = data.onionAddress;
            displayIdentity(data.words, data.onionAddress);
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Failed to generate identity: ' + err.message);
    }
}

function showRestoreInput() {
    document.getElementById('restoreSection').classList.remove('hidden');
}

function hideRestoreInput() {
    document.getElementById('restoreSection').classList.add('hidden');
    document.getElementById('restoreInput').value = '';
}

async function restoreIdentity() {
    const mnemonic = document.getElementById('restoreInput').value.trim().toLowerCase();
    const words = mnemonic.split(/\s+/);

    if (words.length !== 24) {
        alert('Please enter exactly 24 words.');
        return;
    }

    try {
        const res = await fetch('/api/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mnemonic: words.join(' ') })
        });
        const data = await res.json();

        if (data.success) {
            currentMnemonic = data.mnemonic;
            currentOnion = data.onionAddress;
            displayIdentity(data.words, data.onionAddress);
            hideRestoreInput();
        } else {
            alert('Invalid mnemonic: ' + data.error);
        }
    } catch (err) {
        alert('Failed to restore: ' + err.message);
    }
}

function displayIdentity(words, onionAddress) {
    // Show word grid
    const grid = document.getElementById('wordGrid');
    grid.innerHTML = '';
    words.forEach((word, i) => {
        const chip = document.createElement('div');
        chip.className = 'word-chip';
        chip.setAttribute('data-index', i + 1);
        chip.textContent = word;
        grid.appendChild(chip);
    });

    // Show onion address
    document.getElementById('onionText').textContent = onionAddress;

    // Show display, show scanner card
    document.getElementById('wordDisplay').classList.remove('hidden');
    document.getElementById('scannerCard').classList.remove('hidden');

    setStatus('offline', 'Identity loaded — Ready to start scanner');
}

// ─── Scanner ─────────────────────────────────────────────────

async function startScanner() {
    if (!currentMnemonic) {
        alert('Generate or restore an identity first.');
        return;
    }

    document.getElementById('btnStartScanner').disabled = true;
    document.getElementById('scannerRunning').classList.remove('hidden');
    setStatus('connecting', 'Starting Tor hidden service...');
    addLog('Initializing scanner...', 'info');

    try {
        const res = await fetch('/api/start-scanner', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mnemonic: currentMnemonic })
        });
        const data = await res.json();

        if (data.success) {
            addLog(`Tor binary: ${data.torBinary}`, 'info');
            addLog(`Target address: ${data.onionAddress}`, 'info');
            addLog(data.message, 'info');
        } else {
            addLog(`Error: ${data.error}`, 'error');
            setStatus('offline', 'Failed to start');
            document.getElementById('btnStartScanner').disabled = false;
        }
    } catch (err) {
        addLog(`Error: ${err.message}`, 'error');
        setStatus('offline', 'Failed to start');
        document.getElementById('btnStartScanner').disabled = false;
    }
}

async function stopSession() {
    try {
        await fetch('/api/stop', { method: 'POST' });
        setStatus('offline', 'Session stopped');
        document.getElementById('scannerRunning').classList.add('hidden');
        document.getElementById('chatCard').classList.add('hidden');
        document.getElementById('btnStartScanner').disabled = false;
        document.getElementById('scannerLog').innerHTML = '';
    } catch (err) {
        console.error('Failed to stop:', err);
    }
}

// ─── Chat ────────────────────────────────────────────────────

function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || !ws) return;

    ws.send(JSON.stringify({ type: 'message', text }));
    addChatMessage(text, 'self');
    input.value = '';
}

function addChatMessage(text, from) {
    const container = document.getElementById('chatMessages');
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble chat-bubble--${from}`;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    bubble.innerHTML = `
        ${escapeHtml(text)}
        <div class="chat-bubble__time">${from === 'self' ? 'You' : 'Peer'} · ${time}</div>
    `;

    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
}

// ─── UI Helpers ──────────────────────────────────────────────

function setStatus(state, text) {
    const bar = document.getElementById('statusBar');
    bar.className = `status status--${state}`;
    document.getElementById('statusText').textContent = text;
}

function updateProgress(percent) {
    document.getElementById('progressBar').style.width = `${percent}%`;
}

function addLog(text, type = '') {
    const log = document.getElementById('scannerLog');
    const entry = document.createElement('div');
    entry.className = `log__entry${type ? ` log__entry--${type}` : ''}`;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    entry.textContent = `[${time}] ${text}`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
}

function copyOnion() {
    if (currentOnion) {
        navigator.clipboard.writeText(currentOnion).then(() => {
            const fb = document.getElementById('copyFeedback');
            fb.classList.add('show');
            setTimeout(() => fb.classList.remove('show'), 2000);
        });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ─── Init ────────────────────────────────────────────────────

connectWebSocket();
