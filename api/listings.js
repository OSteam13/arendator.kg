// /api/listings.js
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(URL, KEY);

module.exports = async (req, res) => {
  try {
    const from  = Number(req.query.from ?? 0);
    const limit = Number(req.query.limit ?? 20);

    // без фильтра is_active, чтобы не отфильтровать всё из-за NULL
    const { data, error } = await sb
  .from('listings')
  .select('id,title,price,district,phone_masked,photos,created_at,source,source_post_id') // без text
  .order('id', { ascending: false })
  .range(from, from + limit - 1);

    if (error) {
      console.error('supabase select error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({ items: data ?? [] });
  } catch (e) {
    console.error('route crash:', e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
};
