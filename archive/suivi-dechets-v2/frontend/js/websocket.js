import { showToast } from './app.js';
import { updateBinMarker } from './google-maps.js';
import { refreshAlerts } from './alerts.js';

let socket;

export function connectWebSocket() {
  const statusIndicator = document.getElementById('connection-status');
  
  socket = io();

  socket.on('connect', () => {
    console.log('🔗 WebSocket connecté');
    statusIndicator.classList.add('online');
    statusIndicator.title = 'Connecté au serveur en temps réel';
  });

  socket.on('disconnect', () => {
    console.log('❌ WebSocket déconnecté');
    statusIndicator.classList.remove('online');
    statusIndicator.title = 'Connexion perdue';
    showToast('Connexion temps réel perdue', 'warning');
  });

  // Handle IoT Sensor Reading Updates
  socket.on('reading_update', (data) => {
    // Update map marker instantly
    updateBinMarker(data.poubelleId, data);
  });

  // Handle New Alerts
  socket.on('new_alert', (alert) => {
    showToast(`Nouvelle Alerte: ${alert.message}`, 'error');
    refreshAlerts();
    
    // Play alert sound if critical
    if (alert.severite === 'critical') {
      try {
        new Audio('data:audio/wav;base64,UklGRl9vT19...').play(); // Placeholder for actual sound
      } catch(e) {}
    }
  });

  // Handle Alert Resolutions
  socket.on('alert_resolved', () => {
    refreshAlerts();
  });
}

export function getSocket() {
  return socket;
}
