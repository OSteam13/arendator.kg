// /api/listings-count.js
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(URL, KEY);

module.exports = async (req, res) => {
  try {
    // head+count — быстрая проверка доступа/политик
    const { count, error } = await sb
      .from('listings')
      .select('id', { head: true, count: 'exact' });

    if (error) {
      console.error('count error:', error);
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ count });
  } catch (e) {
    console.error('route error:', e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
};
