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
    if (req.method !== 'POST') {
      res.status(405).json({ ok:false, error:'method_not_allowed' });
      return;
    }

    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ ok:false }); return; }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const avatar_url = body?.avatar_url || null; // ожидаем уже загруженный URL

    await pool.query('update users set avatar_url=$2 where id=$1', [userId, avatar_url]);
    res.json({ ok:true });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
};
