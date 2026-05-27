-- 004_create_users.sql
-- Table des utilisateurs pour JWT Authentication

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nom TEXT,
  prenom TEXT,
  role TEXT DEFAULT 'OBSERVATEUR' CHECK(role IN ('SUPER_ADMIN', 'ADMIN', 'COLLECTEUR', 'OBSERVATEUR')),
  refresh_token TEXT,
  last_login DATETIME,
  actif INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
