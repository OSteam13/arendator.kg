// api/tg-login.js
const crypto = require('crypto');
const { pool } = require('./_db'); // твой PG pool (node-postgres)

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || '.arendator.kg';

function sec(n) { return n; }
function days(n) { return n * 24 * 60 * 60; }

function buildCheckString(obj) {
  // Берём только строковые поля, кроме hash; сортируем по ключу; "key=value" через \n
  return Object.keys(obj)
    .filter(k => k !== 'hash' && typeof obj[k] !== 'undefined' && obj[k] !== null && obj[k] !== '')
    .sort()
    .map(k => `${k}=${obj[k]}`)
    .join('\n');
}

function verifyTelegram(query) {
  if (!BOT_TOKEN) {
    return { ok: false, error: 'telegram_verify_failed:tg_bot_token_missing' };
  }
  const { hash, auth_date } = query;
  if (!hash || !auth_date) {
    return { ok: false, error: 'telegram_verify_failed:missing_params' };
  }

  // секрет = SHA256(bot_token) как Buffer
  const secret = crypto.createHash('sha256').update(BOT_TOKEN).digest();
  const checkString = buildCheckString(query); // без hash
  const calc = crypto.createHmac('sha256', secret).update(checkString).digest('hex');

  if (calc !== hash) {
    return { ok: false, error: 'telegram_verify_failed:bad_hash' };
  }

  // не старше 24ч
  const now = Math.floor(Date.now() / 1000);
  if (now - Number(auth_date) > sec(24 * 60 * 60)) {
    return { ok: false, error: 'telegram_verify_failed:expired' };
  }
  return { ok: true };
}

function getTelegramPayload(req) {
  // Telegram Login Widget всегда шлёт GET c query, но поддержим и JSON POST
  if (req.method === 'GET') return req.query || {};
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    return body || {};
  } catch {
    return {};
  }
}

function userNameFrom(tg) {
  const fn = (tg.first_name || '').trim();
  const ln = (tg.last_name || '').trim();
  const full = `${fn} ${ln}`.trim();
  return full || tg.username || 'User';
}

function cookieString(token) {
  const parts = [
    `auth=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${days(14)}`
  ];
  if (COOKIE_DOMAIN) parts.push(`Domain=${COOKIE_DOMAIN}`);
  return parts.join('; ');
}

module.exports = async (req, res) => {
  try {
    const payload = getTelegramPayload(req);

    // Валидация подписи Telegram
    const v = verifyTelegram(payload);
    if (!v.ok) {
      res.status(400).json({ ok: false, error: v.error });
      return;
    }

    // Минимально необходимые поля
    const tg_id = Number(payload.id);
    if (!tg_id) {
      res.status(400).json({ ok: false, error: 'no_tg_id' });
      return;
    }

    const display_name = userNameFrom(payload);
    const avatar_url = payload.photo_url || null;

    // upsert пользователя по tg_id
    const { rows } = await pool.query(
      `insert into users (tg_id, display_name, avatar_url)
       values ($1,$2,$3)
       on conflict (tg_id) do update
         set display_name = excluded.display_name,
             avatar_url   = excluded.avatar_url
       returning id`,
      [tg_id, display_name, avatar_url]
    );
    const userId = rows[0].id;

    // создаём сессию
    const token = crypto.randomBytes(32).toString('hex');
    const exp = new Date(Date.now() + days(14) * 1000);
    await pool.query(
      'insert into sessions (token, user_id, expires_at) values ($1,$2,$3)',
      [token, userId, exp]
    );

    // ставим cookie
    res.setHeader('Set-Cookie', cookieString(token));

    // GET → редирект обратно на сайт; POST → JSON
    if (req.method === 'GET') {
      const back = (req.query && req.query.return_to) || '/';
      const safeBack = (typeof back === 'string' && back.startsWith('/')) ? back : '/';
      res.writeHead(302, { Location: safeBack });
      res.end();
    } else {
      res.json({ ok: true });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
