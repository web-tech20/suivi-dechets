const passport = require('passport');

// Simple middleware to authenticate via JWT
const auth = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.status(401).json({ error: 'Non authentifié. Jeton manquant ou expiré.' });
    }
    req.user = user;
    next();
  })(req, res, next);
};

module.exports = auth;
