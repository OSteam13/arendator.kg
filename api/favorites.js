// /api/favorites.js
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const COOKIE_NAME = 'auth'
function readToken(req) {
  const raw = req.headers.cookie || ''
  const m = raw.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
  return m ? m[1] : null
}

async function requireUser(req, res) {
  const token = readToken(req)
  if (!token) { res.status(401).json({ ok:false }); return null }
  const { data, error } = await supabase
    .from('sessions')
    .select('user_id, expires_at')
    .eq('token', token)
    .limit(1)
  if (error || !data || !data.length) { res.status(401).json({ ok:false }); return null }
  const s = data[0]
  if (new Date(s.expires_at).getTime() <= Date.now()) {
    await supabase.from('sessions').delete().eq('token', token)
    res.status(401).json({ ok:false }); return null
  }
  return s.user_id
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const userId = await requireUser(req, res)
  if (!userId) return

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('favorites')
      .select('listing_id, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (error) return res.status(500).json({ ok:false, error:error.message })
    return res.json({ ok:true, favorites: data })
  }

  if (req.method === 'POST') {
    const { listing_id } = req.body || {}
    if (!listing_id) return res.status(400).json({ ok:false, error:'listing_id is required' })
    const { error } = await supabase
      .from('favorites')
      .upsert({ user_id: userId, listing_id }, { onConflict: 'user_id,listing_id' })
    if (error) return res.status(500).json({ ok:false, error:error.message })
    return res.json({ ok:true })
  }

  if (req.method === 'DELETE') {
    const { listing_id } = req.body || {}
    if (!listing_id) return res.status(400).json({ ok:false, error:'listing_id is required' })
    const { error } = await supabase
      .from('favorites')
      .delete()
      .match({ user_id: userId, listing_id })
    if (error) return res.status(500).json({ ok:false, error:error.message })
    return res.json({ ok:true })
  }

  res.status(405).end()
}
