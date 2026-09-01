const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Identity
    generateIdentity: () => ipcRenderer.invoke('generate-identity'),
    restoreIdentity: (mnemonic) => ipcRenderer.invoke('restore-identity', mnemonic),
    
    // Roles
    startScanner: (mnemonic) => ipcRenderer.invoke('start-scanner', mnemonic),
    startBeacon: (targetAddress) => ipcRenderer.invoke('start-beacon', targetAddress),
    stopSession: () => ipcRenderer.invoke('stop-session'),
    
    // Chat
    sendChatMessage: (text) => ipcRenderer.send('send-chat-message', text),
    
    // Listeners from Main Process
    onTorBootstrap: (callback) => ipcRenderer.on('tor-bootstrap', (_event, progress) => callback(progress)),
    onScannerReady: (callback) => ipcRenderer.on('scanner-ready', (_event, data) => callback(data)),
    onScannerError: (callback) => ipcRenderer.on('scanner-error', (_event, error) => callback(error)),
    onBeaconReady: (callback) => ipcRenderer.on('beacon-ready', (_event, data) => callback(data)),
    onBeaconError: (callback) => ipcRenderer.on('beacon-error', (_event, error) => callback(error)),
    onPeerConnected: (callback) => ipcRenderer.on('peer-connected', (_event, count) => callback(count)),
    onPeerDisconnected: (callback) => ipcRenderer.on('peer-disconnected', (_event, count) => callback(count)),
    onChatMessage: (callback) => ipcRenderer.on('chat-message', (_event, msg) => callback(msg)),
    onChatHistory: (callback) => ipcRenderer.on('chat-history', (_event, msgs) => callback(msgs)),
});
