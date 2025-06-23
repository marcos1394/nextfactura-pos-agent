// src/renderer/renderer.js

const statusIndicator = document.getElementById('status-indicator');
const statusLight = statusIndicator.querySelector('.status-light');
const statusText = document.getElementById('status-text');
const apiKeyInput = document.getElementById('api-key');
const saveBtn = document.getElementById('save-btn');
const logsContainer = document.getElementById('logs-container');

function setStatus(status, message) {
    statusLight.className = 'status-light'; // Reset
    if (status === 'connected') {
        statusLight.classList.add('green');
    } else if (status === 'connecting') {
        statusLight.classList.add('yellow');
    } else {
        statusLight.classList.add('red');
    }
    statusText.textContent = message;
}

function addLog(level, message) {
    const logEntry = document.createElement('p');
    const timestamp = new Date().toLocaleTimeString();
    logEntry.innerHTML = `<span class="log-time">${timestamp}</span> <span class="log-${level}">[${level.toUpperCase()}]</span> ${message}`;
    logsContainer.appendChild(logEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

saveBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value;
    if (apiKey) {
        window.electronAPI.saveApiKey(apiKey);
        addLog('info', 'Intentando guardar nueva Clave de Enlace.');
    } else {
        addLog('warn', 'El campo de Clave de Enlace está vacío.');
    }
});

// --- Eventos recibidos desde el proceso principal ---

window.electronAPI.onLogMessage((log) => {
    addLog(log.level, log.message);
});

window.electronAPI.onConnectionStatus((statusInfo) => {
    setStatus(statusInfo.status, statusInfo.message);
});

window.electronAPI.onInitialData((data) => {
    if (data.apiKey) {
        apiKeyInput.value = data.apiKey;
        addLog('info', 'Clave de Enlace cargada desde la configuración.');
    } else {
        addLog('info', 'Bienvenido. Por favor, configura tu Clave de Enlace.');
    }
});

// Solicitar datos iniciales al cargar la UI
window.electronAPI.getInitialData();
