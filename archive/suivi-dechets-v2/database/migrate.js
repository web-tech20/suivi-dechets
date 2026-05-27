const fs = require('fs');
const path = require('path');
const db = require('../backend/config/database');

async function runMigrations() {
  console.log('🚀 Running PostgreSQL Database Migrations...');

  const migrationsDir = path.join(__dirname, 'migrations');
  
  try {
    const files = fs.readdirSync(migrationsDir).sort();
    
    for (const file of files) {
      if (file.endsWith('.sql')) {
        console.log(`🔹 Executing migration: ${file}`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        
        await db.query(sql);
        console.log(`✅ Migration completed successfully: ${file}`);
      }
    }
    
    console.log('🎉 All PostgreSQL database tables initialized!');
  } catch (err) {
    console.error('❌ Error executing database migrations:', err.message);
    process.exit(1);
  } finally {
    db.pool.end();
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;
