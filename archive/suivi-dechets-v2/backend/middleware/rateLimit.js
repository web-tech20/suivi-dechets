const rateLimit = require('express-rate-limit');

// Rate limiting for standard REST API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    error: 'Trop de requêtes effectuées depuis cette adresse IP. Veuillez réessayer dans 15 minutes.'
  }
});

// Stricter rate limiting for authentication sensitive routes (login, register)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 authentication requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Tentatives d\'authentification trop fréquentes. Réessayez dans 15 minutes.'
  }
});

module.exports = {
  apiLimiter,
  authLimiter
};
