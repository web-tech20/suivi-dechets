const db = require('../config/database');
const bcrypt = require('bcryptjs');

const User = {
  async findById(id) {
    const res = await db.query(
      'SELECT id, nom, email, role, actif, email_verifie, double_facteur_actif, date_creation FROM users WHERE id = $1',
      [id]
    );
    return res.rows[0] || null;
  },

  async findByEmail(email) {
    const res = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    return res.rows[0] || null;
  },

  async create({ id, nom, email, password, role = 'OBSERVATEUR', emailVerifie = false, tokenVerification = null }) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const res = await db.query(
      `INSERT INTO users (id, nom, email, mot_de_passe, role, email_verifie, token_verification)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, nom, email, role, actif, date_creation`,
      [id, nom, email, hash, role, emailVerifie, tokenVerification]
    );
    return res.rows[0];
  },

  async updateRefreshToken(userId, token) {
    await db.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [token, userId]);
  },

  async verifyEmail(token) {
    const res = await db.query(
      `UPDATE users SET email_verifie = true, token_verification = null 
       WHERE token_verification = $1 
       RETURNING id, nom, email`,
      [token]
    );
    return res.rows[0] || null;
  },

  async updatePassword(userId, newPassword) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);
    await db.query('UPDATE users SET mot_de_passe = $1, token_reset = null WHERE id = $2', [hash, userId]);
  },

  async setResetToken(email, token, expiry) {
    const res = await db.query(
      `UPDATE users SET token_reset = $1, token_reset_expire = $2 
       WHERE email = $3 
       RETURNING id, nom, email`,
      [token, expiry, email]
    );
    return res.rows[0] || null;
  },

  async findByResetToken(token) {
    const res = await db.query(
      `SELECT * FROM users 
       WHERE token_reset = $1 AND token_reset_expire > CURRENT_TIMESTAMP`,
      [token]
    );
    return res.rows[0] || null;
  },

  async toggle2FA(userId, enabled, secret = null) {
    await db.query(
      'UPDATE users SET double_facteur_actif = $1, double_facteur_secret = $2 WHERE id = $3',
      [enabled, secret, userId]
    );
  },

  async listAll(limit = 100, offset = 0) {
    const res = await db.query(
      'SELECT id, nom, email, role, actif, email_verifie, date_creation FROM users ORDER BY date_creation DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return res.rows;
  },

  async updateActif(userId, actif) {
    await db.query('UPDATE users SET actif = $1 WHERE id = $2', [actif, userId]);
  }
};

module.exports = User;
