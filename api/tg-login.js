const crypto = require('crypto');
const { pool } = require('./_db'); // ваш pg Pool

function days(n){ return n*24*60*60; }
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || '.arendator.kg'; // можно переопределить в превью

// HMAC-проверка данных Telegram Login Widget
function verifyTelegramQuery(q){
  if (!BOT_TOKEN) return { ok:false, error:'telegram_verify_failed:tg_bot_token_missing' };
  if (!q || !q.hash) return { ok:false, error:'telegram_verify_failed:no_hash' };

  // Формируем data_check_string: все пары кроме hash, отсортированы по ключу
  const parts = [];
  for (const [k, v] of Object.entries(q)) {
    if (k === 'hash' || typeof v === 'undefined') continue;
    parts.push(`${k}=${v}`);
  }
  parts.sort();
  const dataCheckString = parts.join('\n');

  // Ключ = SHA256(bot_token) (raw bytes), алгоритм = HMAC-SHA256, результат = hex
  const secret = crypto.createHash('sha256').update(BOT_TOKEN).digest();
  const sign   = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  if (sign !== q.hash) return { ok:false, error:'telegram_verify_failed:bad_hash' };

  // (необязательно) истечение 1 суток
  if (q.auth_date && (Date.now()/1000 - Number(q.auth_date) > 86400)) {
    return { ok:false, error:'telegram_verify_failed:expired' };
  }
  return { ok:true };
}

// Утилита для редиректа назад
function redirect(res, back, extraQuery){
  const sep = back.includes('?') ? '&' : '?';
  res.writeHead(302, { Location: extraQuery ? `${back}${sep}${extraQuery}` : back });
  res.end();
}

module.exports = async (req, res) => {
  try {
    const q = req.query || {};
    const back = (q.return_to || q.back || '/').toString();

    // Верифицируем данные от Telegram
    const ver = verifyTelegramQuery(q);
    if (!ver.ok) {
      if (req.method === 'GET') return redirect(res, back, `tg=err&reason=${encodeURIComponent(ver.error)}`);
      return res.status(400).json({ ok:false, error: ver.error });
    }

    // Достаём пользователя из query (виджет может прислать отдельные поля или user=JSON)
    let tg = null;
    if (q.user) {
      try { tg = JSON.parse(q.user); } catch(_){ /* игнор */ }
    }
    if (!tg) {
      tg = {
        id: Number(q.id),
        first_name: q.first_name || '',
        last_name : q.last_name  || '',
        username  : q.username   || '',
        photo_url : q.photo_url  || null
      };
    }
    if (!tg?.id) {
      if (req.method === 'GET') return redirect(res, back, 'tg=err&reason=no_user');
      return res.status(400).json({ ok:false, error:'no_user' });
    }

    // upsert пользователя по tg_id
    const up = await pool.query(
      `insert into users (tg_id, display_name, avatar_url)
       values ($1,$2,$3)
       on conflict (tg_id) do update
         set display_name = excluded.display_name,
             avatar_url   = excluded.avatar_url
       returning id`,
      [tg.id, (tg.first_name || tg.username || 'User'), tg.photo_url || null]
    );
    const userId = up.rows[0].id;

    // создаём сессию
    const token = crypto.randomBytes(32).toString('hex');
    const exp   = new Date(Date.now() + 14*24*3600*1000);
    await pool.query(
      'insert into sessions(token, user_id, expires_at) values ($1,$2,$3)',
      [token, userId, exp]
    );

    // кука сессии
    const cookie = [
      `auth=${token}`,
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      `Max-Age=${days(14)}`,
      COOKIE_DOMAIN ? `Domain=${COOKIE_DOMAIN}` : null
    ].filter(Boolean).join('; ');
    res.setHeader('Set-Cookie', cookie);

    // GET → редиректим назад; POST → JSON
    if (req.method === 'GET') return redirect(res, back, 'tg=ok');
    return res.json({ ok:true });
  } catch (e) {
    if (req.method === 'GET') {
      // чтобы не застревать на белой странице — редиректим назад с причиной
      return redirect(res, (req.query?.return_to || '/') + '', `tg=err&reason=${encodeURIComponent(e.message)}`);
    }
    res.status(500).json({ ok:false, error: e.message });
  }
};
