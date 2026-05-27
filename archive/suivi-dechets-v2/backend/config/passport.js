const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const bcrypt = require('bcryptjs');
const db = require('./database');
require('dotenv').config();

const jwtSecret = process.env.JWT_SECRET || 'ultra_super_secret_key_2026';

// ── LOCAL STRATEGY (Email & Password Login) ──────────────────
passport.use(new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password'
}, async (email, password, done) => {
  try {
    const res = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = res.rows[0];

    if (!user) {
      return done(null, false, { message: 'Identifiants invalides.' });
    }

    if (!user.actif) {
      return done(null, false, { message: 'Compte désactivé. Contactez l\'administrateur.' });
    }

    if (!user.email_verifie) {
      return done(null, false, { message: 'Veuillez vérifier votre adresse email.' });
    }

    const match = await bcrypt.compare(password, user.mot_de_passe);
    if (!match) {
      return done(null, false, { message: 'Identifiants invalides.' });
    }

    // Auth succeeded
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

// ── JWT STRATEGY (Token Validation) ──────────────────────────
const jwtOpts = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: jwtSecret
};

passport.use(new JwtStrategy(jwtOpts, async (jwtPayload, done) => {
  try {
    const res = await db.query(
      'SELECT id, nom, email, role, actif, email_verifie FROM users WHERE id = $1',
      [jwtPayload.id]
    );
    const user = res.rows[0];

    if (!user) {
      return done(null, false);
    }

    if (!user.actif) {
      return done(null, false, { message: 'Compte suspendu.' });
    }

    return done(null, user);
  } catch (err) {
    return done(err, false);
  }
}));

module.exports = passport;
