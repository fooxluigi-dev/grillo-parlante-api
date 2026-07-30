// Shared auth middleware for Vercel serverless functions
// Verifies Supabase JWT tokens passed in Authorization header

const fetch = require('node-fetch');

const SUPABASE_URL = 'https://yfjlcdvntjtukuakhtzs.supabase.co';

async function verifyAuth(req) {
  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7);
  if (!token || token.length < 20) return null;

  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.SUPABASE_ANON_KEY || '',
      },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.id ? data : null;
  } catch {
    return null;
  }
}

function withAuth(handler) {
  return async (req, res) => {
    const user = await verifyAuth(req);
    if (!user) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(401).json({ error: 'Unauthorized. Please sign in.', code: 'auth_required' });
    }
    req.user = user;
    return handler(req, res);
  };
}

module.exports = { verifyAuth, withAuth };
