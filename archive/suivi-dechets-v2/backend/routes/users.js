const express = require('express');
const auth = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const audit = require('../middleware/audit');
const User = require('../models/User');

const router = express.Router();

// GET /api/users - List all users (ADMIN_GESTIONNAIRE)
router.get('/', auth, rbac('users:read'), async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const users = await User.listAll(limit, offset);
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id/status - Toggle active status
router.put('/:id/status', auth, rbac('users:create'), async (req, res, next) => {
  try {
    const { actif } = req.body;
    await User.updateActif(req.params.id, actif);
    res.json({ message: `Statut de l'utilisateur mis à jour (${actif})` });
  } catch (err) {
    next(err);
  }
}, audit('update_status', 'users'));

// PUT /api/users/profile - Update own profile
router.put('/profile', auth, rbac('profile:update'), async (req, res, next) => {
  try {
    // In a full app, this would update name, preferences, etc.
    res.json({ message: 'Profil mis à jour avec succès (Placeholder).' });
  } catch (err) {
    next(err);
  }
}, audit('update_profile', 'users'));

module.exports = router;
