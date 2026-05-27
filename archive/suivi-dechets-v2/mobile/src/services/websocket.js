import { io } from 'socket.io-client';

// In production, replace with your actual server IP or domain
const WS_URL = 'http://10.0.2.2:3000';

let socket = null;

export const initWebSocket = (onConnect, onDisconnect, onEvent) => {
  socket = io(WS_URL);

  socket.on('connect', () => {
    console.log('Mobile WS connected');
    if (onConnect) onConnect();
  });

  socket.on('disconnect', () => {
    console.log('Mobile WS disconnected');
    if (onDisconnect) onDisconnect();
  });

  socket.on('new_alert', (data) => {
    if (onEvent) onEvent('new_alert', data);
  });

  socket.on('alert_resolved', (data) => {
    if (onEvent) onEvent('alert_resolved', data);
  });

  return () => {
    if (socket) socket.disconnect();
  };
};

export const getSocket = () => socket;
