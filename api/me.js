const { pool } = require('./_db');

async function getUserByCookie(req) {
  const cookies = req.headers.cookie || '';
  const token = cookies.split('; ')
    .find(c => c.startsWith('auth='))?.split('=')[1] || '';
  if (!token) return null;

  const { rows } = await pool.query(
    `select u.id, u.display_name, u.avatar_url, u.locale
       from sessions s
       join users u on u.id = s.user_id
      where s.token = $1 and s.expires_at > now()`,
    [token]
  );
  return rows[0] || null;
}

module.exports = async (req, res) => {
  try {
    const user = await getUserByCookie(req);
    if (!user) return res.status(401).json({ ok:false });

    const { rows } = await pool.query(
      'select listing_id from favorites where user_id = $1',
      [user.id]
    );

    res.json({ ok:true, user, favorites: rows.map(r => r.listing_id) });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
};
