// /api/tg-login.js
const crypto = require('crypto');
const { supabase } = require('../lib/_supabase');

function days(n){ return n*24*60*60; }
const BOT_TOKEN        = process.env.TELEGRAM_BOT_TOKEN;
const COOKIE_DOMAIN    = process.env.COOKIE_DOMAIN || '.arendator.kg';
const CANONICAL_ORIGIN = process.env.CANONICAL_ORIGIN || 'https://arendator.kg';

// --- verify Telegram query ---
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

function toAbs(back){
  try{
    if (!back || typeof back !== 'string') return `${CANONICAL_ORIGIN}/`;
    if (/^https?:/i.test(back)) return `${CANONICAL_ORIGIN}/`;
    return `${CANONICAL_ORIGIN}${back.startsWith('/') ? back : `/${back}`}`;
  }catch{ return `${CANONICAL_ORIGIN}/`; }
}

function htmlRedirect(res, url){
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const safe = String(url);
  res.end(`<!doctype html><meta http-equiv="refresh" content="0;url=${safe}">
<script>try{location.replace(${JSON.stringify(safe)})}catch(_){location.href=${JSON.stringify(safe)}};</script>
Logged in, redirecting…`);
}

module.exports = async (req, res) => {
  try {
    const q = req.query || {};
    const backAbs = toAbs((q.return_to || q.back || '/').toString());

    // 1) Верификация подписи Telegram
    const ver = verifyTelegramQuery(q);
    if (!ver.ok){
      const url = new URL(backAbs);
      url.searchParams.set('tg','err');
      url.searchParams.set('reason', ver.error);
      return htmlRedirect(res, url.toString());
    }

    // 2) Разобрать профиль пользователя
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
    if (!tg?.id){
      const url = new URL(backAbs);
      url.searchParams.set('tg','err');
      url.searchParams.set('reason','no_user');
      return htmlRedirect(res, url.toString());
    }

    // 3) Upsert пользователя в таблицу users по tg_id
    const display_name = (tg.first_name || tg.username || 'User');
    const avatar_url   = tg.photo_url || null;

    const { data: userRow, error: upError } = await supabase
      .from('users')
      .upsert(
        { tg_id: tg.id, display_name, avatar_url },
        { onConflict: 'tg_id' }
      )
      .select('id')
      .single();

    if (upError) throw upError;
    const userId = userRow.id;

    // 4) Создать сессию (sessions)
    const token = crypto.randomBytes(32).toString('hex');
    const exp   = new Date(Date.now() + 14*24*3600*1000);

    const { error: sessErr } = await supabase
      .from('sessions')
      .insert({ token, user_id: userId, expires_at: exp });

    if (sessErr) throw sessErr;

    // 5) Поставить cookie
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

    // 6) Вернуть HTML-редирект с tg=ok
    const url = new URL(backAbs);
    url.searchParams.set('tg','ok');
    return htmlRedirect(res, url.toString());
  } catch (e) {
    const url = new URL(toAbs((req.query && (req.query.return_to || req.query.back)) || '/'));
    url.searchParams.set('tg','err');
    url.searchParams.set('reason', e.message || 'server_error');
    return htmlRedirect(res, url.toString());
  }
};
