// /api/ingest.js
import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY; // на всякий случай все варианты
const PIPE_SECRET = process.env.PIPE_SECRET;

function bad(status, msg) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default async function handler(req) {
  try {
    if (req.method !== 'POST') return bad(405, 'method_not_allowed');

    // 1) секрет
    const got = req.headers.get('x-pipe-secret') || '';
    if (!PIPE_SECRET || got !== PIPE_SECRET) return bad(401, 'unauthorized');

    // 2) JSON
    let body;
    try {
      body = await req.json(); // НЕ парсим второй раз!
    } catch {
      return bad(400, 'bad_json');
    }

    // 3) нормализуем поля (чтобы PostgREST не ругался)
    const {
      title = '',
      price = null,
      photos = [],
      source = 'pipe',
      source_post_id = null,
      phone_full = null,
      district = null,
    } = body || {};

    // типы
    const priceNum =
      price === null || price === '' ? null : Number.parseInt(String(price).replace(/\D+/g, ''), 10);
    const photosArr = Array.isArray(photos) ? photos.filter(Boolean) : [];

    // быстрая валидация
    if (!title || typeof title !== 'string') return bad(400, 'title_required');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE)
      return bad(500, 'supabase_env_missing');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const row = {
      source,
      source_post_id,
      title,
      price: Number.isFinite(priceNum) ? priceNum : null,
      photos: photosArr,          // jsonb
      phone_full,                 // text (может быть null)
      district,                   // text (может быть null)
      is_active: true,            // bool
      created_at: new Date().toISOString(), // timestamp
    };

    const { error } = await supabase.from('listings').insert(row);

    if (error) {
      // подробность в логах, но не в ответе
      console.error('ingest error (supabase):', error);
      return bad(500, 'db_error');
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    console.error('ingest error:', e);
    return bad(500, 'internal');
  }
}
