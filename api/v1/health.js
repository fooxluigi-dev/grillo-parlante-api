// Health check endpoint
// GET /api/v1/health
// Returns service status and dependency checks

const SUPABASE_URL = 'https://yfjlcdvntjtukuakhtzs.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

async function checkSupabase() {
  if (!SUPABASE_ANON_KEY) return { status: 'unconfigured', detail: 'No anon key' };
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/trips?limit=1`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    return { status: resp.ok ? 'healthy' : 'degraded', httpStatus: resp.status };
  } catch (e) {
    return { status: 'unhealthy', error: e.message };
  }
}

async function checkDeepSeek() {
  const key = process.env.OPENROUTER_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (!key) return { status: 'unconfigured', detail: 'No API key' };
  try {
    const modelsUrl = process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1/models' : 'https://api.deepseek.com/v1/models';
    const resp = await fetch(modelsUrl, {
      headers: { Authorization: `Bearer ${key}` },
    });
    return { status: resp.ok ? 'healthy' : 'degraded', httpStatus: resp.status };
  } catch (e) {
    return { status: 'unhealthy', error: e.message };
  }
}

async function checkOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { status: 'unconfigured', detail: 'No API key' };
  try {
    const resp = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    return { status: resp.ok ? 'healthy' : 'degraded', httpStatus: resp.status };
  } catch (e) {
    return { status: 'unhealthy', error: e.message };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const start = Date.now();

  const [supabase, deepseek, openai] = await Promise.all([
    checkSupabase(),
    checkDeepSeek(),
    checkOpenAI(),
  ]);

  const latency = Date.now() - start;

  const allHealthy = [supabase, deepseek, openai].every(s => s.status === 'healthy');

  res.json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    latencyMs: latency,
    version: '1.0.0',
    environment: process.env.VERCEL_ENV || 'development',
    dependencies: {
      supabase,
      deepseek,
      openai,
    },
  });
}