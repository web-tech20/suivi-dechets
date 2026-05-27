const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// ── WebSocket Server ──────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Attach io to global namespace or app for use in routes/controllers
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`🔌 Client connecté au WebSocket Gateway: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`❌ Client déconnecté: ${socket.id}`);
  });
});

// ── Launch HTTP Server ────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║  🗑️  SUIVI-DÉCHETS V2.0 — Enterprise Server   ║
  ║  🌐  API Gateway: http://localhost:${PORT}      ║
  ║  📡  WebSocket Active on same port            ║
  ║  🔐  JWT Security & RBAC Active               ║
  ╚═══════════════════════════════════════════════╝
  `);
});
