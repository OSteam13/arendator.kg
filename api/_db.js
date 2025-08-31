const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // важное место — не проверяем цепочку сертификатов у pooler'а
  ssl: { require: true, rejectUnauthorized: false },
});

module.exports = { pool };
