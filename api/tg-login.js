// /api/tg-login.js
const crypto = require('crypto');
const { pool } = require('./_db');

const PROD_DOMAIN = 'arendator.kg';
const COOKIE_NAME = 'auth';
const SESSION_DAYS = 14;

function days(n){ return n * 24 * 60 * 60; } // в секундах (для Max-Age)

function readRawData(req){
  // Telegram Login Widget кладёт всё в query ?id=...&first_name=...&auth_date=...&hash=...
  if (req.method === 'GET' && req.query && Object.keys(req.query).length){
    return { ...req.query };
  }
  // Альтернатива: POST JSON (например, для локального теста)
  if (req.body){
    try {
      return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch(_) { /* ignore */ }
  }
  return {};
}

function buildCheckString(data){
  // Берём все поля кроме hash, сортируем и склеиваем "key=value" через \n
  const { hash, ...rest } = data;
  return Object.keys(rest)
    .sort()
    .map(k => `${k}=${rest[k]}`)
    .join('\n');
}

function verifyTelegram(data, botToken){
  if (!data || !data.hash) return false;
  const checkString = buildCheckString(data);
  const secret = crypto.createHash('sha256').update(botToken).digest(); // secret_key
  const hmac   = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
  if (hmac !== String(data.hash)) return false;

  // Доп. защита: auth_date не старше 10 минут
  const authDate = Number(data.auth_date || 0);
  if (!authDate) return false;
  const ageSec = Math.floor(Date.now()/1000) - authDate;
  return ageSec >= 0 && ageSec <= 10 * 60;
}

function makeCookie(token, req){
  const isHttps = (req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  const host    = String(req.headers.host || '').toLowerCase();

  // На чужом домене (например, *.vercel.app) браузер отвергнет Domain=.arendator.kg.
  // Ставим Domain только если действительно на (sub)domain arendator.kg
  const onProdDomain =
    host === PROD_DOMAIN || host.endsWith(`.${PROD_DOMAIN}`);

  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${days(SESSION_DAYS)}`,
    'HttpOnly',
    // Secure нужен в проде под https. Если у тебя весь прод — https, можно оставить всегда.
    isHttps ? 'Secure' : '',
    'SameSite=Lax',
    onProdDomain ? `Domain=.${PROD_DOMAIN}` : ''
  ].filter(Boolean);

  return parts.join('; ');
}

function sanitizeReturnTo(urlLike){
  // Разрешаем только относительные пути на сайте: "/...", иначе падаем на "/"
  if (typeof urlLike !== 'string') return '/';
  try {
    if (urlLike.startsWith('/')) return urlLike;
    // Иногда прилетает полная ссылка нашего же домена — проверим:
    const u = new URL(urlLike, `https://${PROD_DOMAIN}`);
    if (u.hostname === PROD_DOMAIN || u.hostname.endsWith(`.${PROD_DOMAIN}`)){
      return u.pathname + (u.search || '') + (u.hash || '');
    }
  } catch(_) {}
  return '/';
}

function canonicalRedirectIfNeeded(req, res){
  const host = String(req.headers.host || '').toLowerCase();
  if (host === PROD_DOMAIN || host.endsWith(`.${PROD_DOMAIN}`)) return false;

  // Перенаправляем на канонический домен (важно: до установки куки)
  const original = new URL(req.url, `https://${host}`);
  const target = new URL(original.pathname + original.search, `https://${PROD_DOMAIN}`);
  res.writeHead(308, { Location: target.toString(), 'Cache-Control': 'no-store' });
  res.end();
  return true;
}

module.exports = async (req, res) => {
  try {
    // Если пришли не на прод-домен — сразу 308 на arendator.kg, чтобы кука была общей
    if (req.method === 'GET' && canonicalRedirectIfNeeded(req, res)) return;

    const raw = readRawData(req);
    const isProd = process.env.NODE_ENV === 'production';
    const BOT_TOKEN = process.env.TG_BOT_TOKEN;

    // В проде требуем валидную подпись от Telegram
    if (isProd) {
      if (!verifyTelegram(raw, BOT_TOKEN)) {
        res.status(400).json({ ok:false, error:'bad_signature_or_expired' });
        return;
      }
    } else {
      // В деве допускаем POST без hash (но если hash есть — проверяем по-честному)
      if (raw.hash && !verifyTelegram(raw, BOT_TOKEN)) {
        res.status(400).json({ ok:false, error:'bad_signature_dev' });
        return;
      }
    }

    const tgId = Number(raw.id || (raw.user && raw.user.id));
    if (!tgId) { res.status(400).json({ ok:false, error:'no_user' }); return; }

    const first = String(raw.first_name || (raw.user && raw.user.first_name) || '').trim();
    const last  = String(raw.last_name  || (raw.user && raw.user.last_name)  || '').trim();
    const uname = String(raw.username   || (raw.user && raw.user.username)   || '').trim();
    const photo = String(raw.photo_url  || (raw.user && raw.user.photo_url)  || '').trim();

    const display = (first || last) ? `${first}${first&&last?' ':''}${last}` : (uname || 'User');

    // upsert пользователя по tg_id
    const upsertSql = `
      insert into users (tg_id, display_name, avatar_url)
      values ($1,$2,$3)
      on conflict (tg_id) do update
        set display_name = excluded.display_name,
            avatar_url   = excluded.avatar_url
      returning id
    `;
    const { rows } = await pool.query(upsertSql, [tgId, display, photo || null]);
    const userId = rows[0].id;

    // создаём сессию и куку
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + days(SESSION_DAYS) * 1000); // JS ms
    await pool.query(
      'insert into sessions(token, user_id, expires_at, created_at) values ($1,$2,$3, now())',
      [token, userId, expiresAt]
    );

    res.setHeader('Set-Cookie', makeCookie(token, req));
    res.setHeader('Cache-Control', 'no-store');

    // GET — это вход через Telegram widget → делаем редирект на исходную страницу
    if (req.method === 'GET') {
      const back = sanitizeReturnTo((req.query && (req.query.return_to || req.query.back)) || '/');
      res.writeHead(302, { Location: back });
      res.end();
      return;
    }

    // POST — вернём JSON
    res.json({ ok:true });

  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
};
