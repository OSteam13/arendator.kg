const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return res.status(405).end();

    const url = new URL(req.url, 'http://x');
    const id = Number(url.searchParams.get('uid'));
    const name = (url.searchParams.get('name') || 'DevUser').slice(0,80);
    if (!id) return res.status(400).json({ ok:false, error:'no_uid' });

    // создать/обновить пользователя
    const u = await pool.query(
      `insert into users (tg_id, display_name)
         values ($1,$2)
       on conflict (tg_id) do update set display_name=excluded.display_name
       returning id`,
      [id, name]
    );
    const userId = u.rows[0].id;

    // выдать сессию (кука auth)
    const token = crypto.randomBytes(32).toString('hex');
    const exp = new Date(Date.now() + 14*24*3600*1000);
    await pool.query('insert into sessions(token,user_id,expires_at) values ($1,$2,$3)', [token, userId, exp]);

    res.setHeader('Set-Cookie', `auth=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${14*24*60*60}`);
    res.json({ ok:true, userId, name });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
};
