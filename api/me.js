const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function getUserByCookie(req) {
  const cookies = req.headers.cookie || '';
  const token = cookies.split('; ').find(c => c.startsWith('auth='))?.split('=')[1] || '';
  if (!token) return null;
  const { rows } = await pool.query(
    `select u.id, u.display_name, u.avatar_url, u.locale
       from sessions s join users u on u.id=s.user_id
      where s.token=$1 and s.expires_at>now()`,
    [token]
  );
  return rows[0] || null;
}

module.exports = async (req, res) => {
  const user = await getUserByCookie(req);
  if (!user) { res.status(401).json({ ok:false }); return; }

  const favs = await pool.query(
    'select listing_id from favorites where user_id=$1 order by updated_at desc',
    [user.id]
  );
  const ver = await pool.query(
    'select coalesce(extract(epoch from max(updated_at))::bigint,0) as v from favorites where user_id=$1',
    [user.id]
  );

  res.setHeader('Cache-Control','no-store');
  res.json({ ok:true, user, favorites: favs.rows.map(r=>r.listing_id), fav_version: ver.rows[0].v });
};
