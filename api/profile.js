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
        'select id, display_name, avatar_url, locale from users where id=$1',
        [userId]
      );
      res.json({ ok:true, profile: rows[0] || null });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const name   = body?.display_name ?? null;
      const locale = body?.locale ?? null;

      await pool.query(
        `update users
           set display_name = coalesce($2, display_name),
               locale       = coalesce($3, locale)
         where id = $1`,
        [userId, name, locale]
      );
      res.json({ ok:true });
      return;
    }

    res.status(405).json({ ok:false, error:'method_not_allowed' });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
};
