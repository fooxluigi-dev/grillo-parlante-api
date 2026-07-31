// Shared auth middleware for Vercel serverless functions
// Verifies Supabase JWT tokens passed in Authorization header
// Auth is OPTIONAL — unauthenticated requests are still processed
// Also adds CORS headers so the API works from any domain (grillo-scan, grillo-app-web, etc.)

const fetch = require('node-fetch');

const SUPABASE_URL = 'https://yfjlcdvntjtukuakhtzs.supabase.co';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

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
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
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
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return res.status(204).end();
    }

    // Add CORS headers to all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    const user = await verifyAuth(req);
    req.user = user; // may be null if no valid token
    return handler(req, res);
  };
}

module.exports = { verifyAuth, withAuth, corsHeaders };
