const express = require('express');
const cors = require('cors');
const passport = require('passport');
const path = require('path');
const { apiLimiter } = require('./middleware/rateLimit');
require('./config/passport'); // Loads strategies

const app = express();

// ── Global Middlewares ────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize passport
app.use(passport.initialize());

// Apply global rate limiting to all REST endpoints
app.use('/api', apiLimiter);

// Serve static assets from frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// ── Mount REST Modular Routes ────────────────────────────────
// The modular route modules will be created in Phase 2
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/bins', require('./routes/bins'));
app.use('/api/readings', require('./routes/readings'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/tournees', require('./routes/tournees'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/ml', require('./routes/ml'));

// SPA Router Fallback - redirects unknown endpoints to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Global Error Handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('💥 Unhandled Server Exception:', err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Une erreur interne est survenue sur le serveur.' 
      : err.message
  });
});

module.exports = app;
