-- ── TABLE: releves (Sensor readings) ──────────────────────────
CREATE TABLE IF NOT EXISTS releves (
  id SERIAL PRIMARY KEY,
  poubelle_id TEXT NOT NULL REFERENCES poubelles(id) ON DELETE CASCADE,
  niveau_remplissage DOUBLE PRECISION NOT NULL,
  temperature DOUBLE PRECISION,
  batterie DOUBLE PRECISION,
  signal_force DOUBLE PRECISION,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_releves_poubelle ON releves(poubelle_id);
CREATE INDEX IF NOT EXISTS idx_releves_timestamp ON releves(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_releves_poubelle_time ON releves(poubelle_id, timestamp DESC);

-- ── TABLE: alertes (Alert log) ────────────────────────────────
CREATE TABLE IF NOT EXISTS alertes (
  id SERIAL PRIMARY KEY,
  poubelle_id TEXT NOT NULL REFERENCES poubelles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  niveau DOUBLE PRECISION,
  severite TEXT DEFAULT 'warning',
  acknowledgee BOOLEAN DEFAULT false,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alertes_active ON alertes(acknowledgee, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alertes_poubelle ON alertes(poubelle_id);

-- ── TABLE: tournees (Collection routes) ──────────────────────
CREATE TABLE IF NOT EXISTS tournees (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  date_execution TIMESTAMP,
  statut TEXT DEFAULT 'planifiée',
  distance_totale DOUBLE PRECISION,
  duree_estimee INTEGER,
  carburant_estime DOUBLE PRECISION,
  co2_economise DOUBLE PRECISION,
  collecteur_id TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- ── TABLE: tournee_points (Waypoints) ─────────────────────────
CREATE TABLE IF NOT EXISTS tournee_points (
  id SERIAL PRIMARY KEY,
  tournee_id TEXT NOT NULL REFERENCES tournees(id) ON DELETE CASCADE,
  poubelle_id TEXT NOT NULL REFERENCES poubelles(id) ON DELETE CASCADE,
  ordre INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tournee_points_tour ON tournee_points(tournee_id);

-- ── TABLE: notifications (Communication history) ──────────────
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  canal TEXT NOT NULL,
  message TEXT NOT NULL,
  statut TEXT DEFAULT 'envoyé',
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);

-- ── TABLE: audit_logs (Activity logging) ──────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  ressource TEXT NOT NULL,
  ressource_id TEXT,
  details TEXT,
  ip_adresse TEXT,
  user_agent TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(timestamp DESC);
