// src/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
    getInitialData: () => ipcRenderer.send('get-initial-data'),
    testPosConnection: (posConfig) => ipcRenderer.send('test-pos-connection', posConfig),

    onLogMessage: (callback) => ipcRenderer.on('log-message', (_event, value) => callback(value)),
    onConnectionStatus: (callback) => ipcRenderer.on('connection-status', (_event, value) => callback(value)),
    onInitialData: (callback) => ipcRenderer.once('initial-data', (_event, value) => callback(value)),
    onTestPosConnectionResult: (callback) => ipcRenderer.once('test-pos-connection-result', (_event, value) => callback(value))
});
