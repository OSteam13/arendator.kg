// /api/me.js
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const COOKIE_NAME = 'auth'

function readCookieToken(req) {
  const raw = req.headers.cookie || ''
  const m = raw.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
  return m ? m[1] : null
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const token = readCookieToken(req)
  if (!token) return res.status(401).json({ ok:false })

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('user_id, expires_at, users:users!inner(id,email,tg_id)')
    .eq('token', token)
    .limit(1)

  if (error || !sessions || sessions.length === 0) return res.status(401).json({ ok:false })

  const s = sessions[0]
  if (new Date(s.expires_at).getTime() <= Date.now()) {
    // просрочена
    await supabase.from('sessions').delete().eq('token', token)
    return res.status(401).json({ ok:false })
  }

  return res.json({ ok:true, user: s.users })
}
