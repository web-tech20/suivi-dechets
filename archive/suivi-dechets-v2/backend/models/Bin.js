const db = require('../config/database');

const Bin = {
  async findById(id) {
    const res = await db.query('SELECT * FROM poubelles WHERE id = $1', [id]);
    return res.rows[0] || null;
  },

  async findByNom(nom) {
    const res = await db.query('SELECT * FROM poubelles WHERE nom = $1', [nom]);
    return res.rows[0] || null;
  },

  async create({ id, nom, latitude, longitude, quartier, adresse, type = 'general', capaciteLitres = 240 }) {
    const res = await db.query(
      `INSERT INTO poubelles (id, nom, latitude, longitude, quartier, adresse, type, capacite_litres)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, nom, latitude, longitude, quartier, adresse, type, capaciteLitres]
    );
    return res.rows[0];
  },

  async update(id, { nom, quartier, adresse, type, actif, capaciteLitres }) {
    const current = await this.findById(id);
    if (!current) return null;

    const res = await db.query(
      `UPDATE poubelles 
       SET nom = $1, quartier = $2, adresse = $3, type = $4, actif = $5, capacite_litres = $6
       WHERE id = $7
       RETURNING *`,
      [
        nom || current.nom,
        quartier || current.quartier,
        adresse !== undefined ? adresse : current.adresse,
        type || current.type,
        actif !== undefined ? actif : current.actif,
        capaciteLitres || current.capacite_litres,
        id
      ]
    );
    return res.rows[0];
  },

  async delete(id) {
    const res = await db.query('DELETE FROM poubelles WHERE id = $1 RETURNING id', [id]);
    return res.rowCount > 0;
  },

  async listAllWithLatestReading() {
    const res = await db.query(`
      SELECT p.*,
        r.niveau_remplissage AS niveau,
        r.temperature,
        r.batterie,
        r.signal_force,
        r.timestamp AS dernier_releve,
        COALESCE(al.active_alerts, 0) > 0 AS alerte,
        COALESCE(al.active_alerts, 0) AS alertes_count
      FROM poubelles p
      LEFT JOIN LATERAL (
        SELECT niveau_remplissage, temperature, batterie, signal_force, timestamp
        FROM releves
        WHERE poubelle_id = p.id
        ORDER BY timestamp DESC
        LIMIT 1
      ) r ON true
      LEFT JOIN (
        SELECT poubelle_id, COUNT(*) as active_alerts
        FROM alertes
        WHERE acknowledgee = 0
        GROUP BY poubelle_id
      ) al ON al.poubelle_id = p.id
      WHERE p.actif = true
      ORDER BY p.nom
    `);
    return res.rows;
  },

  async listUrgentBins(threshold = 70) {
    const res = await db.query(`
      SELECT p.*, r.niveau_remplissage AS niveau
      FROM poubelles p
      JOIN LATERAL (
        SELECT niveau_remplissage
        FROM releves
        WHERE poubelle_id = p.id
        ORDER BY timestamp DESC
        LIMIT 1
      ) r ON true
      WHERE p.actif = true AND r.niveau_remplissage >= $1
      ORDER BY r.niveau_remplissage DESC
    `, [threshold]);
    return res.rows;
  }
};

module.exports = Bin;
