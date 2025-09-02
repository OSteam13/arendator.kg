// /api/tg-login.js
const crypto = require('crypto');
const { pool } = require('./_db');

function days(n){ return n * 24 * 60 * 60; }
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || '.arendator.kg';
const BOT_TOKEN = process.env.TG_BOT_TOKEN; // обязателен в проде

// Собираем user-объект из body или query
function readPayload(req){
  let q = req.query || {};
  // req.body в Vercel может быть строкой или объектом
  let b = req.body;
  if (typeof b === 'string'){
    try { b = JSON.parse(b); } catch { b = Object.fromEntries(new URLSearchParams(b)); }
  }
  const src = (b && Object.keys(b).length) ? b : q;
  return {
    raw: src,
    user: src && src.id ? {
      id        : Number(src.id),
      first_name: src.first_name || '',
      last_name : src.last_name  || '',
      username  : src.username   || '',
      photo_url : src.photo_url  || ''
    } : null
  };
}

// Проверка подписи Telegram (https://core.telegram.org/widgets/login#checking-authorization)
function verifyTelegram(raw){
  if (!BOT_TOKEN) return { ok:false, reason:'tg_bot_token_missing' };
  if (!raw || !raw.hash || !raw.auth_date) return { ok:false, reason:'missing_hash_or_auth_date' };

  // Формируем checkString
  const data = Object.keys(raw)
    .filter(k => k !== 'hash' && raw[k] !== undefined && raw[k] !== null)
    .sort()
    .map(k => `${k}=${raw[k]}`)
    .join('\n');

  const secret = crypto.createHash('sha256').update(BOT_TOKEN).digest();
  const calc   = crypto.createHmac('sha256', secret).update(data).digest('hex');

  try {
    const a = Buffer.from(calc, 'hex');
    const b = Buffer.from(String(raw.hash), 'hex');
    if (a.length !== b.length) return { ok:false, reason:'bad_hash' };
    const equal = crypto.timingSafeEqual(a, b);
    return { ok: equal, reason: equal ? null : 'bad_hash' };
  } catch {
    // если hash не hex — тоже отказ
    return { ok:false, reason:'bad_hash_format' };
  }
}

function buildCookie(token){
  return [
    `auth=${token}`,
    'Path=/',
    `Domain=${COOKIE_DOMAIN}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${days(14)}`
  ].join('; ');
}

function safeBack(input){
  // принимаем только внутренние пути
  try {
    const val = decodeURIComponent(input || '/');
    return (typeof val === 'string' && val.startsWith('/')) ? val : '/';
  } catch { return '/'; }
}

module.exports = async (req, res) => {
  // не кешировать ответы авторизации
  res.setHeader('Cache-Control', 'no-store');

  try {
    const { raw, user } = readPayload(req);
    const back = safeBack((req.query && (req.query.return_to || req.query.back)) || '/');

    if (!user?.id){
      // попали сюда прямой ссылкой без данных от Telegram
      res.status(400).json({ ok:false, error:'no_user_from_telegram' });
      return;
    }

    // Проверка подписи (в деве можно временно отключить через ALLOW_INSECURE_TG=1)
    const skipVerify = process.env.ALLOW_INSECURE_TG === '1';
    const ver = skipVerify ? { ok:true } : verifyTelegram(raw);
    if (!ver.ok){
      // Покажем понятную ошибку, чтобы не было "data must be Buffer/…"
      res.status(400).json({ ok:false, error:`telegram_verify_failed:${ver.reason||'unknown'}` });
      return;
    }

    // upsert пользователя по tg_id
    const { rows } = await pool.query(
      `insert into users (tg_id, display_name, avatar_url)
       values ($1,$2,$3)
       on conflict (tg_id) do update
         set display_name = excluded.display_name,
             avatar_url   = excluded.avatar_url
       returning id`,
      [user.id, user.first_name || user.username || 'User', user.photo_url || null]
    );
    const userId = rows[0].id;

    // создаём сессию
    const token = crypto.randomBytes(32).toString('hex');
    const exp   = new Date(Date.now() + 14*24*3600*1000);
    await pool.query(
      'insert into sessions(token, user_id, expires_at) values ($1,$2,$3)',
      [token, userId, exp]
    );

    // ставим куку на базовый домен
    res.setHeader('Set-Cookie', buildCookie(token));

    // GET → редиректим назад; POST → JSON
    if (req.method === 'GET'){
      res.writeHead(302, { Location: back });
      res.end();
    } else {
      res.json({ ok:true });
    }
  } catch (e) {
    // Не падаем "The 'data' argument must be ..." — отдаём понятный JSON
    res.status(500).json({ ok:false, error: String(e && e.message || e) });
  }
};
