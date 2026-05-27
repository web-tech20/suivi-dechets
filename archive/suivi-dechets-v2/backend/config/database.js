const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'suivi_dechets',
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'secure_password',
  max: 20, // Max concurrent clients in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('⚠️ Unexpected error on idle PostgreSQL client', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
