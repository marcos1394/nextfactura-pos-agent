// src/renderer/renderer.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Selección de Elementos del DOM ---
    const statusLight = document.getElementById('status-light');
    const statusText = document.getElementById('status-text');
    const apiKeyInput = document.getElementById('api-key');
    const saveBtn = document.getElementById('save-btn');
    const testBtn = document.getElementById('test-btn');
    const detectBtn = document.getElementById('detect-btn');
    const logsContainer = document.getElementById('logs-container');
    const posServerInput = document.getElementById('pos-server');
    const posDbInput = document.getElementById('pos-db');
    const posUserInput = document.getElementById('pos-user');
    const posPassInput = document.getElementById('pos-pass');

    // --- Funciones de Utilidad de la UI ---
    const setStatus = (status, message) => {
        statusLight.className = 'status-light';
        let lightClass = 'grey';
        if (status === 'connected') lightClass = 'green';
        if (status === 'connecting' || status === 'busy') lightClass = 'yellow';
        if (status === 'disconnected') lightClass = 'red';
        statusLight.classList.add(lightClass);
        statusText.textContent = message;
    };
    
    const addLog = (level, message) => {
        const logEntry = document.createElement('p');
        const timestamp = new Date().toLocaleTimeString('es-MX');
        logEntry.innerHTML = `<span class="log-time">${timestamp}</span> <span class="log-${level}">[${level.toUpperCase()}]</span> ${message}`;
        logsContainer.appendChild(logEntry);
        logsContainer.scrollTop = logsContainer.scrollHeight;
    };

    const getPosConfigFromUI = () => ({
        server: posServerInput.value.trim(),
        database: posDbInput.value.trim(),
        user: posUserInput.value.trim(),
        password: posPassInput.value, // No se hace trim a la contraseña
        options: { trustServerCertificate: true },
        requestTimeout: 15000
    });

    // --- Event Listeners ---

    saveBtn.addEventListener('click', () => {
        const apiKey = apiKeyInput.value;
        const posConfig = getPosConfigFromUI();
        if (apiKey && posConfig.server && posConfig.database && posConfig.user) {
            window.electronAPI.saveSettings({ apiKey, posConfig });
        } else {
            addLog('warn', 'Por favor, completa todos los campos de configuración.');
        }
    });

    testBtn.addEventListener('click', async () => {
        const posConfig = getPosConfigFromUI();
        if (posConfig.server && posConfig.database && posConfig.user) {
            const result = await window.electronAPI.testPosConnection(posConfig);
            if (result.success) {
                addLog('success', '¡Prueba de conexión manual exitosa!');
            } else {
                addLog('error', `Prueba de conexión manual fallida: ${result.error}`);
            }
        } else {
            addLog('warn', 'Completa los campos de la BD para probar la conexión.');
        }
    });
    
    detectBtn.addEventListener('click', async () => {
        addLog('info', 'Intentando conexión automática con valores por defecto...');
        const result = await window.electronAPI.autoDetectDefaults();
        if (result.success && result.config) {
            posServerInput.value = result.config.server;
            posDbInput.value = result.config.database;
            posUserInput.value = result.config.user;
            addLog('info', 'Datos rellenados. Por favor, introduce la contraseña y prueba la conexión.');
        }
    });

    // --- Listeners para eventos del Backend ---
    window.electronAPI.onLogMessage((log) => addLog(log.level, log.message));
    window.electronAPI.onConnectionStatus((statusInfo) => setStatus(statusInfo.status, statusInfo.message));
    
    window.electronAPI.onInitialData((data) => {
        if (data.apiKey) {
            apiKeyInput.value = data.apiKey;
            addLog('info', 'Clave de Enlace cargada desde la configuración guardada.');
        }
        if (data.posConfig) {
            posServerInput.value = data.posConfig.server || '';
            posDbInput.value = data.posConfig.database || '';
            posUserInput.value = data.posConfig.user || '';
            addLog('info', 'Configuración del POS cargada.');
        }
        
        if (!data.apiKey) {
            addLog('warn', 'Bienvenido. Por favor, configura tu Clave de Enlace y los datos del POS.');
        } else if (data.apiKey && data.posConfig?.server) {
            // Si ya hay configuración, intenta conectar al iniciar
            window.electronAPI.saveSettings(data);
        }
    });

    window.electronAPI.getInitialData();
});