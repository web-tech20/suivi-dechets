function setupEsp32Socket(io, db) {
  io.on('connection', (socket) => {
    socket.on('esp32:register', (esp32Id) => {
      if (!esp32Id) return;
      const room = `esp32_${esp32Id}`;
      socket.join(room);
      console.log(`📡 ESP32 ${esp32Id} connecté`);
      socket.emit('esp32:registered', { status: 'ok', interval: 60 });
    });

    socket.on('esp32:command', (data = {}) => {
      const { esp32_id: esp32Id, command, params } = data;
      if (!esp32Id || !command) return;

      db.prepare(`
        INSERT INTO iot_logs (esp32_id, method, endpoint, payload, response_code, response_time_ms)
        VALUES (?, 'COMMAND', ?, ?, 200, 0)
      `).run(
        esp32Id,
        command,
        JSON.stringify(params || {})
      );

      io.to(`esp32_${esp32Id}`).emit('command', { command, params: params || {} });
      socket.emit('command:ack', { esp32_id: esp32Id, command, status: 'sent' });
    });
  });
}

module.exports = { setupEsp32Socket };
