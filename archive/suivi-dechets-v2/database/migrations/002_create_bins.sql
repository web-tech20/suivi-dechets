-- ── TABLE: poubelles ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poubelles (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL UNIQUE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  quartier TEXT NOT NULL,
  adresse TEXT,
  capacite_litres INTEGER DEFAULT 240,
  type TEXT DEFAULT 'general',
  date_installation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actif BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_poubelles_quartier ON poubelles(quartier);
CREATE INDEX IF NOT EXISTS idx_poubelles_coords ON poubelles(latitude, longitude);
