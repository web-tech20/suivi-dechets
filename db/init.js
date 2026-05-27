const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'smartdrop.db');
const DB_TIMEOUT_MS = 5000;

// Coordonnées sur terre ferme — Abomey-Calavi (UAC ≈ 6.441°N, 2.352°E, à l'ouest du lac Nokoué)
const BINS_REAL_COORDINATES = [
  { nom: 'PBL-001', quartier: 'UAC - Campus Central', lat: 6.4410, lng: 2.3520, adresse: 'Devant Bibliothèque UAC' },
  { nom: 'PBL-002', quartier: 'UAC - Département Info', lat: 6.4422, lng: 2.3545, adresse: 'Faculté des Sciences' },
  { nom: 'PBL-003', quartier: 'UAC - Resto U', lat: 6.4398, lng: 2.3510, adresse: 'Restaurant Universitaire' },
  { nom: 'PBL-004', quartier: 'UAC - Crous', lat: 6.4435, lng: 2.3565, adresse: 'Cité Universitaire' },
  { nom: 'PBL-005', quartier: 'Tokan', lat: 6.4486, lng: 2.3553, adresse: 'Carrefour Tokan' },
  { nom: 'PBL-006', quartier: 'Dantokpa', lat: 6.4515, lng: 2.3580, adresse: 'Marché Dantokpa' },
  { nom: 'PBL-007', quartier: 'Stade', lat: 6.4545, lng: 2.3610, adresse: 'Stade Municipal' },
  { nom: 'PBL-008', quartier: 'Carrefour', lat: 6.4460, lng: 2.3535, adresse: 'Grand Carrefour' },
  { nom: 'PBL-009', quartier: 'Gare', lat: 6.4505, lng: 2.3640, adresse: 'Gare Routière' },
  { nom: 'PBL-010', quartier: 'Marché Central', lat: 6.4495, lng: 2.3575, adresse: 'Marché Central' },
  { nom: 'PBL-011', quartier: 'Hôpital', lat: 6.4475, lng: 2.3595, adresse: 'Hôpital de Zone' },
  { nom: 'PBL-012', quartier: 'Mairie', lat: 6.4482, lng: 2.3562, adresse: 'Mairie Abomey-Calavi' }
];

/** Zone terrestre autorisée (évite le lac Nokoué à l'est) */
const LAND_BOUNDS = {
  latMin: 6.435,
  latMax: 6.465,
  lngMin: 2.335,
  lngMax: 2.375
};

function clampToLand(lat, lng) {
  return {
    lat: Math.max(LAND_BOUNDS.latMin, Math.min(LAND_BOUNDS.latMax, lat)),
    lng: Math.max(LAND_BOUNDS.lngMin, Math.min(LAND_BOUNDS.lngMax, lng))
  };
}

function syncRealCoordinates(db) {
  const update = db.prepare(`
    UPDATE poubelles
    SET latitude = @lat, longitude = @lng, quartier = @quartier, adresse = @adresse
    WHERE nom = @nom
  `);
  const syncAll = db.transaction(() => {
    for (const bin of BINS_REAL_COORDINATES) {
      update.run(bin);
    }
  });
  syncAll();
  console.log(`📍 ${BINS_REAL_COORDINATES.length} poubelles synchronisées (terre ferme)`);
}

function configureDatabase(db) {
  db.pragma(`busy_timeout = ${DB_TIMEOUT_MS}`);

  try {
    // Prefer WAL mode for concurrent read/write performance, but don't hard-fail
    // startup if another process is momentarily holding the database lock.
    db.pragma('journal_mode = WAL');
  } catch (error) {
    if (error.code !== 'SQLITE_BUSY') {
      throw error;
    }

    console.warn('⚠️  SQLite busy while enabling WAL mode, continuing with current journal mode');
  }

  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
}

function runScalabilityMigration(db) {
  const migrationPath = path.join(__dirname, 'migrations', '005_scalability.sql');
  if (!fs.existsSync(migrationPath)) return;

  const sql = fs.readFileSync(migrationPath, 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    try {
      db.exec(`${stmt};`);
    } catch (error) {
      const msg = String(error.message || '');
      const ignorable = msg.includes('duplicate column name') ||
        msg.includes('already exists') ||
        msg.includes('UNIQUE constraint failed: poubelles.esp32_id');
      if (!ignorable) {
        throw error;
      }
    }
  }
}

