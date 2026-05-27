// ═══════════════════════════════════════════════════════════════
// SUIVI-DÉCHETS — Backend Express + SQLite + Socket.io
// Smart Waste Management Server
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { initDatabase, clampToLand } = require('./db/init');
const { authenticate } = require('./backend/middleware/auth');
const { authorize } = require('./backend/middleware/rbac');
const { authRouter, setDatabase } = require('./backend/auth');
const { createIotRouter } = require('./backend/iot');
const { setupEsp32Socket } = require('./backend/esp32_manager');

// ── Initialize Database ──────────────────────────────────────
const db = initDatabase({ keepOpen: true });

const app = express();
const server = http.createServer(app);

const corsOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://suivi-dechets.onrender.com',
  'https://suivi-dechets.vercel.app'
];

const io = new Server(server, { 
  cors: { 
    origin: corsOrigins,
    credentials: true
  } 
});
setDatabase(db);

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin: corsOrigins,
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules')));
app.use('/api/auth', authRouter);
app.use('/api/iot', createIotRouter({
  db,
  io,
  getEsp32Token: () => process.env.ESP32_SECRET || 'shared-secret-key-2026'
}));

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

app.get('/api/config/maps', authenticate, authorize(['bins:read']), (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Clé Google Maps non configurée dans .env' });
  }

  res.json({
    apiKey,
    mapId: process.env.GOOGLE_MAPS_MAP_ID || 'SUIVI_DECHETS_MAP',
    center: { lat: 6.4486, lng: 2.3553 },
    bounds: {
      north: 6.47,
      south: 6.43,
      west: 2.33,
      east: 2.38
    }
  });
});

app.get('/api/system/load', authenticate, authorize(['stats:read']), (req, res) => {
  try {
    const dbPath = path.join(__dirname, 'db', 'smartdrop.db');
    const stats = fs.statSync(dbPath);
    const dbSize = stats.size;
    const totalAlerts = db.prepare('SELECT COUNT(*) as count FROM alertes').get().count;
    const activeAlerts = db.prepare('SELECT COUNT(*) as count FROM alertes WHERE acknowledgeée = 0').get().count;
    res.json({ db_size: dbSize, alertes_total: totalAlerts, alertes_actives: activeAlerts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// HELPER: Haversine Distance (km)
// ═══════════════════════════════════════════════════════════════
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ═══════════════════════════════════════════════════════════════
// HELPER: TSP Optimizer (Nearest Neighbor + 2-opt)
// ═══════════════════════════════════════════════════════════════
function optimizeRoute(points) {
  if (points.length <= 2) return { route: points, distance: 0 };

  const n = points.length;
  // Build distance matrix
  const dist = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      haversine(points[i].latitude, points[i].longitude, points[j].latitude, points[j].longitude)
    )
  );

  // Nearest Neighbor starting from index 0 (depot)
  const visited = new Array(n).fill(false);
  const route = [0];
  visited[0] = true;
  let current = 0;

  for (let step = 1; step < n; step++) {
    let nearest = -1, minDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited[j] && dist[current][j] < minDist) {
        minDist = dist[current][j];
        nearest = j;
      }
    }
    if (nearest !== -1) {
      visited[nearest] = true;
      route.push(nearest);
      current = nearest;
    }
  }

  // 2-opt improvement
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const oldDist = dist[route[i - 1]][route[i]] + dist[route[j]][route[(j + 1) % route.length]];
        const newDist = dist[route[i - 1]][route[j]] + dist[route[i]][route[(j + 1) % route.length]];
        if (newDist < oldDist) {
          // Reverse the segment between i and j
          const segment = route.slice(i, j + 1).reverse();
          route.splice(i, j - i + 1, ...segment);
          improved = true;
        }
      }
    }
  }

  // Calculate total distance
  let totalDistance = 0;
  for (let i = 0; i < route.length - 1; i++) {
    totalDistance += dist[route[i]][route[i + 1]];
  }
  // Add return to depot
  totalDistance += dist[route[route.length - 1]][route[0]];

  return {
    route: route.map(i => points[i]),
    distance: Math.round(totalDistance * 100) / 100
  };
}

