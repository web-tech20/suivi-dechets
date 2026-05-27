const db = require('../config/database');

const AuditLog = {
  async create({ userId, action, ressource, ressourceId, details, ipAdresse, userAgent }) {
    const res = await db.query(
      `INSERT INTO audit_logs (user_id, action, ressource, ressource_id, details, ip_adresse, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, action, ressource, ressourceId, details ? JSON.stringify(details) : null, ipAdresse, userAgent]
    );
    return res.rows[0];
  },

  async listAll(limit = 100, offset = 0) {
    const res = await db.query(`
      SELECT al.*, u.nom AS user_nom, u.email AS user_email
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      ORDER BY al.timestamp DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    return res.rows;
  }
};

module.exports = AuditLog;
