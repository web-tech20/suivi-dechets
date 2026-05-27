const db = require('../config/database');

const Alert = {
  async findById(id) {
    const res = await db.query(
      `SELECT a.*, p.nom AS poubelle_nom, p.quartier 
       FROM alertes a
       JOIN poubelles p ON p.id = a.poubelle_id
       WHERE a.id = $1`,
      [id]
    );
    return res.rows[0] || null;
  },

  async create({ poubelleId, type, message, niveau, severite = 'warning' }) {
    const res = await db.query(
      `INSERT INTO alertes (poubelle_id, type, message, niveau, severite)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [poubelleId, type, message, niveau, severite]
    );
    return res.rows[0];
  },

  async acknowledge(id) {
    const res = await db.query(
      `UPDATE alertes 
       SET acknowledgee = true, resolved_at = CURRENT_TIMESTAMP 
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return res.rows[0];
  },

  async listActive() {
    const res = await db.query(`
      SELECT a.*, p.nom AS poubelle_nom, p.quartier
      FROM alertes a
      JOIN poubelles p ON p.id = a.poubelle_id
      WHERE a.acknowledgee = false
      ORDER BY a.timestamp DESC
    `);
    return res.rows;
  },

  async listHistory(limit = 50) {
    const res = await db.query(`
      SELECT a.*, p.nom AS poubelle_nom, p.quartier
      FROM alertes a
      JOIN poubelles p ON p.id = a.poubelle_id
      WHERE a.acknowledgee = true
      ORDER BY a.resolved_at DESC
      LIMIT $1
    `, [limit]);
    return res.rows;
  },

  async countActive() {
    const res = await db.query('SELECT COUNT(*) as count FROM alertes WHERE acknowledgee = false');
    return parseInt(res.rows[0].count);
  }
};

module.exports = Alert;