function initDatabase(options = {}) {
  const keepOpen = Boolean(options.keepOpen);
  const db = new Database(DB_PATH, { timeout: DB_TIMEOUT_MS });

  configureDatabase(db);

  // ──────────────────────────────────────────────
  // TABLE: poubelles (Smart Bins)
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS poubelles (
      id TEXT PRIMARY KEY,
      nom TEXT NOT NULL UNIQUE,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      quartier TEXT NOT NULL,
      adresse TEXT,
      capacite_litres INTEGER DEFAULT 240,
      type TEXT DEFAULT 'general',
      date_installation TEXT DEFAULT (datetime('now')),
      actif INTEGER DEFAULT 1
    );
  `);

  // ──────────────────────────────────────────────
  // TABLE: releves (Sensor Readings)
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS releves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poubelle_id TEXT NOT NULL,
      niveau_remplissage REAL NOT NULL,
      temperature REAL,
      batterie REAL,
      signal_force REAL,
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (poubelle_id) REFERENCES poubelles(id) ON DELETE CASCADE
    );
  `);

  // Index for fast lookups by bin and time
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_releves_poubelle ON releves(poubelle_id);
    CREATE INDEX IF NOT EXISTS idx_releves_timestamp ON releves(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_releves_poubelle_time ON releves(poubelle_id, timestamp DESC);
  `);

  // ──────────────────────────────────────────────
  // TABLE: alertes (Alerts)
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS alertes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poubelle_id TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      niveau REAL,
      severite TEXT DEFAULT 'warning',
      acknowledgeée INTEGER DEFAULT 0,
      timestamp TEXT DEFAULT (datetime('now')),
      resolved_at TEXT,
      FOREIGN KEY (poubelle_id) REFERENCES poubelles(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_alertes_active ON alertes(acknowledgeée, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_alertes_poubelle ON alertes(poubelle_id);
  `);

  // ──────────────────────────────────────────────
  // TABLE: tournees (Collection Routes)
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournees (
      id TEXT PRIMARY KEY,
      nom TEXT,
      date_creation TEXT DEFAULT (datetime('now')),
      date_execution TEXT,
      statut TEXT DEFAULT 'planifiée',
      distance_totale REAL,
      duree_estimee INTEGER,
      carburant_estime REAL,
      co2_economise REAL,
      collecteur TEXT
    );
  `);

  // ──────────────────────────────────────────────
  // TABLE: tournee_points (Route Waypoints)
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournee_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournee_id TEXT NOT NULL,
      poubelle_id TEXT NOT NULL,
      ordre INTEGER NOT NULL,
      FOREIGN KEY (tournee_id) REFERENCES tournees(id) ON DELETE CASCADE,
      FOREIGN KEY (poubelle_id) REFERENCES poubelles(id) ON DELETE CASCADE
    );
  `);

  // ──────────────────────────────────────────────
  // TABLE: position_history (Historique des déplacements)
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS position_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poubelle_id TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      moved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (poubelle_id) REFERENCES poubelles(id) ON DELETE CASCADE
    );
  `);

  // ──────────────────────────────────────────────
  // TABLE: users (JWT Authentication)
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nom TEXT,
      prenom TEXT,
      role TEXT DEFAULT 'OBSERVATEUR' CHECK(role IN ('SUPER_ADMIN', 'ADMIN', 'COLLECTEUR', 'OBSERVATEUR')),
      refresh_token TEXT,
      last_login TEXT,
      actif INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  `);

  // Apply schema upgrades for high-scale IoT support.
  runScalabilityMigration(db);

  // ──────────────────────────────────────────────
  // SEED DATA: 12 Smart Bins across Abomey-Calavi
  // ──────────────────────────────────────────────
  const existingCount = db.prepare('SELECT COUNT(*) as count FROM poubelles').get().count;

  if (existingCount === 0) {
    console.log('🌱 Seeding database with initial data...');

    const binTypes = {
      'PBL-001': 'general', 'PBL-002': 'organique', 'PBL-003': 'recyclable', 'PBL-004': 'general',
      'PBL-005': 'general', 'PBL-006': 'organique', 'PBL-007': 'recyclable', 'PBL-008': 'general',
      'PBL-009': 'organique', 'PBL-010': 'recyclable', 'PBL-011': 'general', 'PBL-012': 'organique'
    };
    const bins = BINS_REAL_COORDINATES.map((b) => ({
      id: uuidv4(),
      nom: b.nom,
      lat: b.lat,
      lng: b.lng,
      quartier: b.quartier,
      adresse: b.adresse,
      type: binTypes[b.nom] || 'general'
    }));

    const insertBin = db.prepare(`
      INSERT INTO poubelles (id, nom, latitude, longitude, quartier, adresse, type)
      VALUES (@id, @nom, @lat, @lng, @quartier, @adresse, @type)
    `);

    const insertReleve = db.prepare(`
      INSERT INTO releves (poubelle_id, niveau_remplissage, temperature, batterie, signal_force, timestamp)
      VALUES (@poubelle_id, @niveau, @temperature, @batterie, @signal, @timestamp)
    `);

    const insertAlerte = db.prepare(`
      INSERT INTO alertes (poubelle_id, type, message, niveau, severite)
      VALUES (@poubelle_id, @type, @message, @niveau, @severite)
    `);

    const insertMany = db.transaction(() => {
      for (const bin of bins) {
        insertBin.run(bin);

        // Generate 24h of historical readings (every 30 min = 48 readings)
        let niveau = Math.random() * 30 + 10; // Start between 10-40%
        for (let i = 47; i >= 0; i--) {
          const hoursAgo = i * 0.5;
          const timestamp = new Date(Date.now() - hoursAgo * 3600000).toISOString().replace('T', ' ').substring(0, 19);
          niveau = Math.min(100, Math.max(0, niveau + (Math.random() * 6 - 1.5))); // Trend upward
          const temperature = 28 + Math.random() * 8;
          const batterie = 95 - (i * 0.3) + Math.random() * 2;
          const signal = 70 + Math.random() * 30;

          insertReleve.run({
            poubelle_id: bin.id,
            niveau: Math.round(niveau * 10) / 10,
            temperature: Math.round(temperature * 10) / 10,
            batterie: Math.round(Math.max(50, batterie) * 10) / 10,
            signal: Math.round(signal * 10) / 10,
            timestamp
          });
        }

        // Create alerts for bins above 80%
        if (niveau >= 80) {
          insertAlerte.run({
            poubelle_id: bin.id,
            type: 'niveau_critique',
            message: `${bin.nom} (${bin.quartier}) a atteint ${Math.round(niveau)}% de remplissage`,
            niveau: Math.round(niveau),
            severite: niveau >= 90 ? 'critical' : 'warning'
          });
        }
      }
    });

    insertMany();
    console.log(`✅ Seeded ${bins.length} bins with ${bins.length * 48} readings`);
  } else {
    console.log(`📊 Database already contains ${existingCount} bins`);
    syncRealCoordinates(db);
  }

  const defaultPasswordHash = bcrypt.hashSync('Admin123!', 10);
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, nom, prenom, role, actif)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  insertUser.run('admin-001', 'super@suivi-dechets.com', defaultPasswordHash, 'Super', 'Admin', 'SUPER_ADMIN');
  insertUser.run('admin-002', 'admin@suivi-dechets.com', defaultPasswordHash, 'Admin', 'Principal', 'ADMIN');
  insertUser.run('collect-001', 'collecteur@suivi-dechets.com', defaultPasswordHash, 'Jean', 'Collecteur', 'COLLECTEUR');
  insertUser.run('obs-001', 'observateur@suivi-dechets.com', defaultPasswordHash, 'Paul', 'Observateur', 'OBSERVATEUR');

  console.log('🗃️  Database initialized at:', DB_PATH);

  if (keepOpen) {
    return db;
  }

  db.close();
  return null;
}

// Run if called directly
if (require.main === module) {
  initDatabase();
}

module.exports = { initDatabase, DB_PATH, DB_TIMEOUT_MS, BINS_REAL_COORDINATES, LAND_BOUNDS, clampToLand };
