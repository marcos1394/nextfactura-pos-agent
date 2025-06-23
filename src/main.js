// src/main.js

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const fetch = require('node-fetch');
const sql = require('mssql');

// Inicializa un almacenamiento persistente para la configuración del agente
const store = new Store();

let mainWindow;
let isConnected = false;
let longPollController;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        icon: path.join(__dirname, 'assets/icon.png')
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

    // Abre las DevTools para depuración. Comentar en producción.
    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- Lógica de Comunicación con el Backend ---

function logToUI(level, message) {
    if (mainWindow) {
        mainWindow.webContents.send('log-message', { level, message });
    }
}

function updateStatus(status, message) {
    isConnected = (status === 'connected');
    if (mainWindow) {
        mainWindow.webContents.send('connection-status', { status, message });
    }
}

async function startLongPolling(apiKey) {
    if (!apiKey) {
        updateStatus('disconnected', 'Clave de Enlace no configurada.');
        return;
    }
    
    updateStatus('connecting', 'Conectando con la plataforma NextManager...');
    logToUI('info', 'Iniciando conexión persistente...');

    longPollController = new AbortController();
    const signal = longPollController.signal;

    while (true) {
        if (signal.aborted) {
            logToUI('warn', 'La conexión fue detenida.');
            updateStatus('disconnected', 'Desconectado.');
            break;
        }

        try {
            const agentServiceUrl = store.get('agentServiceUrl', 'https://tu-api-gateway.com/api/agent-service');
            const response = await fetch(`${agentServiceUrl}/listen`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                signal
            });

            if (response.status === 200) {
                const task = await response.json();
                updateStatus('connected', 'Conectado. Esperando tareas...');
                logToUI('info', `Tarea recibida: ${task.type} (ID: ${task.id})`);
                processTask(task, apiKey);
            } else if (response.status === 204) { // No Content, sin tareas
                updateStatus('connected', 'Conectado. Sin tareas pendientes.');
            } else {
                 throw new Error(`Error del servidor: ${response.status}`);
            }

        } catch (error) {
            if (error.name === 'AbortError') break;
            logToUI('error', `Error de conexión: ${error.message}. Reintentando en 10 segundos.`);
            updateStatus('disconnected', `Error de conexión. Reintentando...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}

async function processTask(task, apiKey) {
    logToUI('info', `Procesando tarea ${task.id}...`);
    let result = {};
    try {
        if (task.type === 'EXECUTE_QUERY') {
            const posConfig = store.get('posConfig'); // Se asume que el usuario la configuró
            const pool = await sql.connect(posConfig);
            const queryResult = await pool.request().query(task.payload.query);
            result = { success: true, data: queryResult.recordset };
        } else {
            throw new Error('Tipo de tarea no reconocido.');
        }
    } catch (error) {
        logToUI('error', `Error al procesar tarea ${task.id}: ${error.message}`);
        result = { success: false, error: error.message };
    } finally {
        const agentServiceUrl = store.get('agentServiceUrl');
        // Enviar resultado de vuelta al servidor
        fetch(`${agentServiceUrl}/submit-result`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ taskId: task.id, result })
        }).catch(err => logToUI('error', `No se pudo enviar el resultado de la tarea: ${err.message}`));
    }
}

// --- IPC: Comunicación entre UI y Backend del Agente ---

ipcMain.on('save-api-key', (event, apiKey) => {
    store.set('apiKey', apiKey);
    logToUI('info', 'Clave de Enlace guardada.');
    if (longPollController) {
        longPollController.abort();
    }
    startLongPolling(apiKey);
});

ipcMain.on('get-initial-data', (event) => {
    const apiKey = store.get('apiKey');
    event.reply('initial-data', { apiKey });
    if (apiKey) {
        startLongPolling(apiKey);
    }
});