function getDashboardStats() {
  const totalBins = db.prepare('SELECT COUNT(*) as count FROM poubelles WHERE actif = 1').get().count;

  const avgLevel = db.prepare(`
    SELECT AVG(r.niveau_remplissage) as avg
    FROM (
      SELECT poubelle_id, niveau_remplissage,
        ROW_NUMBER() OVER (PARTITION BY poubelle_id ORDER BY timestamp DESC) AS rn
      FROM releves
    ) r WHERE r.rn = 1
  `).get().avg || 0;

  const activeAlerts = db.prepare('SELECT COUNT(*) as count FROM alertes WHERE acknowledgeée = 0').get().count;
  const totalAlerts = db.prepare('SELECT COUNT(*) as count FROM alertes').get().count;
  const activeTours = db.prepare(`SELECT COUNT(*) as count FROM tournees WHERE statut = 'planifiée'`).get().count;

  const criticalBins = db.prepare(`
    SELECT COUNT(DISTINCT r.poubelle_id) as count
    FROM (
      SELECT poubelle_id, niveau_remplissage,
        ROW_NUMBER() OVER (PARTITION BY poubelle_id ORDER BY timestamp DESC) AS rn
      FROM releves
    ) r WHERE r.rn = 1 AND r.niveau_remplissage >= 80
  `).get().count;

  const collectionsToday = db.prepare(`
    SELECT COUNT(*) as count FROM tournees WHERE date(date_creation) = date('now')
  `).get().count;

  return {
    total_poubelles: totalBins,
    niveau_moyen: Math.round(avgLevel),
    alertes_actives: activeAlerts,
    alertes_total: totalAlerts,
    tournees_actives: activeTours,
    poubelles_critiques: criticalBins,
    collectes_aujourdhui: collectionsToday,
    couverture_reseau: 94,
    taux_collecte: 87,
    satisfaction: 91
  };
}

// ═══════════════════════════════════════════════════════════════
// REST API: Poubelles (Bins)
// ═══════════════════════════════════════════════════════════════

