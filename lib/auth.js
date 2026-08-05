// Shared auth middleware for Vercel serverless functions
// Verifies Supabase JWT tokens passed in Authorization header
// Auth is OPTIONAL — unauthenticated requests are still processed
// CORS restricted to known origins (Vercel preview/prod + localhost)

import fetch from 'node-fetch';

const SUPABASE_URL = 'https://yfjlcdvntjtukuakhtzs.supabase.co';

// Allowed origins - update with your actual Vercel URLs
const ALLOWED_ORIGINS = [
  'https://grillo-parlante.vercel.app',
  'https://grillo-parlante-git-main-fooxluigi-dev.vercel.app',
  'https://grillo-parlante-api.vercel.app',
  'https://dist-five-coral-39.vercel.app',
  'http://localhost:8081',
  'http://localhost:3000',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:3000',
];

// For Vercel preview deployments, also allow *.vercel.app subdomains
function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Vercel preview deployments
  if (origin.match(/^https:\/\/grillo-parlante.*\.vercel\.app$/)) return true;
  if (origin.match(/^https:\/\/grillo-parlante-api.*\.vercel\.app$/)) return true;
  if (origin.match(/^https:\/\/dist-.*\.vercel\.app$/)) return true;
  return false;
}

function corsHeaders(origin) {
  const allowOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
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
    const origin = req.headers?.origin || '';

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      Object.entries(corsHeaders(origin)).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      return res.status(204).end();
    }

    // Add CORS headers to all responses
    Object.entries(corsHeaders(origin)).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    const user = await verifyAuth(req);
    req.user = user; // may be null if no valid token
    return handler(req, res);
  };
}

export { verifyAuth, withAuth, corsHeaders, isAllowedOrigin };