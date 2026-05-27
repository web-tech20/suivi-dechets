const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const passport = require('passport');
const User = require('../models/User');
const { authLimiter } = require('../middleware/rateLimit');
const emailService = require('../services/emailService');
const audit = require('../middleware/audit');
const auth = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();
const jwtSecret = process.env.JWT_SECRET || 'ultra_super_secret_key_2026';
const refreshSecret = process.env.JWT_REFRESH_SECRET || 'refresh_secret_key_2026';

const generateTokens = (user) => {
  const payload = { id: user.id, role: user.role };
  const accessToken = jwt.sign(payload, jwtSecret, { expiresIn: process.env.JWT_EXPIRES_IN || '15m' });
  const refreshToken = jwt.sign(payload, refreshSecret, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });
  return { accessToken, refreshToken };
};

// POST /api/auth/login
router.post('/login', authLimiter, (req, res, next) => {
  passport.authenticate('local', { session: false }, async (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ error: info.message || 'Authentification échouée.' });

    try {
      const { accessToken, refreshToken } = generateTokens(user);
      await User.updateRefreshToken(user.id, refreshToken);
      
      res.json({
        message: 'Connexion réussie',
        accessToken,
        refreshToken,
        user: { id: user.id, nom: user.nom, email: user.email, role: user.role }
      });
    } catch (e) {
      next(e);
    }
  })(req, res, next);
}, audit('login', 'auth'));

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { nom, email, password } = req.body;
    
    const existing = await User.findByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'Cet email est déjà utilisé.' });
    }

    const tokenVerification = uuidv4();
    const newUser = await User.create({
      id: uuidv4(),
      nom,
      email,
      password,
      role: 'OBSERVATEUR',
      emailVerifie: false,
      tokenVerification
    });

    // Send verification email asynchronously
    emailService.sendVerificationEmail(email, tokenVerification, nom).catch(console.error);

    res.status(201).json({
      message: 'Inscription réussie. Veuillez vérifier votre email pour activer le compte.',
      user: { id: newUser.id, nom: newUser.nom, email: newUser.email, role: newUser.role }
    });
  } catch (err) {
    next(err);
  }
}, audit('register', 'auth'));

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token requis.' });

  try {
    const payload = jwt.verify(refreshToken, refreshSecret);
    const user = await User.findById(payload.id);
    
    // In a real app, verify the refresh token matches the one in DB
    if (!user || !user.actif) {
      return res.status(401).json({ error: 'Token invalide ou compte inactif.' });
    }

    const tokens = generateTokens(user);
    await User.updateRefreshToken(user.id, tokens.refreshToken);

    res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  } catch (err) {
    res.status(401).json({ error: 'Refresh token invalide ou expiré.' });
  }
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  res.json({
    id: req.user.id,
    nom: req.user.nom,
    email: req.user.email,
    role: req.user.role,
    emailVerifie: req.user.email_verifie
  });
});

module.exports = router;
