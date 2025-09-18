// /api/ingest.js
import { createClient } from '@supabase/supabase-js';

const getServiceKey = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE; // поддержим оба имени

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  // защита вебхука
  if (req.headers['x-pipe-secret'] !== process.env.PIPE_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, getServiceKey());

  try {
    const p = req.body || {};

    // минимальная валидация
    if (!p.title) return res.status(400).json({ ok: false, error: 'title is required' });

    const { data, error } = await supabase
      .from('listings')
      .insert({
        source: p.source || 'telegram',
        source_post_id: p.source_post_id || null,
        title: p.title,
        price: p.price ?? null,               // int4 в БД
        district: p.district || null,
        phone_full: p.phone_full || null,     // для VIP/модерации
        phone_masked: p.phone_masked || null, // для публичного фронта
        photos: Array.isArray(p.photos) ? p.photos : [], // jsonb
        is_active: p.is_active ?? true
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ ok: false, error: error.message });
    }
    return res.status(200).json({ ok: true, listing: data });
  } catch (e) {
    console.error('ingest error:', e);
    return res.status(500).json({ ok: false, error: 'Internal Error' });
  }
}
