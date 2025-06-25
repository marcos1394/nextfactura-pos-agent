// src/main.js

const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const Store = require('electron-store');
const fetch = require('node-fetch');
const sql = require('mssql');

// Almacenamiento persistente para la configuración
const store = new Store();

let mainWindow;
let longPollController;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 850,
        height: 680,
        minWidth: 700,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
        icon: path.join(__dirname, 'assets/icon.png'),
        title: "NextManager POS Agent",
        frame: false,
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: 15, y: 15 },
    });

    nativeTheme.themeSource = 'dark';
    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- Lógica de Comunicación ---

const logToUI = (level, message) => mainWindow?.webContents.send('log-message', { level, message });
const updateStatus = (status, message) => mainWindow?.webContents.send('connection-status', { status, message });

async function startLongPolling(apiKey) {
    if (!apiKey) {
        updateStatus('disconnected', 'Clave de Enlace no configurada');
        return;
    }
    
    updateStatus('connecting', 'Conectando con plataforma...');
    logToUI('info', 'Iniciando conexión persistente...');

    longPollController = new AbortController();
    const signal = longPollController.signal;

    while (true) {
        if (signal.aborted) {
            logToUI('warn', 'La conexión fue detenida.');
            updateStatus('disconnected', 'Desconectado');
            break;
        }

        try {
            const agentServiceUrl = store.get('agentServiceUrl', 'https://tu-api-gateway.com/api/agent-service'); // URL de tu backend
            const response = await fetch(`${agentServiceUrl}/listen`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                signal,
                timeout: 60000 // Timeout de 60 segundos
            });

            if (response.status === 200) {
                const task = await response.json();
                updateStatus('busy', 'Tarea recibida. Procesando...');
                logToUI('info', `Tarea recibida: ${task.type} (ID: ${task.id})`);
                await processTask(task, apiKey);
            } else if (response.status === 204) {
                updateStatus('connected', 'Conectado. Esperando tareas...');
            } else {
                 const errorData = await response.text();
                 throw new Error(`Error del servidor: ${response.status} - ${errorData}`);
            }
        } catch (error) {
            if (error.name === 'AbortError') break;
            logToUI('error', `Error de conexión: ${error.message}. Reintentando en 15s.`);
            updateStatus('disconnected', 'Error de conexión');
            await new Promise(resolve => setTimeout(resolve, 15000));
        }
    }
}

async function processTask(task, apiKey) {
    logToUI('info', `Procesando tarea ${task.id}...`);
    let resultPayload = {};
    try {
        if (task.type === 'EXECUTE_QUERY') {
            const posConfig = store.get('posConfig');
            if (!posConfig) throw new Error('La configuración del POS no ha sido guardada.');

            logToUI('info', `Conectando a la BD local: ${posConfig.server}...`);
            const pool = await sql.connect(posConfig);
            const queryResult = await pool.request().query(task.payload.query);
            await pool.close();
            logToUI('success', `Consulta ejecutada. Filas devueltas: ${queryResult.recordset.length}`);
            resultPayload = { success: true, data: queryResult.recordset };
        } else {
            throw new Error('Tipo de tarea no reconocido.');
        }
    } catch (error) {
        logToUI('error', `Error al procesar tarea: ${error.message}`);
        resultPayload = { success: false, error: error.message };
    } finally {
        const agentServiceUrl = store.get('agentServiceUrl');
        fetch(`${agentServiceUrl}/submit-result`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`},
            body: JSON.stringify({ taskId: task.id, result: resultPayload })
        }).catch(err => logToUI('error', `Fallo al enviar resultado: ${err.message}`));
    }
}

// --- IPC Handlers (Comunicación con la Interfaz) ---

ipcMain.on('save-settings', (event, { apiKey, posConfig }) => {
    store.set('apiKey', apiKey);
    store.set('posConfig', posConfig);
    logToUI('success', 'Configuración guardada exitosamente.');
    
    if (longPollController) longPollController.abort();
    startLongPolling(apiKey);
});

ipcMain.on('get-initial-data', (event) => {
    event.reply('initial-data', {
        apiKey: store.get('apiKey'),
        posConfig: store.get('posConfig')
    });
});

ipcMain.handle('test-pos-connection', async (event, posConfig) => {
    try {
        logToUI('info', `Probando conexión a ${posConfig.server}...`);
        const pool = await sql.connect(posConfig);
        await pool.close();
        return { success: true };
    } catch (error) {
        logToUI('error', `Fallo en la conexión al POS: ${error.message}`);
        return { success: false, error: error.message };
    }
});

// Lógica de Autodetección que intenta la conexión con valores por defecto
ipcMain.handle('auto-detect-defaults', async (event) => {
    logToUI('info', 'Intentando conexión con configuración por defecto de SoftRestaurant...');
    const defaultConfig = {
        server: 'localhost\\NATIONALSOFT',
        database: 'softrestaurant10',
        user: 'sa',
        password: 'National09', // La contraseña por defecto del manual
        options: { trustServerCertificate: true },
        requestTimeout: 5000 // Timeout corto para la prueba
    };

    try {
        const pool = await sql.connect(defaultConfig);
        await pool.close();
        logToUI('success', '¡Conexión por defecto exitosa! Rellenando campos.');
        // No devolvemos la contraseña por seguridad
        return { success: true, config: { server: defaultConfig.server, database: defaultConfig.database, user: defaultConfig.user } };
    } catch (error) {
        logToUI('warn', `La conexión con valores por defecto falló: ${error.message}. Por favor, verifique la configuración manualmente.`);
        return { success: false, error: error.message };
    }
});