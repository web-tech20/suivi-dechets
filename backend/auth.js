const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'suivi-dechets-super-secret-key-2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh-secret-key-2026';

let db;

function setDatabase(database) {
  db = database;
}

function generateTokens(user) {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role, nom: user.nom, prenom: user.prenom },
    JWT_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
}

function requireSuperAdmin(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return { error: 'Accès non autorisé' };
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return { error: 'Format token invalide' };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'SUPER_ADMIN') {
      return { error: 'Rôle insuffisant' };
    }

    return { user: decoded };
  } catch (error) {
    return { error: 'Token invalide' };
  }
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ? AND actif = 1').get(email.trim().toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const { accessToken, refreshToken } = generateTokens(user);

    db.prepare('UPDATE users SET refresh_token = ?, last_login = datetime(\'now\') WHERE id = ?')
      .run(refreshToken, user.id);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        nom: user.nom,
        prenom: user.prenom
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

router.post('/register', async (req, res) => {
  try {
    const authCheck = requireSuperAdmin(req);
    if (authCheck.error) {
      return res.status(403).json({ error: authCheck.error });
    }

    const { email, password, nom, prenom, role } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existingUser) {
      return res.status(400).json({ error: 'Cet email est déjà utilisé' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuidv4();
    const userRole = role || 'OBSERVATEUR';

    db.prepare(`
      INSERT INTO users (id, email, password_hash, nom, prenom, role, actif)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(id, normalizedEmail, hashedPassword, nom || '', prenom || '', userRole);

    res.status(201).json({ message: 'Utilisateur créé avec succès' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la création' });
  }
});

router.post('/refresh', (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token requis' });
    }

    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    const user = db.prepare(
      'SELECT * FROM users WHERE id = ? AND refresh_token = ? AND actif = 1'
    ).get(decoded.id, refreshToken);

    if (!user) {
      return res.status(401).json({ error: 'Refresh token invalide' });
    }

    const tokens = generateTokens(user);
    db.prepare('UPDATE users SET refresh_token = ? WHERE id = ?').run(tokens.refreshToken, user.id);

    res.json(tokens);
  } catch (error) {
    res.status(401).json({ error: 'Refresh token expiré' });
  }
});

router.post('/logout', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      db.prepare('UPDATE users SET refresh_token = NULL WHERE id = ?').run(decoded.id);
    }

    res.json({ message: 'Déconnecté avec succès' });
  } catch (error) {
    res.json({ message: 'Déconnecté' });
  }
});

router.get('/me', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare(
      'SELECT id, email, role, nom, prenom, last_login FROM users WHERE id = ? AND actif = 1'
    ).get(decoded.id);

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json(user);
  } catch (error) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

module.exports = { authRouter: router, setDatabase, generateTokens };
