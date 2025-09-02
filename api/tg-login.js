const crypto = require('crypto');
const { pool } = require('./_db');

function days(n){ return n*24*60*60; }

const BOT_TOKEN      = process.env.TELEGRAM_BOT_TOKEN;
const COOKIE_DOMAIN  = process.env.COOKIE_DOMAIN || '.arendator.kg';
const CANONICAL_ORIGIN = process.env.CANONICAL_ORIGIN || 'https://arendator.kg';

// ------- верификация (как у тебя) -------
function verifyTelegramQuery(q){
  if (!BOT_TOKEN) return { ok:false, error:'telegram_verify_failed:tg_bot_token_missing' };
  if (!q || !q.hash) return { ok:false, error:'telegram_verify_failed:no_hash' };
  const parts = [];
  for (const [k, v] of Object.entries(q)) {
    if (k === 'hash' || typeof v === 'undefined') continue;
    parts.push(`${k}=${v}`);
  }
  parts.sort();
  const dataCheckString = parts.join('\n');
  const secret = crypto.createHash('sha256').update(BOT_TOKEN).digest();
  const sign   = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (sign !== q.hash) return { ok:false, error:'telegram_verify_failed:bad_hash' };
  if (q.auth_date && (Date.now()/1000 - Number(q.auth_date) > 86400)) {
    return { ok:false, error:'telegram_verify_failed:expired' };
  }
  return { ok:true };
}

function absBack(back){
  // Разрешаем только относительные возвраты, любые абсолютные чистим до '/'
  try {
    if (!back || typeof back !== 'string') return `${CANONICAL_ORIGIN}/`;
    if (/^https?:/i.test(back)) return `${CANONICAL_ORIGIN}/`;
    // нормализуем двойные слэши
    return `${CANONICAL_ORIGIN}${back.startsWith('/') ? back : `/${back}`}`;
  } catch { return `${CANONICAL_ORIGIN}/`; }
}

module.exports = async (req, res) => {
  try {
    const q = req.query || {};
    const backRel = (q.return_to || q.back || '/').toString();
    const backAbs = absBack(backRel);

    const ver = verifyTelegramQuery(q);
    if (!ver.ok) {
      res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');
      const url = new URL(backAbs);
      url.searchParams.set('tg','err');
      url.searchParams.set('reason', ver.error);
      res.writeHead(302, { Location: url.toString() });
      return res.end();
    }

    // собрать объект tg-пользователя
    let tg = null;
    if (q.user) { try { tg = JSON.parse(q.user); } catch(_){} }
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
      res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');
      const url = new URL(backAbs);
      url.searchParams.set('tg','err');
      url.searchParams.set('reason','no_user');
      res.writeHead(302, { Location: url.toString() });
      return res.end();
    }

    // upsert юзера
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

    // сессия
    const token = crypto.randomBytes(32).toString('hex');
    const exp   = new Date(Date.now() + 14*24*3600*1000);
    await pool.query(
      'insert into sessions(token, user_id, expires_at) values ($1,$2,$3)',
      [token, userId, exp]
    );

    // кука
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

    // очень важно: запрет кэширования 302 с Set-Cookie
    res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');

    // редиректим обратно на абсолютный адрес
    const url = new URL(backAbs);
    url.searchParams.set('tg','ok');
    res.writeHead(302, { Location: url.toString() });
    return res.end();
  } catch (e) {
    res.setHeader('Cache-Control','no-store');
    const back = absBack((req.query && (req.query.return_to || req.query.back)) || '/');
    const url = new URL(back);
    url.searchParams.set('tg','err');
    url.searchParams.set('reason', e.message || 'server_error');
    res.writeHead(302, { Location: url.toString() });
    return res.end();
  }
};
