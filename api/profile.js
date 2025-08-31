const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized:false } });

async function userId(req){
  const token = (req.headers.cookie || '').split('; ').find(c => c.startsWith('auth='))?.split('=')[1] || '';
  if (!token) return null;
  const { rows } = await pool.query('select user_id from sessions where token=$1 and expires_at>now()', [token]);
  return rows[0]?.user_id || null;
}

module.exports = async (req, res) => {
  const uid = await userId(req);
  if (!uid) { res.status(401).json({ ok:false }); return; }

  if (req.method === 'GET') {
    const { rows } = await pool.query('select display_name, avatar_url, locale from users where id=$1', [uid]);
    res.json({ ok:true, profile: rows[0] || {} });
    return;
  }

  if (req.method === 'PUT') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const name = (body?.display_name || '').slice(0,80);
    const locale = (body?.locale === 'ky' ? 'ky' : 'ru');
    await pool.query('update users set display_name=$1, locale=$2 where id=$3', [name, locale, uid]);
    res.json({ ok:true }); return;
  }

  res.status(405).end();
};
