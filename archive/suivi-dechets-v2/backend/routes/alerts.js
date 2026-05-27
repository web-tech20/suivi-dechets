const express = require('express');
const auth = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const audit = require('../middleware/audit');
const Alert = require('../models/Alert');

const router = express.Router();

// GET /api/alerts - List active alerts
router.get('/', auth, rbac('alerts:read'), async (req, res, next) => {
  try {
    const alerts = await Alert.listActive();
    res.json(alerts);
  } catch (err) {
    next(err);
  }
});

// GET /api/alerts/history - List resolved alerts
router.get('/history', auth, rbac('alerts:read'), async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const alerts = await Alert.listHistory(limit);
    res.json(alerts);
  } catch (err) {
    next(err);
  }
});

// PUT /api/alerts/:id/resolve - Resolve an alert
router.put('/:id/resolve', auth, rbac('alerts:resolve'), async (req, res, next) => {
  try {
    const resolved = await Alert.acknowledge(req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Alerte non trouvée.' });
    
    // Broadcast resolution via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.emit('alert_resolved', { id: req.params.id });
    }

    res.json({ message: 'Alerte résolue avec succès.', alert: resolved });
  } catch (err) {
    next(err);
  }
}, audit('resolve', 'alerts'));

module.exports = router;
