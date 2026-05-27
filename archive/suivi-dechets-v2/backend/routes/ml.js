const express = require('express');
const auth = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const audit = require('../middleware/audit');
require('dotenv').config();

const router = express.Router();
const ML_API_URL = process.env.ML_API_URL || 'http://localhost:5001';

// GET /api/ml/predict/:binId - Get LSTM predictions for a bin
router.get('/predict/:binId', auth, rbac('analytics:read'), async (req, res, next) => {
  try {
    // We will call the Python FastAPI service
    // If the service is unreachable (e.g. running locally without python setup),
    // we gracefully degrade to simulated predictions to keep the UI working.
    let pythonData = null;
    try {
      const response = await fetch(`${ML_API_URL}/predict/${req.params.binId}`);
      if (response.ok) {
        pythonData = await response.json();
      }
    } catch (e) {
      console.warn('⚠️ Python ML service unreachable. Using robust JS simulated predictions.', e.message);
    }

    if (pythonData) {
      return res.json(pythonData);
    }

    // Fallback: Simulate LSTM output based on current time
    const currentLvl = Math.round(Math.random() * 40 + 20); // 20-60
    const predicted_6h = Math.min(100, currentLvl + 15);
    const predicted_12h = Math.min(100, predicted_6h + 12);
    const predicted_24h = Math.min(100, predicted_12h + 20);
    const confidence = 0.85 + (Math.random() * 0.1); // 0.85 - 0.95

    const overflowDate = new Date();
    overflowDate.setHours(overflowDate.getHours() + (100 - currentLvl) / 2); // rough estimate

    res.json({
      binId: req.params.binId,
      current: currentLvl,
      predicted_6h,
      predicted_12h,
      predicted_24h,
      confidence: Math.round(confidence * 100) / 100,
      recommended_collection: overflowDate.toISOString(),
      isSimulated: true
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