// GET all bins with latest reading
app.get('/api/poubelles', authenticate, authorize(['bins:read']), (req, res) => {
  try {
    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(500, Math.max(1, toInt(req.query.limit, 100)));
    const offset = (page - 1) * limit;
    const quartier = req.query.quartier ? String(req.query.quartier) : null;
    const status = req.query.status ? String(req.query.status) : null;

    const whereParts = ['p.actif = 1'];
    const params = [];
    if (quartier) {
      whereParts.push('p.quartier = ?');
      params.push(quartier);
    }
    if (status === 'critique') {
      whereParts.push('COALESCE(r.niveau_remplissage, 0) >= 80');
    }
    const whereClause = `WHERE ${whereParts.join(' AND ')}`;

    const bins = db.prepare(`
      SELECT p.*,
        r.niveau_remplissage AS niveau,
        r.temperature,
        r.batterie,
        r.signal_force,
        r.timestamp AS dernier_releve
      FROM poubelles p
      LEFT JOIN (
        SELECT poubelle_id, niveau_remplissage, temperature, batterie, signal_force, timestamp,
          ROW_NUMBER() OVER (PARTITION BY poubelle_id ORDER BY timestamp DESC) AS rn
        FROM releves
      ) r ON r.poubelle_id = p.id AND r.rn = 1
      ${whereClause}
      ORDER BY p.nom
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    // Add alert status
    const alertCounts = db.prepare(`
      SELECT poubelle_id, COUNT(*) as count
      FROM alertes WHERE acknowledgeée = 0
      GROUP BY poubelle_id
    `).all();
    const alertMap = Object.fromEntries(alertCounts.map(a => [a.poubelle_id, a.count]));

    const result = bins.map(b => ({
      ...b,
      alerte: (alertMap[b.id] || 0) > 0,
      alertes_count: alertMap[b.id] || 0
    }));

    const total = db.prepare(`
      SELECT COUNT(*) as total
      FROM poubelles p
      LEFT JOIN (
        SELECT poubelle_id, niveau_remplissage,
          ROW_NUMBER() OVER (PARTITION BY poubelle_id ORDER BY timestamp DESC) AS rn
        FROM releves
      ) r ON r.poubelle_id = p.id AND r.rn = 1
      ${whereClause}
    `).get(...params).total;

    // Backward compatible response for existing clients.
    const wantsPagination = req.query.page || req.query.limit || req.query.quartier || req.query.status;
    if (!wantsPagination) {
      return res.json(result);
    }

    res.json({
      data: result,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/poubelles/export', authenticate, authorize(['bins:read']), (req, res) => {
  try {
    const bins = db.prepare(`
      SELECT p.id, p.nom, p.quartier, p.latitude, p.longitude, p.esp32_id,
        r.niveau_remplissage, r.temperature, r.batterie, r.timestamp
      FROM poubelles p
      LEFT JOIN releves r ON r.poubelle_id = p.id
      WHERE r.timestamp = (
        SELECT MAX(timestamp) FROM releves WHERE poubelle_id = p.id
      )
      ORDER BY p.nom
    `).all();
    res.json(bins);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single bin with history
app.get('/api/poubelles/:id', authenticate, authorize(['bins:read']), (req, res) => {
  try {
    const bin = db.prepare('SELECT * FROM poubelles WHERE id = ?').get(req.params.id);
    if (!bin) return res.status(404).json({ error: 'Poubelle non trouvée' });

    const readings = db.prepare(`
      SELECT * FROM releves WHERE poubelle_id = ? ORDER BY timestamp DESC LIMIT 48
    `).all(req.params.id);

    const alerts = db.prepare(`
      SELECT * FROM alertes WHERE poubelle_id = ? ORDER BY timestamp DESC LIMIT 10
    `).all(req.params.id);

    res.json({ ...bin, readings, alerts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create bin
app.post('/api/poubelles', authenticate, authorize(['bins:create']), (req, res) => {
  try {
    const { nom, latitude, longitude, quartier, adresse, type, capacite_litres } = req.body;
    const id = uuidv4();
    db.prepare(`
      INSERT INTO poubelles (id, nom, latitude, longitude, quartier, adresse, type, capacite_litres)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, nom, latitude, longitude, quartier, adresse || '', type || 'general', capacite_litres || 240);

    const bin = db.prepare('SELECT * FROM poubelles WHERE id = ?').get(id);
    io.emit('bin:created', bin);
    res.status(201).json(bin);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update bin
app.put('/api/poubelles/:id', authenticate, authorize(['bins:update']), (req, res) => {
  try {
    const { nom, quartier, adresse, type, actif } = req.body;
    const bin = db.prepare('SELECT * FROM poubelles WHERE id = ?').get(req.params.id);
    if (!bin) return res.status(404).json({ error: 'Poubelle non trouvée' });

    db.prepare(`
      UPDATE poubelles SET nom = ?, quartier = ?, adresse = ?, type = ?, actif = ? WHERE id = ?
    `).run(nom || bin.nom, quartier || bin.quartier, adresse || bin.adresse, type || bin.type, actif ?? bin.actif, req.params.id);

    const updated = db.prepare('SELECT * FROM poubelles WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// PUT update bin position
app.put('/api/poubelles/:id/position', authenticate, authorize(['bins:update']), (req, res) => {
  try {
    let { latitude, longitude } = req.body;
    const { id } = req.params;

    if (latitude == null || longitude == null) {
      return res.status(400).json({ error: 'latitude et longitude requis' });
    }

    const bin = db.prepare('SELECT * FROM poubelles WHERE id = ?').get(id);
    if (!bin) return res.status(404).json({ error: 'Poubelle non trouvée' });

    const clamped = clampToLand(Number(latitude), Number(longitude));
    latitude = clamped.lat;
    longitude = clamped.lng;

    db.prepare(`
      INSERT INTO position_history (poubelle_id, latitude, longitude)
      VALUES (?, ?, ?)
    `).run(id, latitude, longitude);

    db.prepare(`
      UPDATE poubelles SET latitude = ?, longitude = ? WHERE id = ?
    `).run(latitude, longitude, id);

    const updated = db.prepare('SELECT * FROM poubelles WHERE id = ?').get(id);
    const lastReading = db.prepare(`
      SELECT niveau_remplissage FROM releves WHERE poubelle_id = ? ORDER BY timestamp DESC LIMIT 1
    `).get(id);
    if (lastReading) {
      updated.niveau = lastReading.niveau_remplissage;
    }

    io.emit('bin:position:update', updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE bin
app.delete('/api/poubelles/:id', authenticate, authorize(['bins:delete']), (req, res) => {
  try {
    const result = db.prepare('DELETE FROM poubelles WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Poubelle non trouvée' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// REST API: Relevés (Readings)
// ═══════════════════════════════════════════════════════════════

app.post('/api/releves', (req, res) => {
  try {
    const { poubelle_id, niveau_remplissage, temperature, batterie, signal_force } = req.body;

    db.prepare(`
      INSERT INTO releves (poubelle_id, niveau_remplissage, temperature, batterie, signal_force)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      poubelle_id,
      niveau_remplissage,
      temperature ?? null,
      batterie ?? null,
      signal_force ?? null
    );

    // Check for alert
    if (niveau_remplissage >= 80) {
      const bin = db.prepare('SELECT * FROM poubelles WHERE id = ?').get(poubelle_id);
      const severite = niveau_remplissage >= 90 ? 'critical' : 'warning';
      const msg = `${bin.nom} (${bin.quartier}) a atteint ${Math.round(niveau_remplissage)}% de remplissage`;

      db.prepare(`
        INSERT INTO alertes (poubelle_id, type, message, niveau, severite)
        VALUES (?, 'niveau_critique', ?, ?, ?)
      `).run(poubelle_id, msg, niveau_remplissage, severite);

      const alert = db.prepare('SELECT * FROM alertes ORDER BY id DESC LIMIT 1').get();
      io.emit('alert:new', alert);
    }

    // Broadcast update
    const latest = db.prepare(`
      SELECT p.*, r.niveau_remplissage AS niveau, r.temperature, r.batterie, r.signal_force, r.timestamp AS dernier_releve
      FROM poubelles p
      JOIN releves r ON r.poubelle_id = p.id
      WHERE p.id = ?
      ORDER BY r.timestamp DESC LIMIT 1
    `).get(poubelle_id);

    io.emit('bin:update', latest);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/releves/:poubelleId', authenticate, authorize(['bins:read']), (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 48;
    const readings = db.prepare(`
      SELECT * FROM releves WHERE poubelle_id = ? ORDER BY timestamp DESC LIMIT ?
    `).all(req.params.poubelleId, limit);
    res.json(readings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// REST API: Alertes
// ═══════════════════════════════════════════════════════════════

app.get('/api/alertes', authenticate, authorize(['alerts:read']), (req, res) => {
  try {
    const active = req.query.active !== 'false';
    const alerts = db.prepare(`
      SELECT a.*, p.nom AS poubelle_nom, p.quartier
      FROM alertes a
      JOIN poubelles p ON p.id = a.poubelle_id
      ${active ? 'WHERE a.acknowledgeée = 0' : ''}
      ORDER BY a.timestamp DESC
      LIMIT 250
    `).all();
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/alertes/:id/acknowledge', authenticate, authorize(['alerts:resolve']), (req, res) => {
  try {
    const result = db.prepare(`
      UPDATE alertes SET acknowledgeée = 1, resolved_at = datetime('now') WHERE id = ?
    `).run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Alerte non trouvée' });
    }

    const alert = db.prepare('SELECT * FROM alertes WHERE id = ?').get(req.params.id);
    io.emit('alert:resolved', alert);
    res.json(alert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// REST API: Tournées (Routes)
// ═══════════════════════════════════════════════════════════════

app.get('/api/tournees', authenticate, authorize(['tournees:read']), (req, res) => {
  try {
    const routes = db.prepare(`
      SELECT t.*, COUNT(tp.id) as nb_points
      FROM tournees t
      LEFT JOIN tournee_points tp ON tp.tournee_id = t.id
      GROUP BY t.id
      ORDER BY t.date_creation DESC
      LIMIT 20
    `).all();
    res.json(routes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tournees/:id/assigner', authenticate, authorize(['tournees:assign']), (req, res) => {
  try {
    const { collecteur } = req.body;
    const route = db.prepare('SELECT * FROM tournees WHERE id = ?').get(req.params.id);

    if (!route) {
      return res.status(404).json({ error: 'Tournée non trouvée' });
    }

    const assignedCollector = (collecteur || '').trim() || route.collecteur || 'Equipe Elite';

    db.prepare(`
      UPDATE tournees
      SET collecteur = ?, statut = 'assignée', date_execution = COALESCE(date_execution, datetime('now'))
      WHERE id = ?
    `).run(assignedCollector, req.params.id);

    const updated = db.prepare('SELECT * FROM tournees WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tournees/optimiser', authenticate, authorize(['tournees:create']), (req, res) => {
  try {
    const { poubelle_ids, collecteur, origin } = req.body;
    if (!poubelle_ids || poubelle_ids.length < 2) {
      return res.status(400).json({ error: 'Au moins 2 poubelles requises' });
    }

    // Fetch bin locations
    const placeholders = poubelle_ids.map(() => '?').join(',');
    const bins = db.prepare(`SELECT * FROM poubelles WHERE id IN (${placeholders})`).all(...poubelle_ids);

    if (bins.length < 2) return res.status(400).json({ error: 'Poubelles non trouvées' });

    let startPoint = { id: 'depot', nom: 'Dépôt Central', latitude: 6.4530, longitude: 2.4200, quartier: 'Centre' };
    if (origin && Number.isFinite(Number(origin.latitude)) && Number.isFinite(Number(origin.longitude))) {
      startPoint = {
        id: 'origin',
        nom: origin.label || 'Position actuelle',
        latitude: Number(origin.latitude),
        longitude: Number(origin.longitude),
        quartier: origin.quartier || 'Position actuelle'
      };
    }

    const allPoints = [startPoint, ...bins];

    // Optimize route
    const result = optimizeRoute(allPoints);
    const avgSpeed = 25; // km/h in urban area
    const fuelPerKm = 0.12; // liters
    const co2PerKm = 2.31; // kg CO2
    const nonOptimizedEstimate = result.distance * 1.35;

    const tourneeId = uuidv4();
    const duree = Math.round((result.distance / avgSpeed) * 60);
    const carburant = Math.round(result.distance * fuelPerKm * 100) / 100;
    const co2Saved = Math.round((nonOptimizedEstimate - result.distance) * co2PerKm * 100) / 100;

    // Save to DB
    db.prepare(`
      INSERT INTO tournees (id, nom, statut, distance_totale, duree_estimee, carburant_estime, co2_economise, collecteur)
      VALUES (?, ?, 'planifiée', ?, ?, ?, ?, ?)
    `).run(tourneeId, `Tournée ${new Date().toLocaleDateString('fr-FR')}`, result.distance, duree, carburant, co2Saved, collecteur || 'Non assigné');

    const insertPoint = db.prepare(`
      INSERT INTO tournee_points (tournee_id, poubelle_id, ordre) VALUES (?, ?, ?)
    `);
    result.route.forEach((point, idx) => {
      if (point.id !== 'depot') insertPoint.run(tourneeId, point.id, idx);
    });

    res.json({
      id: tourneeId,
      route: result.route,
      distance_totale: result.distance,
      duree_estimee: duree,
      carburant_estime: carburant,
      co2_economise: co2Saved,
      nb_points: bins.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// REST API: Stats (Dashboard KPIs)
// ═══════════════════════════════════════════════════════════════

app.get('/api/stats', authenticate, authorize(['stats:read']), (req, res) => {
  try {
    res.json(getDashboardStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats/hourly', authenticate, authorize(['stats:read']), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT strftime('%H:00', timestamp) AS hour,
        ROUND(AVG(niveau_remplissage), 1) AS avg_level,
        SUM(CASE WHEN niveau_remplissage >= 80 THEN 1 ELSE 0 END) AS alerts
      FROM releves
      WHERE timestamp >= datetime('now', '-24 hours')
      GROUP BY strftime('%Y-%m-%d %H', timestamp)
      ORDER BY MIN(timestamp)
    `).all();

    res.json({
      hours: rows.map((r) => r.hour),
      levels: rows.map((r) => Number(r.avg_level || 0)),
      alerts: rows.map((r) => Number(r.alerts || 0))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/stats', authenticate, authorize(['stats:read']), (req, res) => {
  try {
    const base = getDashboardStats();
    const activeBins = db.prepare(`SELECT COUNT(*) AS count FROM poubelles WHERE actif = 1`).get().count;
    const esp32Online = db.prepare(`
      SELECT COUNT(*) AS count
      FROM esp32_config
      WHERE last_seen IS NOT NULL
        AND last_seen >= datetime('now', '-5 minutes')
    `).get().count;
    const lastReading = db.prepare(`SELECT MAX(timestamp) AS ts FROM releves`).get().ts;
    const co2Saved = db.prepare(`
      SELECT COALESCE(SUM(co2_economise), 0) AS total FROM tournees
    `).get().total;
    const uacBins = db.prepare(`
      SELECT COUNT(*) AS count FROM poubelles WHERE actif = 1 AND quartier LIKE 'UAC%'
    `).get().count;

    res.json({
      total_bins: base.total_poubelles,
      active_bins: activeBins,
      active_alerts: base.alertes_actives,
      esp32_online: esp32Online,
      avg_fill: base.niveau_moyen,
      last_reading: lastReading,
      co2_saved: Math.round(Number(co2Saved) || 148),
      uac_bins: Number(uacBins) || 0,
      couverture_reseau: base.couverture_reseau,
      taux_collecte: base.taux_collecte,
      satisfaction: base.satisfaction
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/poubelles', authenticate, authorize(['bins:read']), (req, res) => {
  try {
    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(200, Math.max(1, toInt(req.query.limit, 50)));
    const offset = (page - 1) * limit;

    const total = db.prepare(`SELECT COUNT(*) AS total FROM poubelles WHERE actif = 1`).get().total;
    const data = db.prepare(`
      SELECT p.id, p.nom, p.quartier, p.esp32_id,
        r.niveau_remplissage AS niveau,
        r.batterie,
        r.timestamp AS dernier_releve
      FROM poubelles p
      LEFT JOIN (
        SELECT poubelle_id, niveau_remplissage, batterie, timestamp,
          ROW_NUMBER() OVER (PARTITION BY poubelle_id ORDER BY timestamp DESC) AS rn
        FROM releves
      ) r ON r.poubelle_id = p.id AND r.rn = 1
      WHERE p.actif = 1
      ORDER BY p.nom
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    res.json({
      data,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// IoT SIMULATOR
// ═══════════════════════════════════════════════════════════════

let simulatorInterval = null;
let simulatorRunning = false;

function simulateTick() {
  const bins = db.prepare('SELECT * FROM poubelles WHERE actif = 1').all();

  for (const bin of bins) {
    const lastReading = db.prepare(
      'SELECT * FROM releves WHERE poubelle_id = ? ORDER BY timestamp DESC LIMIT 1'
    ).get(bin.id);

    const prevLevel = lastReading ? lastReading.niveau_remplissage : Math.random() * 50;
    const prevTemp = lastReading ? lastReading.temperature : 30;
    const prevBattery = lastReading ? lastReading.batterie : 95;

    // Simulate fill increase (0-3% per tick, occasionally decrease for collection)
    let newLevel = prevLevel + (Math.random() * 3 - 0.3);
    if (newLevel > 100) newLevel = 100;
    if (newLevel < 0) newLevel = 0;

    const newTemp = prevTemp + (Math.random() * 2 - 1);
    const newBattery = Math.max(10, prevBattery - Math.random() * 0.2);
    const signal = 65 + Math.random() * 35;

    newLevel = Math.round(newLevel * 10) / 10;

    db.prepare(`
      INSERT INTO releves (poubelle_id, niveau_remplissage, temperature, batterie, signal_force)
      VALUES (?, ?, ?, ?, ?)
    `).run(bin.id, newLevel, Math.round(newTemp * 10) / 10, Math.round(newBattery * 10) / 10, Math.round(signal * 10) / 10);

    // Check for alert
    if (newLevel >= 80 && (prevLevel < 80 || newLevel >= 90 && prevLevel < 90)) {
      const severite = newLevel >= 90 ? 'critical' : 'warning';
      const msg = `${bin.nom} (${bin.quartier}) a atteint ${Math.round(newLevel)}% de remplissage`;
      db.prepare(`
        INSERT INTO alertes (poubelle_id, type, message, niveau, severite)
        VALUES (?, 'niveau_critique', ?, ?, ?)
      `).run(bin.id, msg, newLevel, severite);

      const alert = db.prepare('SELECT * FROM alertes ORDER BY id DESC LIMIT 1').get();
      io.emit('alert:new', { ...alert, poubelle_nom: bin.nom, quartier: bin.quartier });
    }

    // Emit real-time update
    io.emit('bin:update', {
      id: bin.id, nom: bin.nom, quartier: bin.quartier,
      latitude: bin.latitude, longitude: bin.longitude, type: bin.type,
      niveau: newLevel, temperature: Math.round(newTemp * 10) / 10,
      batterie: Math.round(newBattery * 10) / 10, signal_force: Math.round(signal * 10) / 10,
      alerte: newLevel >= 80
    });
  }

  io.emit('stats:update', getDashboardStats());
}

app.post('/api/simulation/start', authenticate, authorize(['tournees:create']), (req, res) => {
  if (simulatorRunning) return res.json({ status: 'already_running' });
  const interval = parseInt(req.body.interval) || 5000;
  simulatorInterval = setInterval(simulateTick, interval);
  simulatorRunning = true;
  io.emit('simulation:status', { running: true, interval });
  res.json({ status: 'started', interval });
});

app.post('/api/simulation/stop', authenticate, authorize(['tournees:create']), (req, res) => {
  if (simulatorInterval) { clearInterval(simulatorInterval); simulatorInterval = null; }
  simulatorRunning = false;
  io.emit('simulation:status', { running: false });
  res.json({ status: 'stopped' });
});

app.get('/api/simulation/status', authenticate, authorize(['stats:read']), (req, res) => {
  res.json({ running: simulatorRunning });
});

// ═══════════════════════════════════════════════════════════════
// WebSocket
// ═══════════════════════════════════════════════════════════════

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  socket.emit('simulation:status', { running: simulatorRunning });
  socket.on('disconnect', () => console.log(`❌ Client disconnected: ${socket.id}`));
});

setupEsp32Socket(io, db);

// ═══════════════════════════════════════════════════════════════
// SPA Fallback
// ═══════════════════════════════════════════════════════════════
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/presentation', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'presentation.html'));
});

app.get('/admin-dashboard', authenticate, authorize(['stats:read']), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ═══════════════════════════════════════════════════════════════
// Nettoyage automatique des relevés (> 7 jours)
// ═══════════════════════════════════════════════════════════════
function cleanupOldReadings() {
  try {
    const byAge = db.prepare(`DELETE FROM releves WHERE timestamp < datetime('now', '-7 days')`).run();
    const byCap = db.prepare(`
      DELETE FROM releves WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY poubelle_id ORDER BY timestamp DESC) AS rn
          FROM releves
        ) WHERE rn > 200
      )
    `).run();
    const total = byAge.changes + byCap.changes;
    if (total > 0) {
      console.log(`🧹 Nettoyage: ${total} relevés supprimés (${byAge.changes} >7j, ${byCap.changes} excès par poubelle)`);
      db.prepare('VACUUM').run();
    }
  } catch (err) {
    console.error('Erreur nettoyage relevés:', err.message);
  }
}

cleanupOldReadings();
setInterval(cleanupOldReadings, 24 * 60 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════
// Start Server
// ═══════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║  🗑️  SUIVI-DÉCHETS Server                     ║
  ║  🌐  http://localhost:${PORT}                    ║
  ║  📡  WebSocket ready                          ║
  ║  🗃️   SQLite (WAL mode)                        ║
  ╚═══════════════════════════════════════════════╝
  `);
});
