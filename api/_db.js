// api/_db.js
const { Pool } = require('pg');

function sanitize(url) {
  try {
    const u = new URL(url);
    // на всякий случай выкидываем sslmode из URL, чтобы он не спорил с нашими опциями
    u.searchParams.delete('sslmode');
    return u.toString();
  } catch {
    return url;
  }
}

const pool = new Pool({
  connectionString: sanitize(process.env.DATABASE_URL),
  ssl: { rejectUnauthorized: false },
});

module.exports = { pool };
