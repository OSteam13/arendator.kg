// /api/listings.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // чтобы в логах сразу было видно причину
  console.error('Missing Supabase envs', { SUPABASE_URL: !!SUPABASE_URL, SUPABASE_KEY: !!SUPABASE_KEY });
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports = async (req, res) => {
  try {
    const from = Number(req.query.from ?? 0);
    const limit = Number(req.query.limit ?? 20);

    // Без строгого фильтра по is_active (у тебя в таблице он может быть null)
    const { data, error } = await supabase
      .from('listings')
      .select('id,title,price,district,phone_masked,text,photos,created_at')
      .order('id', { ascending: false })
      .range(from, from + limit - 1);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({ items: data ?? [] });
  } catch (e) {
    console.error('Route error:', e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
};
