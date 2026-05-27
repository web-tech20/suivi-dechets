const db = require('../config/database');

const Notification = {
  async create({ userId, type, canal, message, statut = 'envoyé' }) {
    const res = await db.query(
      `INSERT INTO notifications (user_id, type, canal, message, statut)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, type, canal, message, statut]
    );
    return res.rows[0];
  },

  async listByUser(userId, limit = 20) {
    const res = await db.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [userId, limit]
    );
    return res.rows;
  }
};

module.exports = Notification;
