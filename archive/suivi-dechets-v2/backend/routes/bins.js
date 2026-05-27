const express = require('express');
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const audit = require('../middleware/audit');
const Bin = require('../models/Bin');

const router = express.Router();

// GET /api/bins - List all bins
router.get('/', auth, rbac('bins:read'), async (req, res, next) => {
  try {
    const bins = await Bin.listAllWithLatestReading();
    res.json(bins);
  } catch (err) {
    next(err);
  }
});

// GET /api/bins/urgent - List bins needing collection
router.get('/urgent', auth, rbac('bins:read'), async (req, res, next) => {
  try {
    const threshold = parseInt(req.query.threshold) || 70;
    const bins = await Bin.listUrgentBins(threshold);
    res.json(bins);
  } catch (err) {
    next(err);
  }
});

// POST /api/bins - Create a new bin
router.post('/', auth, rbac('bins:create'), async (req, res, next) => {
  try {
    const { nom, latitude, longitude, quartier, adresse, type, capaciteLitres } = req.body;
    
    if (!nom || !latitude || !longitude || !quartier) {
      return res.status(400).json({ error: 'Champs obligatoires manquants.' });
    }

    const newBin = await Bin.create({
      id: uuidv4(),
      nom,
      latitude,
      longitude,
      quartier,
      adresse,
      type,
      capaciteLitres
    });

    res.status(201).json(newBin);
  } catch (err) {
    if (err.code === '23505') { // Postgres unique violation
      return res.status(400).json({ error: 'Une poubelle avec ce nom existe déjà.' });
    }
    next(err);
  }
}, audit('create', 'bins'));

// PUT /api/bins/:id - Update bin
router.put('/:id', auth, rbac('bins:update'), async (req, res, next) => {
  try {
    const updated = await Bin.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Poubelle non trouvée.' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}, audit('update', 'bins'));

// DELETE /api/bins/:id - Delete bin
router.delete('/:id', auth, rbac('bins:delete'), async (req, res, next) => {
  try {
    const success = await Bin.delete(req.params.id);
    if (!success) return res.status(404).json({ error: 'Poubelle non trouvée.' });
    res.json({ message: 'Poubelle supprimée avec succès.' });
  } catch (err) {
    next(err);
  }
}, audit('delete', 'bins'));

module.exports = router;
