const express = require('express');
const auth = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const Reading = require('../models/Reading');
const Alert = require('../models/Alert');
const Tournee = require('../models/Tournee');

const router = express.Router();

// GET /api/analytics - Dashboard KPIs
router.get('/', auth, rbac('analytics:read'), async (req, res, next) => {
  try {
    const averageFill = await Reading.getNetworkAverageLevel();
    const activeAlerts = await Alert.countActive();
    
    // Calculate total CO2 and Distance from tournees
    const tournees = await Tournee.listAll(100);
    const totalCo2 = tournees.reduce((acc, t) => acc + (t.co2_economise || 0), 0);
    const totalDistance = tournees.reduce((acc, t) => acc + (t.distance_totale || 0), 0);
    
    const weeklyProduction = await Reading.getWeeklyAggregatedProduction();

    res.json({
      kpis: {
        averageFill,
        activeAlerts,
        totalCo2Economise: Math.round(totalCo2 * 10) / 10,
        totalDistanceKm: Math.round(totalDistance * 10) / 10,
        totalTournees: tournees.length
      },
      charts: {
        weeklyProduction
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
