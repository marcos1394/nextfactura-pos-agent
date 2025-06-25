// src/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // --- UI -> Main (Acciones que la UI puede invocar) ---
    saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
    getInitialData: () => ipcRenderer.send('get-initial-data'),
    testPosConnection: (posConfig) => ipcRenderer.invoke('test-pos-connection', posConfig),
    autoDetectDefaults: () => ipcRenderer.invoke('auto-detect-defaults'),

    // --- Main -> UI (Eventos que la UI puede escuchar) ---
    onLogMessage: (callback) => ipcRenderer.on('log-message', (_event, value) => callback(value)),
    onConnectionStatus: (callback) => ipcRenderer.on('connection-status', (_event, value) => callback(value)),
    onInitialData: (callback) => ipcRenderer.once('initial-data', (_event, value) => callback(value))
});
