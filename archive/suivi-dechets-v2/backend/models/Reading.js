const db = require('../config/database');

const Reading = {
  async create({ poubelleId, niveauRemplissage, temperature, batterie, signalForce }) {
    const res = await db.query(
      `INSERT INTO releves (poubelle_id, niveau_remplissage, temperature, batterie, signal_force)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [poubelleId, niveauRemplissage, temperature, batterie, signalForce]
    );
    return res.rows[0];
  },

  async getHistoryByBin(poubelleId, limit = 48) {
    const res = await db.query(
      `SELECT * FROM releves 
       WHERE poubelle_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [poubelleId, limit]
    );
    return res.rows;
  },

  async getNetworkAverageLevel() {
    const res = await db.query(`
      SELECT AVG(r.niveau_remplissage) as average
      FROM (
        SELECT DISTINCT ON (poubelle_id) niveau_remplissage
        FROM releves
        ORDER BY poubelle_id, timestamp DESC
      ) r
    `);
    return Math.round(parseFloat(res.rows[0].average || 0));
  },

  async getWeeklyAggregatedProduction() {
    const res = await db.query(`
      SELECT TO_CHAR(timestamp, 'YYYY-MM-DD') AS date, AVG(niveau_remplissage) AS avg_level
      FROM releves
      WHERE timestamp >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY date
      ORDER BY date ASC
    `);
    return res.rows;
  }
};

module.exports = Reading;
