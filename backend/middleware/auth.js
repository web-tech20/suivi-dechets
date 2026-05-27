const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'suivi-dechets-super-secret-key-2026';

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Accès non autorisé. Token manquant.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Format token invalide' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expiré', code: 'TOKEN_EXPIRED' });
    }

    return res.status(401).json({ error: 'Token invalide' });
  }
}

module.exports = { authenticate };
