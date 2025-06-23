// src/renderer/renderer.js

document.addEventListener('DOMContentLoaded', () => {
    const statusLight = document.getElementById('status-light');
    const statusText = document.getElementById('status-text');
    const apiKeyInput = document.getElementById('api-key');
    const saveBtn = document.getElementById('save-btn');
    const testBtn = document.getElementById('test-btn');
    const logsContainer = document.getElementById('logs-container');

    const posServerInput = document.getElementById('pos-server');
    const posDbInput = document.getElementById('pos-db');
    const posUserInput = document.getElementById('pos-user');
    const posPassInput = document.getElementById('pos-pass');

    function setStatus(status, message) {
        statusLight.className = 'status-light'; // Reset
        let lightClass = 'grey';
        if (status === 'connected') lightClass = 'green';
        if (status === 'connecting') lightClass = 'yellow';
        if (status === 'busy') lightClass = 'yellow';
        if (status === 'disconnected') lightClass = 'red';
        statusLight.classList.add(lightClass);
        statusText.textContent = message;
    }

    function addLog(level, message) {
        const logEntry = document.createElement('p');
        const timestamp = new Date().toLocaleTimeString('es-MX');
        logEntry.innerHTML = `<span class="log-time">${timestamp}</span> <span class="log-${level}">[${level.toUpperCase()}]</span> ${message}`;
        logsContainer.appendChild(logEntry);
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    function getPosConfigFromUI() {
        return {
            server: posServerInput.value,
            database: posDbInput.value,
            user: posUserInput.value,
            password: posPassInput.value,
        };
    }

    saveBtn.addEventListener('click', () => {
        const apiKey = apiKeyInput.value;
        const posConfig = getPosConfigFromUI();
        
        if (apiKey && posConfig.server && posConfig.database && posConfig.user) {
            window.electronAPI.saveSettings({ apiKey, posConfig });
            addLog('info', 'Guardando configuración y reiniciando conexión...');
        } else {
            addLog('warn', 'Por favor, completa todos los campos de configuración.');
        }
    });

    testBtn.addEventListener('click', () => {
        const posConfig = getPosConfigFromUI();
        if (posConfig.server && posConfig.database && posConfig.user) {
            window.electronAPI.testPosConnection(posConfig);
            addLog('info', 'Enviando prueba de conexión a la base de datos del POS...');
        } else {
            addLog('warn', 'Completa los campos de la base de datos para probar la conexión.');
        }
    });

    // --- Listeners para eventos del backend ---

    window.electronAPI.onLogMessage((log) => addLog(log.level, log.message));
    window.electronAPI.onConnectionStatus((statusInfo) => setStatus(statusInfo.status, statusInfo.message));
    
    window.electronAPI.onTestPosConnectionResult((result) => {
        if (result.success) {
            addLog('success', '¡Prueba de conexión exitosa!');
        } else {
            addLog('error', `Prueba de conexión fallida: ${result.error}`);
        }
    });

    window.electronAPI.onInitialData((data) => {
        if (data.apiKey) {
            apiKeyInput.value = data.apiKey;
            addLog('info', 'Clave de Enlace cargada desde la configuración.');
        }
        if (data.posConfig) {
            posServerInput.value = data.posConfig.server || '';
            posDbInput.value = data.posConfig.database || '';
            posUserInput.value = data.posConfig.user || '';
            posPassInput.value = data.posConfig.password || '';
            addLog('info', 'Configuración del POS cargada.');
        }
        if (!data.apiKey) {
            addLog('warn', 'Bienvenido. Por favor, configura tu Clave de Enlace y los datos del POS.');
        }
    });

    window.electronAPI.getInitialData();
});
