const express = require('express');
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const audit = require('../middleware/audit');
const Tournee = require('../models/Tournee');
const Bin = require('../models/Bin');
const optimizationService = require('../services/optimization');
const pdfGenerator = require('../services/pdfGenerator');
const emailService = require('../services/emailService');

const router = express.Router();

// GET /api/tournees - List tours
router.get('/', auth, rbac('tournees:read'), async (req, res, next) => {
  try {
    // If collector, only return their active tours
    if (req.user.role === 'COLLECTEUR') {
      const tours = await Tournee.listActiveByCollector(req.user.id);
      return res.json(tours);
    }
    
    const tours = await Tournee.listAll();
    res.json(tours);
  } catch (err) {
    next(err);
  }
});

// GET /api/tournees/:id - Get specific tour details
router.get('/:id', auth, rbac('tournees:read'), async (req, res, next) => {
  try {
    const tour = await Tournee.findById(req.params.id);
    if (!tour) return res.status(404).json({ error: 'Tournée non trouvée' });
    res.json(tour);
  } catch (err) {
    next(err);
  }
});

// POST /api/tournees/optimize - Generate new optimal route
router.post('/optimize', auth, rbac('tournees:create'), async (req, res, next) => {
  try {
    const { binIds, collectorId } = req.body;
    if (!binIds || !Array.isArray(binIds) || binIds.length === 0) {
      return res.status(400).json({ error: 'Aucune poubelle sélectionnée.' });
    }

    // 1. Fetch bin coordinates
    const allBins = await Bin.listAllWithLatestReading();
    // Filter selected bins + dummy depot at index 0 (assuming Abomey-Calavi town hall)
    const depot = { id: 'DEPOT', latitude: 6.4486, longitude: 2.4187, nom: 'Dépôt Central' };
    const selectedBins = allBins.filter(b => binIds.includes(b.id));
    
    if (selectedBins.length === 0) {
      return res.status(400).json({ error: 'Poubelles invalides.' });
    }

    const pointsToOptimize = [depot, ...selectedBins];

    // 2. Run optimization
    const result = await optimizationService.optimizeTSP(pointsToOptimize);
    
    // 3. Create tour in DB
    const fuelEstimate = Math.round((result.distanceKm / 100) * 15 * 10) / 10; // 15L/100km
    const unoptimizedDist = result.distanceKm * 1.4; // roughly 40% worse
    const co2Saved = Math.round((unoptimizedDist - result.distanceKm) * 0.264 * 10) / 10;

    const tourId = uuidv4();
    const newTour = await Tournee.create({
      id: tourId,
      nom: `Tournée du ${new Date().toLocaleDateString('fr-FR')}`,
      distanceTotale: result.distanceKm,
      dureeEstimee: result.durationMinutes,
      carburantEstime: fuelEstimate,
      co2Economise: co2Saved,
      collecteurId: collectorId
    });

    // Extract points (excluding depot) to save in DB maintaining order
    const dbPoints = result.route
      .filter(p => p.id !== 'DEPOT')
      .map((p, index) => ({ poubelleId: p.id, ordre: index + 1 }));
      
    await Tournee.addPoints(tourId, dbPoints);

    res.status(201).json({ ...newTour, route: result.route });
  } catch (err) {
    next(err);
  }
}, audit('create', 'tournees'));

// POST /api/tournees/:id/export - Generate PDF and email
router.post('/:id/export', auth, rbac('tournees:export'), async (req, res, next) => {
  try {
    const tour = await Tournee.findById(req.params.id);
    if (!tour) return res.status(404).json({ error: 'Tournée non trouvée' });

    // Generate PDF
    const pdfBuffer = await pdfGenerator.generateTourneePDF(tour);

    // If an email is provided in body, send it
    if (req.body.email) {
      await emailService.sendTourneeReport(req.body.email, tour, pdfBuffer);
      return res.json({ message: `Rapport envoyé à ${req.body.email}` });
    }

    // Otherwise return PDF as download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Tournee_${tour.nom.replace(/ /g, '_')}.pdf`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}, audit('export', 'tournees'));

module.exports = router;
