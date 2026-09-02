/**
 * OCTO Protocol — Dashboard Client Logic (Electron)
 */

let currentMnemonic = null;
let currentOnion = null;
let currentRole = 'scanner';

// ─── Setup IPC Listeners ─────────────────────────────────────

window.electronAPI.onTorBootstrap((progress) => {
    updateProgress(progress);
    addLog(`Bootstrapping Tor... ${progress}%`, 'info');
});

window.electronAPI.onScannerReady((data) => {
    setStatus('online', `Scanner live — ${data.onionAddress}`);
    addLog('✓ Hidden service is online!', 'success');
    document.getElementById('chatCard').classList.remove('hidden');
    updateProgress(100);
});

window.electronAPI.onBeaconReady((data) => {
    setStatus('online', `Tor Client Ready`);
    addLog('✓ Tor SOCKS proxy is online! Connecting to peer...', 'success');
    document.getElementById('chatCard').classList.remove('hidden');
    updateProgress(100);
});

window.electronAPI.onScannerError((error) => {
    setStatus('offline', `Error: ${error}`);
    addLog(`✗ ${error}`, 'error');
});

window.electronAPI.onBeaconError((error) => {
    setStatus('offline', `Error: ${error}`);
    addLog(`✗ ${error}`, 'error');
});

window.electronAPI.onPeerConnected((count) => {
    addLog(`Peer connected (${count} total)`, 'success');
});

window.electronAPI.onPeerDisconnected((count) => {
    addLog(`Peer disconnected (${count} remaining)`, 'info');
});

window.electronAPI.onChatMessage((msg) => {
    addChatMessage(msg.text, msg.from);
});

window.electronAPI.onChatHistory((msgs) => {
    const container = document.getElementById('chatMessages');
    container.innerHTML = '';
    msgs.forEach(msg => addChatMessage(msg.text, msg.from));
});

// ─── Identity ────────────────────────────────────────────────

async function generateIdentity() {
    const res = await window.electronAPI.generateIdentity();
    if (res.success) {
        currentMnemonic = res.mnemonic;
        currentOnion = res.onionAddress;
        displayIdentity(res.words, res.onionAddress);
    } else {
        alert('Error: ' + res.error);
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

    const res = await window.electronAPI.restoreIdentity(words.join(' '));
    if (res.success) {
        currentMnemonic = res.mnemonic;
        currentOnion = res.onionAddress;
        displayIdentity(res.words, res.onionAddress);
        hideRestoreInput();
    } else {
        alert('Invalid mnemonic: ' + res.error);
    }
}

function displayIdentity(words, onionAddress) {
    const grid = document.getElementById('wordGrid');
    grid.innerHTML = '';
    words.forEach((word, i) => {
        const chip = document.createElement('div');
        chip.className = 'word-chip';
        chip.setAttribute('data-index', i + 1);
        chip.textContent = word;
        grid.appendChild(chip);
    });

    document.getElementById('onionText').textContent = onionAddress;
    document.getElementById('wordDisplay').classList.remove('hidden');
    document.getElementById('roleTabs').classList.remove('hidden');
    
    switchRole('scanner');
    setStatus('offline', 'Identity loaded — Ready');
}

// ─── Roles ───────────────────────────────────────────────────

function switchRole(role) {
    currentRole = role;
    
    // Update tab styles
    const tabS = document.getElementById('tabScanner');
    const tabB = document.getElementById('tabBeacon');
    
    if (role === 'scanner') {
        tabS.style.borderColor = 'var(--accent-purple)';
        tabS.style.background = 'rgba(124, 58, 237, 0.1)';
        tabB.style.borderColor = 'var(--border)';
        tabB.style.background = 'transparent';
        
        document.getElementById('scannerCard').classList.remove('hidden');
        document.getElementById('beaconCard').classList.add('hidden');
    } else {
        tabB.style.borderColor = 'var(--accent-purple)';
        tabB.style.background = 'rgba(124, 58, 237, 0.1)';
        tabS.style.borderColor = 'var(--border)';
        tabS.style.background = 'transparent';
        
        document.getElementById('beaconCard').classList.remove('hidden');
        document.getElementById('scannerCard').classList.add('hidden');
    }
}

async function startScanner() {
    if (!currentMnemonic) return;

    document.getElementById('scannerCard').classList.add('hidden');
    document.getElementById('roleTabs').classList.add('hidden');
    document.getElementById('runningCard').classList.remove('hidden');
    document.getElementById('systemLog').innerHTML = '';
    
    setStatus('connecting', 'Starting Tor hidden service...');
    addLog('Initializing scanner...', 'info');

    const res = await window.electronAPI.startScanner(currentMnemonic);
    if (!res.success) {
        addLog(`Error: ${res.error}`, 'error');
        setStatus('offline', 'Failed to start');
    } else {
        addLog(res.message, 'info');
        if (res.torBinary) addLog(`Tor binary: ${res.torBinary}`, 'info');
    }
}

async function startBeacon() {
    const target = document.getElementById('targetAddress').value.trim();
    if (!target) return alert('Enter a .onion address');

    document.getElementById('beaconCard').classList.add('hidden');
    document.getElementById('roleTabs').classList.add('hidden');
    document.getElementById('runningCard').classList.remove('hidden');
    document.getElementById('systemLog').innerHTML = '';
    
    setStatus('connecting', 'Starting Tor SOCKS client...');
    addLog('Initializing beacon...', 'info');
    addLog(`Target: ${target}`, 'info');

    const res = await window.electronAPI.startBeacon(target);
    if (!res.success) {
        addLog(`Error: ${res.error}`, 'error');
        setStatus('offline', 'Failed to start');
    } else {
        addLog(res.message, 'info');
    }
}

async function stopSession() {
    await window.electronAPI.stopSession();
    setStatus('offline', 'Session stopped');
    
    document.getElementById('runningCard').classList.add('hidden');
    document.getElementById('chatCard').classList.add('hidden');
    document.getElementById('chatMessages').innerHTML = '';
    
    if (currentMnemonic) {
        document.getElementById('roleTabs').classList.remove('hidden');
        switchRole(currentRole);
    }
}

// ─── Chat ────────────────────────────────────────────────────

function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;

    window.electronAPI.sendChatMessage(text);
    input.value = '';
}

function addChatMessage(text, from) {
    const container = document.getElementById('chatMessages');
    const line = document.createElement('div');
    line.className = 'chat-line';

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const name = from === 'self' ? 'You' : 'Peer';
    
    line.innerHTML = `
        <span class="chat-line__meta chat-line__meta--${from}">[${time}] ${name}:</span>
        <span class="chat-line__text">${escapeHtml(text)}</span>
    `;

    container.appendChild(line);
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
    const log = document.getElementById('systemLog');
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
