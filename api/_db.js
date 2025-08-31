// api/_db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // главное — ОТКЛЮЧИТЬ проверку цепочки
  ssl: { rejectUnauthorized: false }
});

module.exports = { pool };
