// /api/me.js
const { supabase } = require('../lib/_supabase');

const COOKIE_NAME = 'auth';

function readCookieToken(req) {
  const raw = req.headers.cookie || '';
  const m = raw.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return m ? m[1] : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const token = readCookieToken(req);
  if (!token) return res.status(401).json({ ok: false });

  // ищем сессию + пользователя по FK sessions.user_id -> users.id
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('user_id, expires_at, users:users!inner(id, tg_id, display_name, avatar_url)')
    .eq('token', token)
    .limit(1);

  if (error || !sessions || sessions.length === 0) {
    return res.status(401).json({ ok: false });
  }

  const s = sessions[0];

  // срок действия истёк — удаляем токен и шлём 401
  if (new Date(s.expires_at).getTime() <= Date.now()) {
    await supabase.from('sessions').delete().eq('token', token);
    return res.status(401).json({ ok: false });
  }

  return res.json({ ok: true, user: s.users });
};
