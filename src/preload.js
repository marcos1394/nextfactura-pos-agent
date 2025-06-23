// src/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // UI -> Main
    saveApiKey: (apiKey) => ipcRenderer.send('save-api-key', apiKey),
    getInitialData: () => ipcRenderer.send('get-initial-data'),

    // Main -> UI
    onLogMessage: (callback) => ipcRenderer.on('log-message', (_event, value) => callback(value)),
    onConnectionStatus: (callback) => ipcRenderer.on('connection-status', (_event, value) => callback(value)),
    onInitialData: (callback) => ipcRenderer.once('initial-data', (_event, value) => callback(value))
});
