module.exports = (req, res) => {
  const have = name => Boolean(process.env[name]);
  res.status(200).json({
    SUPABASE_URL: have('SUPABASE_URL'),
    NEXT_PUBLIC_SUPABASE_URL: have('NEXT_PUBLIC_SUPABASE_URL'),
    SUPABASE_KEY: have('SUPABASE_KEY'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: have('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    NODE_VERSION: process.version
  });
};
