const express = require('express');

function createIotRouter({ db, io, getEsp32Token }) {
  const router = express.Router();

  function isValidToken(req) {
    const token = req.headers['x-esp32-token'];
    return Boolean(token && token === getEsp32Token());
  }

  function upsertIotLog(payload) {
    db.prepare(`
      INSERT INTO iot_logs (esp32_id, remote_addr, method, endpoint, payload, response_code, response_time_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.esp32_id || null,
      payload.remote_addr || null,
      payload.method || null,
      payload.endpoint || null,
      payload.payload || null,
      payload.response_code ?? null,
      payload.response_time_ms ?? null
    );
  }

  router.post('/releve', (req, res) => {
    const startTime = Date.now();
    const { esp32_id, niveau, temperature, batterie, signal, distance, poids } = req.body || {};

    if (!isValidToken(req)) {
      upsertIotLog({
        esp32_id,
        remote_addr: req.ip,
        method: 'POST',
        endpoint: '/api/iot/releve',
        payload: JSON.stringify(req.body || {}),
        response_code: 401,
        response_time_ms: Date.now() - startTime
      });
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!esp32_id || typeof niveau !== 'number') {
      upsertIotLog({
        esp32_id,
        remote_addr: req.ip,
        method: 'POST',
        endpoint: '/api/iot/releve',
        payload: JSON.stringify(req.body || {}),
        response_code: 400,
        response_time_ms: Date.now() - startTime
      });
      return res.status(400).json({ error: 'esp32_id et niveau sont requis' });
    }

    let poubelle = db.prepare('SELECT id, nom, seuil_alerte FROM poubelles WHERE esp32_id = ?').get(esp32_id);
    if (!poubelle) {
      const newId = `PBL-${Date.now()}`;
      db.prepare(`
        INSERT INTO poubelles (id, esp32_id, nom, latitude, longitude, quartier, adresse, actif)
        VALUES (?, ?, ?, ?, ?, 'Non assigné', 'Auto-enregistré IoT', 1)
      `).run(newId, esp32_id, newId, 6.4486, 2.3553);
      poubelle = db.prepare('SELECT id, nom, seuil_alerte FROM poubelles WHERE esp32_id = ?').get(esp32_id);
      console.log(`🆕 Nouvel ESP32 enregistré: ${esp32_id} -> ${newId}`);
    }

    db.prepare(`
      INSERT INTO releves (poubelle_id, niveau_remplissage, temperature, batterie, signal_force, distance_ultrason, poids_estimate)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      poubelle.id,
      Number(niveau),
      temperature ?? null,
      batterie ?? null,
      signal ?? null,
      distance ?? null,
      poids ?? null
    );

    db.prepare(`
      UPDATE poubelles
      SET dernier_releve = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(poubelle.id);

    db.prepare(`
      INSERT INTO esp32_config (esp32_id, last_seen)
      VALUES (?, datetime('now'))
      ON CONFLICT(esp32_id) DO UPDATE SET last_seen = excluded.last_seen
    `).run(esp32_id);

    const seuil = Number(poubelle.seuil_alerte || 80);
    let alertCreated = false;
    if (Number(niveau) >= seuil) {
      const severite = Number(niveau) >= 90 ? 'critical' : 'warning';
      const message = `${poubelle.nom} a atteint ${Math.round(Number(niveau))}% de remplissage (seuil ${seuil}%)`;
      db.prepare(`
        INSERT INTO alertes (poubelle_id, esp32_id, type, message, niveau, severite, acknowledgee, acknowledgeée)
        VALUES (?, ?, 'niveau_critique', ?, ?, ?, 0, 0)
      `).run(poubelle.id, esp32_id, message, Number(niveau), severite);

      const alert = db.prepare(`
        SELECT a.*, p.nom AS poubelle_nom, p.quartier
        FROM alertes a JOIN poubelles p ON p.id = a.poubelle_id
        ORDER BY a.id DESC LIMIT 1
      `).get();
      io.emit('alert:new', alert);
      alertCreated = true;
    }

    const latest = db.prepare(`
      SELECT p.*, r.niveau_remplissage AS niveau, r.temperature, r.batterie, r.signal_force, r.timestamp AS dernier_releve
      FROM poubelles p
      JOIN releves r ON r.poubelle_id = p.id
      WHERE p.id = ?
      ORDER BY r.timestamp DESC LIMIT 1
    `).get(poubelle.id);
    io.emit('bin:update', latest);

    upsertIotLog({
      esp32_id,
      remote_addr: req.ip,
      method: 'POST',
      endpoint: '/api/iot/releve',
      payload: null,
      response_code: 200,
      response_time_ms: Date.now() - startTime
    });

    return res.json({ status: 'ok', alert: alertCreated, seuil, interval: 60 });
  });

  router.get('/config', (req, res) => {
    const { esp32_id } = req.query;
    if (!isValidToken(req)) return res.status(401).json({ error: 'Unauthorized' });
    if (!esp32_id) return res.status(400).json({ error: 'esp32_id requis' });

    const config = db.prepare('SELECT * FROM esp32_config WHERE esp32_id = ?').get(String(esp32_id));
    return res.json({
      interval_secondes: config?.interval_secondes || 60,
      mode_veille: config?.mode_veille || 1,
      threshold_alarme: config?.threshold_alarme || 80,
      battery_saving: config?.battery_saving || 1
    });
  });

  router.post('/config', (req, res) => {
    const { esp32_id, interval_secondes, mode_veille, threshold_alarme, battery_saving } = req.body || {};
    if (!isValidToken(req)) return res.status(401).json({ error: 'Unauthorized' });
    if (!esp32_id) return res.status(400).json({ error: 'esp32_id requis' });

    db.prepare(`
      INSERT INTO esp32_config (esp32_id, interval_secondes, mode_veille, threshold_alarme, battery_saving, last_seen)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(esp32_id) DO UPDATE SET
        interval_secondes = excluded.interval_secondes,
        mode_veille = excluded.mode_veille,
        threshold_alarme = excluded.threshold_alarme,
        battery_saving = excluded.battery_saving,
        last_seen = excluded.last_seen
    `).run(
      esp32_id,
      Number(interval_secondes ?? 60),
      Number(mode_veille ?? 1),
      Number(threshold_alarme ?? 80),
      Number(battery_saving ?? 1)
    );

    return res.json({ status: 'ok' });
  });

  router.post('/status', (req, res) => {
    const { esp32_id, uptime_seconds, free_heap, wifi_rssi, firmware_version } = req.body || {};
    if (!isValidToken(req)) return res.status(401).json({ error: 'Unauthorized' });
    if (!esp32_id) return res.status(400).json({ error: 'esp32_id requis' });

    db.prepare(`
      INSERT INTO esp32_config (esp32_id, uptime, free_heap, wifi_rssi, firmware_version, last_seen)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(esp32_id) DO UPDATE SET
        uptime = excluded.uptime,
        free_heap = excluded.free_heap,
        wifi_rssi = excluded.wifi_rssi,
        firmware_version = COALESCE(excluded.firmware_version, esp32_config.firmware_version),
        last_seen = excluded.last_seen
    `).run(
      esp32_id,
      Number(uptime_seconds ?? 0),
      Number(free_heap ?? 0),
      Number(wifi_rssi ?? 0),
      firmware_version || null
    );

    return res.json({ status: 'ok' });
  });

  return router;
}

module.exports = { createIotRouter };
