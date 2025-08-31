const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized:false } });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

async function userId(req){
  const token = (req.headers.cookie || '').split('; ').find(c => c.startsWith('auth='))?.split('=')[1] || '';
  if (!token) return null;
  const { rows } = await pool.query('select user_id from sessions where token=$1 and expires_at>now()', [token]);
  return rows[0]?.user_id || null;
}

function decodeDataUrl(dataUrl){
  const m = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(dataUrl || '');
  if(!m) throw new Error('bad_dataurl');
  return Buffer.from(m[2], 'base64');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const uid = await userId(req);
  if (!uid) { res.status(401).json({ ok:false }); return; }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!body?.dataUrl) { res.status(400).json({ ok:false, error:'no_data' }); return; }

  const bytes = decodeDataUrl(body.dataUrl);
  const key = `avatars/${uid}.jpg`;

  const up = await supabase.storage.from('arendator-public').upload(key, bytes, {
    upsert:true, contentType:'image/jpeg'
  });
  if (up.error) { res.status(500).json({ ok:false, error: up.error.message }); return; }

  const { data } = supabase.storage.from('arendator-public').getPublicUrl(key);
  const url = data.publicUrl;
  await pool.query('update users set avatar_url=$1 where id=$2', [url, uid]);
  res.json({ ok:true, url });
};
