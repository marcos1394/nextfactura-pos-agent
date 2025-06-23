// src/main.js

const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const Store = require('electron-store');
const fetch = require('node-fetch');
const sql = require('mssql');
const fs = require('fs').promises; // Usamos fs.promises para I/O asíncrono


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
        frame: false, // Para una apariencia más moderna
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: 15, y: 15 },
    });

    nativeTheme.themeSource = 'dark';
    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
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
            logToUI('warn', 'Conexión detenida por el usuario.');
            updateStatus('disconnected', 'Desconectado');
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
    let resultPayload = {};
    try {
        if (task.type === 'EXECUTE_QUERY') {
            const posConfig = store.get('posConfig');
            if (!posConfig) throw new Error('La configuración del POS no ha sido guardada.');

            logToUI('info', `Conectando a la BD local: ${posConfig.server}...`);
            const pool = await sql.connect(posConfig);
            const queryResult = await pool.request().query(task.payload.query);
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

// --- NUEVO: Lógica de Autodetección ---
async function autoDetectPosConfig() {
    // Esta función busca en rutas comunes el archivo de configuración de SoftRestaurant.
    // La ruta exacta puede variar según la versión del software.
    const commonPaths = [
        'C:/Program Files (x86)/SoftRestaurant/SoftRestaurant10.0/sr.config',
        'C:/Program Files (x86)/SoftRestaurant/SoftRestaurant9.5/sr.config',
        'C:/SoftRestaurant/sr.config'
    ];

    for (const configPath of commonPaths) {
        try {
            await fs.access(configPath); // Verifica si el archivo existe
            logToUI('info', `Archivo de configuración encontrado en: ${configPath}`);
            const fileContent = await fs.readFile(configPath, 'utf8');
            
            // Lógica para parsear el archivo de configuración (puede ser XML, INI, etc.)
            // Esto es un EJEMPLO para un formato tipo "KEY=VALUE"
            const config = {};
            const lines = fileContent.split('\n');
            lines.forEach(line => {
                if (line.includes('DataSource')) config.server = line.split('=')[1].trim();
                if (line.includes('InitialCatalog')) config.database = line.split('=')[1].trim();
                if (line.includes('UserID')) config.user = line.split('=')[1].trim();
            });

            if (config.server && config.database && config.user) {
                return { success: true, config };
            }

        } catch (error) {
            // El archivo no existe en esta ruta, continúa con la siguiente.
        }
    }
    // Si el bucle termina sin encontrar nada
    return { success: false, error: 'No se encontró el archivo de configuración de SoftRestaurant.' };
}


// --- IPC Handlers ---

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

ipcMain.on('test-pos-connection', async (event, posConfig) => {
    try {
        logToUI('info', `Probando conexión a ${posConfig.server}...`);
        const pool = await sql.connect(posConfig);
        await pool.close();
        logToUI('success', '¡Conexión a la base de datos del POS exitosa!');
        event.reply('test-pos-connection-result', { success: true });
    } catch (error) {
        logToUI('error', `Fallo en la conexión al POS: ${error.message}`);
        event.reply('test-pos-connection-result', { success: false, error: error.message });
    }
});
