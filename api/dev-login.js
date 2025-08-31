const crypto = require('crypto');
const { pool } = require('./_db');

function days(n){ return n*24*60*60; }

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const uid  = url.searchParams.get('uid');
    const name = url.searchParams.get('name') || 'DevUser';

    if (!uid) { res.status(400).json({ ok:false, error:'no_uid' }); return; }

    const u = await pool.query(
      `insert into users (tg_id, display_name)
         values ($1,$2)
       on conflict (tg_id) do update set display_name = excluded.display_name
       returning id`,
      [Number(uid), name]
    );
    const userId = u.rows[0].id;

    const token = crypto.randomBytes(32).toString('hex');
    const exp   = new Date(Date.now() + 14*24*3600*1000);
    await pool.query('insert into sessions(token, user_id, expires_at) values ($1,$2,$3)', [token, userId, exp]);

    res.setHeader('Set-Cookie',
      `auth=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${days(14)}`
    );
    res.json({ ok:true, userId });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
};
