const express = require('express');
const auth = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const Reading = require('../models/Reading');
const Alert = require('../models/Alert');
const notificationService = require('../services/notificationService');

const router = express.Router();

// GET /api/readings/:binId - Get reading history for a bin
router.get('/:binId', auth, rbac('bins:read'), async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 48;
    const history = await Reading.getHistoryByBin(req.params.binId, limit);
    res.json(history);
  } catch (err) {
    next(err);
  }
});

// POST /api/readings - Simulate or receive new IoT reading
// Note: This endpoint might not use 'auth' if called by an actual IoT device, 
// or it would use a specific API key. Using auth here for simulation purposes.
router.post('/', async (req, res, next) => {
  try {
    const { poubelleId, niveauRemplissage, temperature, batterie, signalForce } = req.body;
    
    if (!poubelleId || niveauRemplissage === undefined) {
      return res.status(400).json({ error: 'Données incomplètes.' });
    }

    const reading = await Reading.create({
      poubelleId,
      niveauRemplissage,
      temperature,
      batterie,
      signalForce
    });

    // Broadcast reading via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.emit('reading_update', reading);
    }

    // Check for alerts
    if (niveauRemplissage >= 80) {
      const severity = niveauRemplissage >= 95 ? 'critical' : 'urgent';
      const type = 'remplissage';
      const msg = `Niveau critique atteint: ${niveauRemplissage}%`;
      
      const newAlert = await Alert.create({
        poubelleId,
        type,
        message: msg,
        niveau: niveauRemplissage,
        severite: severity
      });

      if (io) {
        io.emit('new_alert', newAlert);
      }

      // Dispatch notification
      await notificationService.dispatch(null, 'Alarme de remplissage', msg, severity);
    }

    res.status(201).json(reading);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
