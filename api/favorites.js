const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized:false } });

async function userId(req){
  const token = (req.headers.cookie || '').split('; ').find(c => c.startsWith('auth='))?.split('=')[1] || '';
  if (!token) return null;
  const { rows } = await pool.query('select user_id from sessions where token=$1 and expires_at>now()', [token]);
  return rows[0]?.user_id || null;
}

module.exports = async (req, res) => {
  const uid = await userId(req);
  if (!uid) { res.status(401).json({ ok:false }); return; }

  if (req.method === 'GET') {
    const since = Number(req.query.since || 0);
    if (since > 0) {
      const r = await pool.query(
        `select listing_id, extract(epoch from updated_at)::bigint as ts
           from favorites where user_id=$1 and updated_at>to_timestamp($2)`,
        [uid, since]
      );
      const v = await pool.query(
        `select coalesce(extract(epoch from max(updated_at))::bigint,0) as version
           from favorites where user_id=$1`, [uid]
      );
      res.json({ ok:true, changes:r.rows, version:v.rows[0].version }); return;
    }
    const r = await pool.query('select listing_id from favorites where user_id=$1', [uid]);
    res.json({ ok:true, favorites: r.rows.map(x=>x.listing_id) }); return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  if (req.method === 'POST') {
    if (Array.isArray(body?.merge)) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        for (const id of body.merge) {
          await client.query(
            `insert into favorites(user_id, listing_id) values ($1,$2)
             on conflict (user_id, listing_id) do update set updated_at=now()`,
            [uid, id]
          );
        }
        await client.query('commit');
      } finally { client.release(); }
      res.json({ ok:true }); return;
    }
    const id = body?.listingId;
    if (!id) { res.status(400).json({ ok:false }); return; }
    await pool.query(
      `insert into favorites(user_id, listing_id) values ($1,$2)
       on conflict (user_id, listing_id) do update set updated_at=now()`,
      [uid, id]
    );
    res.json({ ok:true }); return;
  }

  if (req.method === 'DELETE') {
    const id = body?.listingId;
    if (!id) { res.status(400).json({ ok:false }); return; }
    await pool.query('delete from favorites where user_id=$1 and listing_id=$2', [uid, id]);
    res.json({ ok:true }); return;
  }

  res.status(405).end();
};
