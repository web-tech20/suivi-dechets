-- ── TABLE: users ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  mot_de_passe TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'OBSERVATEUR',
  actif BOOLEAN DEFAULT true,
  email_verifie BOOLEAN DEFAULT false,
  token_verification TEXT,
  token_reset TEXT,
  token_reset_expire TIMESTAMP,
  refresh_token TEXT,
  double_facteur_actif BOOLEAN DEFAULT false,
  double_facteur_secret TEXT,
  date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_token_verif ON users(token_verification);
CREATE INDEX IF NOT EXISTS idx_users_token_reset ON users(token_reset);
