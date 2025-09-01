const crypto = require('crypto');
const { pool } = require('./_db');

function days(n){ return n * 24 * 60 * 60; }

// Достаём данные юзера из POST JSON или из query (Telegram widget)
function getTelegramUser(req){
  // 1) POST JSON
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (body?.user?.id) return body.user;
    if (body?.id)       return body;
  } catch(_) {}

  // 2) GET query (Telegram присылает так)
  const q = req.query || {};
  if (q.id) {
    return {
      id: Number(q.id),
      first_name: q.first_name || '',
      last_name : q.last_name  || '',
      username  : q.username   || '',
      photo_url : q.photo_url  || ''
    };
  }
  return null;
}

module.exports = async (req, res) => {
  try {
    const tg = getTelegramUser(req);
    if (!tg?.id) { res.status(400).json({ ok:false, error:'no_user' }); return; }

    // upsert пользователя по tg_id
    const { rows } = await pool.query(
      `insert into users (tg_id, display_name, avatar_url)
       values ($1,$2,$3)
       on conflict (tg_id) do update
         set display_name = excluded.display_name,
             avatar_url   = excluded.avatar_url
       returning id`,
      [tg.id, tg.first_name || tg.username || 'User', tg.photo_url || null]
    );
    const userId = rows[0].id;

    // создаём сессию и куку
    const token = crypto.randomBytes(32).toString('hex');
    const exp   = new Date(Date.now() + 14*24*3600*1000);
    await pool.query(
      'insert into sessions(token, user_id, expires_at) values ($1,$2,$3)',
      [token, userId, exp]
    );

    const cookie = [
      `auth=${token}`,
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      `Max-Age=${days(14)}`,
      // если работаешь на arendator.kg и www.arendator.kg:
      // 'Domain=.arendator.kg'
    ].join('; ');
    res.setHeader('Set-Cookie', cookie);

    // Telegram шлёт GET → возвращаем редирект на сайт,
    // из клиента/тестов можно продолжать использовать POST и получать JSON.
    if (req.method === 'GET') {
      const back = (req.query && (req.query.return_to || req.query.back)) || '/';
      res.writeHead(302, { Location: back });
      res.end();
    } else {
      res.json({ ok:true });
    }
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
};
