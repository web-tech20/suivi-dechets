const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../backend/config/database');

async function seedDatabase() {
  console.log('🌱 Seeding PostgreSQL Database with V2.0 Enterprise Data...');

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Seed Users (Hashed password: password123)
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('password123', salt);

    const users = [
      { id: uuidv4(), nom: 'Super Admin', email: 'superadmin@suivi-dechets.com', role: 'SUPER_ADMIN' },
      { id: uuidv4(), nom: 'Gestionnaire Calavi', email: 'admin@suivi-dechets.com', role: 'ADMIN_GESTIONNAIRE' },
      { id: uuidv4(), nom: 'Chauffeur Collecte 1', email: 'collecteur@suivi-dechets.com', role: 'COLLECTEUR' },
      { id: uuidv4(), nom: 'Observateur Public', email: 'observateur@suivi-dechets.com', role: 'OBSERVATEUR' }
    ];

    console.log('  👥 Seeding users...');
    for (const u of users) {
      await client.query(
        `INSERT INTO users (id, nom, email, mot_de_passe, role, email_verifie)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (email) DO NOTHING`,
        [u.id, u.nom, u.email, hash, u.role]
      );
    }

    // 2. Seed Bins (12 bins across Abomey-Calavi)
    const bins = [
      { id: uuidv4(), nom: 'PBL-001', lat: 6.4486, lng: 2.4187, quartier: 'Tokan', adresse: 'Carrefour Tokan, Route principale', type: 'general', cap: 240 },
      { id: uuidv4(), nom: 'PBL-002', lat: 6.4532, lng: 2.4251, quartier: 'Dantokpa', adresse: 'Marché Dantokpa, Entrée Sud', type: 'organique', cap: 360 },
      { id: uuidv4(), nom: 'PBL-003', lat: 6.4415, lng: 2.4123, quartier: 'Université', adresse: 'Campus UAC, Bâtiment A', type: 'recyclable', cap: 240 },
      { id: uuidv4(), nom: 'PBL-004', lat: 6.4598, lng: 2.4305, quartier: 'Stade', adresse: 'Stade Municipal, Parking', type: 'general', cap: 240 },
      { id: uuidv4(), nom: 'PBL-005', lat: 6.4389, lng: 2.4089, quartier: 'Carrefour Aïdjèdo', adresse: 'Place Aïdjèdo', type: 'general', cap: 240 },
      { id: uuidv4(), nom: 'PBL-006', lat: 6.4621, lng: 2.4450, quartier: 'Gare Routière', adresse: 'Terminal Bus, Zone A', type: 'organique', cap: 360 },
      { id: uuidv4(), nom: 'PBL-007', lat: 6.4450, lng: 2.4350, quartier: 'Zogbadjè', adresse: 'Rond-point Zogbadjè', type: 'recyclable', cap: 240 },
      { id: uuidv4(), nom: 'PBL-008', lat: 6.4510, lng: 2.4180, quartier: 'Akassato', adresse: 'Mairie Akassato', type: 'general', cap: 240 },
      { id: uuidv4(), nom: 'PBL-009', lat: 6.4380, lng: 2.4280, quartier: 'Godomey', adresse: 'Marché Godomey, Allée 3', type: 'organique', cap: 360 },
      { id: uuidv4(), nom: 'PBL-010', lat: 6.4560, lng: 2.4100, quartier: 'Calavi Centre', adresse: 'Mairie Abomey-Calavi', type: 'recyclable', cap: 240 },
      { id: uuidv4(), nom: 'PBL-011', lat: 6.4470, lng: 2.4420, quartier: 'Togba', adresse: 'École Primaire Togba', type: 'general', cap: 240 },
      { id: uuidv4(), nom: 'PBL-012', lat: 6.4650, lng: 2.4220, quartier: 'Tankpè', adresse: 'Centre de Santé Tankpè', type: 'organique', cap: 360 },
    ];

    console.log('  🗑️ Seeding bins...');
    for (const b of bins) {
      await client.query(
        `INSERT INTO poubelles (id, nom, latitude, longitude, quartier, adresse, type, capacite_litres)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (nom) DO NOTHING`,
        [b.id, b.nom, b.lat, b.lng, b.quartier, b.adresse, b.type, b.cap]
      );
    }

    // Fetch newly created bin ids
    const binIdsRes = await client.query('SELECT id, nom, quartier FROM poubelles');
    const dbBins = binIdsRes.rows;

    // 3. Seed Historical Readings (48 readings per bin over last 24h)
    console.log(`  📡 Seeding historical readings (${dbBins.length * 48} entries)...`);
    for (const bin of dbBins) {
      let niveau = Math.random() * 30 + 10; // Start at 10-40%
      for (let i = 47; i >= 0; i--) {
        const hoursAgo = i * 0.5;
        const timestamp = new Date(Date.now() - hoursAgo * 3600000);
        niveau = Math.min(100, Math.max(0, niveau + (Math.random() * 6 - 1.5))); // upward trend
        const temperature = 28 + Math.random() * 8;
        const batterie = 98 - (i * 0.2) + Math.random() * 2;
        const signal = 70 + Math.random() * 30;

        await client.query(
          `INSERT INTO releves (poubelle_id, niveau_remplissage, temperature, batterie, signal_force, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [bin.id, Math.round(niveau * 10) / 10, Math.round(temperature * 10) / 10, Math.round(Math.max(40, batterie) * 10) / 10, Math.round(signal * 10) / 10, timestamp]
        );
      }

      // 4. Seed Active Alerts for Bins > 80%
      if (niveau >= 80) {
        const severite = niveau >= 90 ? 'critical' : 'warning';
        const msg = `${bin.nom} (${bin.quartier}) a dépassé le seuil critique avec ${Math.round(niveau)}% de remplissage`;
        await client.query(
          `INSERT INTO alertes (poubelle_id, type, message, niveau, severite)
           VALUES ($1, 'niveau_critique', $2, $3, $4)`,
          [bin.id, msg, Math.round(niveau), severite]
        );
      }
    }

    // 5. Seed Audit Logs
    console.log('  🔒 Seeding security audit logs...');
    const adminUser = users.find(u => u.role === 'ADMIN_GESTIONNAIRE');
    await client.query(
      `INSERT INTO audit_logs (user_id, action, ressource, ressource_id, details, ip_adresse, user_agent)
       VALUES ($1, 'system:seed', 'database', 'suivi_dechets', '{"seeded": true, "bins": 12}', '127.0.0.1', 'Suivi-Dechets System Seeder')`,
      [adminUser.id]
    );

    await client.query('COMMIT');
    console.log('🎉 Seeding successfully completed!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error seeding database:', err.message);
  } finally {
    client.release();
    db.pool.end();
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
