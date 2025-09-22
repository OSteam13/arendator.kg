// /api/listings.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  try {
    const from = Number(req.query.from ?? 0);
    const limit = Number(req.query.limit ?? 20);

    // Если is_active нет или пустой у старых записей — можно ослабить фильтр:
    // .or('is_active.is.null,is_active.eq.true')
    const { data, error } = await supabase
      .from('listings')
      .select('id,title,price,district,phone_masked,text,photos,created_at')
      .order('id', { ascending: false })
      .range(from, from + limit - 1);

    if (error) return res.status(500).json({ error: error.message });

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({ items: data });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
