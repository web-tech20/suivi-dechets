#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');
const { initDatabase } = require('../db/init');

const count = Math.max(1, Number.parseInt(process.argv[2] || '100', 10));
// Ensure scalability migration is applied before generating bulk bins.
const db = initDatabase({ keepOpen: true }) || new Database(path.join(__dirname, '..', 'db', 'smartdrop.db'));

const insertBin = db.prepare(`
  INSERT OR IGNORE INTO poubelles (
    id, esp32_id, nom, latitude, longitude, quartier, adresse, type, capacite_litres, seuil_alerte, actif
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
`);

const tx = db.transaction((n) => {
  for (let i = 0; i < n; i++) {
    const idx = i + 1;
    const id = `PBL-AUTO-${String(Date.now() + idx).slice(-8)}`;
    const esp32 = `ESP-${String(idx).padStart(4, '0')}`;
    const lat = 6.435 + Math.random() * 0.03;
    const lng = 2.335 + Math.random() * 0.04;
    insertBin.run(
      id,
      esp32,
      `BIN-${String(idx).padStart(4, '0')}`,
      Number(lat.toFixed(6)),
      Number(lng.toFixed(6)),
      `Zone-${(idx % 20) + 1}`,
      `Adresse ${idx}`,
      'standard',
      240,
      80
    );

    const niveau = Math.round(20 + Math.random() * 75);
    db.prepare(`
      INSERT INTO releves (poubelle_id, niveau_remplissage, temperature, batterie, signal_force)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, niveau, 25 + Math.random() * 10, 40 + Math.random() * 60, 50 + Math.random() * 40);
  }
});

tx(count);
const total = db.prepare('SELECT COUNT(*) AS c FROM poubelles').get().c;
console.log(`✅ ${count} poubelles générées. Total actuel: ${total}`);
db.close();
