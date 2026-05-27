-- ============================================
-- SUIVI-DÉCHETS - Scalability migration
-- ============================================

-- Extend poubelles table
ALTER TABLE poubelles ADD COLUMN esp32_id TEXT;
ALTER TABLE poubelles ADD COLUMN seuil_alerte INTEGER DEFAULT 80;
ALTER TABLE poubelles ADD COLUMN dernier_releve DATETIME;
ALTER TABLE poubelles ADD COLUMN created_at DATETIME;
ALTER TABLE poubelles ADD COLUMN updated_at DATETIME;

-- Extend releves table
ALTER TABLE releves ADD COLUMN distance_ultrason INTEGER;
ALTER TABLE releves ADD COLUMN poids_estimate REAL;

-- Extend alertes table
ALTER TABLE alertes ADD COLUMN esp32_id TEXT;
ALTER TABLE alertes ADD COLUMN acknowledgee INTEGER DEFAULT 0;
ALTER TABLE alertes ADD COLUMN acknowledged_by TEXT;
ALTER TABLE alertes ADD COLUMN acknowledged_at DATETIME;

-- Keep legacy typo column in sync for compatibility
UPDATE alertes SET acknowledgee = acknowledgeée WHERE acknowledgee IS NULL;
UPDATE poubelles SET created_at = COALESCE(created_at, datetime('now'));
UPDATE poubelles SET updated_at = COALESCE(updated_at, datetime('now'));

-- Extend tournees table
ALTER TABLE tournees ADD COLUMN collecteur_id TEXT;
ALTER TABLE tournees ADD COLUMN points_ramassage TEXT;

-- New table: ESP32 config and status
CREATE TABLE IF NOT EXISTS esp32_config (
  esp32_id TEXT PRIMARY KEY,
  firmware_version TEXT,
  last_seen DATETIME,
  interval_secondes INTEGER DEFAULT 60,
  mode_veille INTEGER DEFAULT 1,
  threshold_alarme INTEGER DEFAULT 80,
  battery_saving INTEGER DEFAULT 1,
  uptime INTEGER,
  free_heap INTEGER,
  wifi_rssi INTEGER
);

-- New table: IoT logs
CREATE TABLE IF NOT EXISTS iot_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  esp32_id TEXT,
  remote_addr TEXT,
  method TEXT,
  endpoint TEXT,
  payload TEXT,
  response_code INTEGER,
  response_time_ms INTEGER,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_poubelles_esp32 ON poubelles(esp32_id);
CREATE INDEX IF NOT EXISTS idx_poubelles_quartier ON poubelles(quartier);
CREATE INDEX IF NOT EXISTS idx_poubelles_actif ON poubelles(actif);
CREATE INDEX IF NOT EXISTS idx_releves_poubelle_ts ON releves(poubelle_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_releves_ts ON releves(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alertes_esp32 ON alertes(esp32_id);
CREATE INDEX IF NOT EXISTS idx_iot_logs_esp32_ts ON iot_logs(esp32_id, timestamp DESC);
