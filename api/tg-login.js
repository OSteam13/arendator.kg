const crypto = require('crypto');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized:false } });

function days(n){ return n*24*60*60; }

module.exports = async (req, res) => {
  // В продакшене надо валидировать р hash от Telegram!
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const tg = body?.user;
  if (!tg?.id) { res.status(400).json({ ok:false, error:'no_user' }); return; }

  const u = await pool.query(
    `insert into users (tg_id, display_name, avatar_url)
       values ($1,$2,$3)
     on conflict (tg_id) do update set display_name=excluded.display_name, avatar_url=excluded.avatar_url
     returning id`,
    [tg.id, tg.first_name || tg.username || 'User', tg.photo_url || null]
  );
  const userId = u.rows[0].id;

  const token = crypto.randomBytes(32).toString('hex');
  const exp = new Date(Date.now() + 14*24*3600*1000);
  await pool.query('insert into sessions(token, user_id, expires_at) values ($1,$2,$3)', [token, userId, exp]);

  res.setHeader('Set-Cookie', [
    `auth=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${days(14)}`
  ]);
  res.json({ ok:true });
};
