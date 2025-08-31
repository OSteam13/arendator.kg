const { pool } = require('./_db');

async function getUserId(req) {
  const cookies = req.headers.cookie || '';
  const token = cookies.split('; ')
    .find(c => c.startsWith('auth='))?.split('=')[1] || '';
  if (!token) return null;
  const { rows } = await pool.query(
    'select user_id from sessions where token=$1 and expires_at>now()',
    [token]
  );
  return rows[0]?.user_id || null;
}

module.exports = async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ ok:false });

    if (req.method === 'GET') {
      const { rows } = await pool.query(
        'select listing_id from favorites where user_id=$1 order by updated_at desc',
        [userId]
      );
      res.json({ ok:true, favorites: rows.map(r => r.listing_id) });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { action, listing_id } = body || {};
      if (!listing_id) return res.status(400).json({ ok:false, error:'no_listing_id' });

      if (action === 'remove') {
        await pool.query('delete from favorites where user_id=$1 and listing_id=$2', [userId, listing_id]);
      } else {
        await pool.query(
          `insert into favorites (user_id, listing_id, updated_at)
           values ($1,$2, now())
           on conflict (user_id, listing_id) do update set updated_at = excluded.updated_at`,
          [userId, listing_id]
        );
      }
      res.json({ ok:true });
      return;
    }

    res.status(405).json({ ok:false, error:'method_not_allowed' });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
};
