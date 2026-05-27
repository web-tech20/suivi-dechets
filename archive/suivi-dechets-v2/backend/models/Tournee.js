const db = require('../config/database');

const Tournee = {
  async findById(id) {
    const res = await db.query('SELECT * FROM tournees WHERE id = $1', [id]);
    if (!res.rows[0]) return null;

    const pointsRes = await db.query(
      `SELECT tp.*, p.nom, p.latitude, p.longitude, p.quartier, p.adresse
       FROM tournee_points tp
       JOIN poubelles p ON p.id = tp.poubelle_id
       WHERE tp.tournee_id = $1
       ORDER BY tp.ordre ASC`,
      [id]
    );

    return {
      ...res.rows[0],
      points: pointsRes.rows
    };
  },

  async create({ id, nom, distanceTotale, dureeEstimee, carburantEstime, co2Economise, collecteurId = null }) {
    const res = await db.query(
      `INSERT INTO tournees (id, nom, distance_totale, duree_estimee, carburant_estime, co2_economise, collecteur_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, nom, distanceTotale, dureeEstimee, carburantEstime, co2Economise, collecteurId]
    );
    return res.rows[0];
  },

  async addPoints(tourneeId, points) {
    // points is array of { poubelleId, ordre }
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      for (const pt of points) {
        await client.query(
          'INSERT INTO tournee_points (tournee_id, poubelle_id, ordre) VALUES ($1, $2, $3)',
          [tourneeId, pt.poubelleId, pt.ordre]
        );
      }
      await client.query('COMMIT');
      return true;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async updateStatut(id, statut) {
    const dateExec = statut === 'complétée' ? 'CURRENT_TIMESTAMP' : 'NULL';
    const res = await db.query(
      `UPDATE tournees 
       SET statut = $1, date_execution = ${dateExec === 'CURRENT_TIMESTAMP' ? 'CURRENT_TIMESTAMP' : 'NULL'}
       WHERE id = $2
       RETURNING *`,
      [statut, id]
    );
    return res.rows[0];
  },

  async assignCollector(id, collectorId) {
    const res = await db.query(
      `UPDATE tournees SET collecteur_id = $1 WHERE id = $2 RETURNING *`,
      [collectorId, id]
    );
    return res.rows[0];
  },

  async listAll(limit = 20) {
    const res = await db.query(`
      SELECT t.*, u.nom AS collecteur_nom, COUNT(tp.id) as nb_points
      FROM tournees t
      LEFT JOIN users u ON u.id = t.collecteur_id
      LEFT JOIN tournee_points tp ON tp.tournee_id = t.id
      GROUP BY t.id, u.nom
      ORDER BY t.date_creation DESC
      LIMIT $1
    `, [limit]);
    return res.rows;
  },

  async listActiveByCollector(collectorId) {
    const res = await db.query(`
      SELECT t.*, COUNT(tp.id) as nb_points
      FROM tournees t
      LEFT JOIN tournee_points tp ON tp.tournee_id = t.id
      WHERE t.collecteur_id = $1 AND t.statut IN ('planifiée', 'en_cours')
      GROUP BY t.id
      ORDER BY t.date_creation DESC
    `, [collectorId]);
    return res.rows;
  }
};

module.exports = Tournee;
