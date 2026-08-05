// API endpoint: manage trips (CRUD)
// POST /api/v1/trips — create new trip
// GET  /api/v1/trips — list user's trips
// GET  /api/v1/trips/:id — get single trip
// PUT  /api/v1/trips/:id — update trip
// DELETE /api/v1/trips/:id — delete trip

import { withAuth } from '../../lib/auth.js';
import { tripSaveSchema } from '../../lib/schemas/index.js';

const SUPABASE_URL = 'https://yfjlcdvntjtukuakhtzs.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Helper: call Supabase REST API
async function supabaseRequest(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const headers = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    Prefer: 'return=representation',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Supabase ${response.status}: ${errText}`);
  }

  // For DELETE, there's no body
  if (response.status === 204 || options.method === 'DELETE') {
    return null;
  }

  return response.json();
}

export default withAuth(async function handler(req, res) {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userId = user.id;
  const method = req.method;
  // Handle both /api/trips/:id and /api/v1/trips/:id
  const urlParts = req.url.split('/').filter(Boolean);
  const isV1 = urlParts[0] === 'v1';
  const tripId = isV1 ? urlParts[2] : urlParts[1]; // /api/v1/trips/:id or /api/trips/:id

  try {
    // POST /api/trips — Create trip
    if (method === 'POST' && !tripId) {
      const validation = tripSaveSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: 'Invalid input', details: validation.error.flatten() });
      }

      const tripData = {
        ...validation.data,
        user_id: userId,
        start_date: validation.data.start_date || null,
        end_date: validation.data.end_date || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const trip = await supabaseRequest('/trips', {
        method: 'POST',
        body: JSON.stringify(tripData),
      });

      return res.status(201).json(trip[0]);
    }

    // GET /api/trips — List trips
    if (method === 'GET' && !tripId) {
      const trips = await supabaseRequest(`/trips?user_id=eq.${userId}&order=created_at.desc`);
      return res.status(200).json(trips);
    }

    // GET /api/trips/:id — Get single trip
    if (method === 'GET' && tripId) {
      const trips = await supabaseRequest(`/trips?id=eq.${tripId}&user_id=eq.${userId}&select=*`);
      if (!trips || trips.length === 0) {
        return res.status(404).json({ error: 'Trip not found' });
      }
      return res.status(200).json(trips[0]);
    }

    // PUT /api/trips/:id — Update trip
    if (method === 'PUT' && tripId) {
      const validation = tripSaveSchema.partial().safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: 'Invalid input', details: validation.error.flatten() });
      }

      const updates = {
        ...validation.data,
        updated_at: new Date().toISOString(),
      };

      const trip = await supabaseRequest(`/trips?id=eq.${tripId}&user_id=eq.${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });

      if (!trip || trip.length === 0) {
        return res.status(404).json({ error: 'Trip not found' });
      }
      return res.status(200).json(trip[0]);
    }

    // DELETE /api/trips/:id — Delete trip
    if (method === 'DELETE' && tripId) {
      await supabaseRequest(`/trips?id=eq.${tripId}&user_id=eq.${userId}`, {
        method: 'DELETE',
      });
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('Trips API error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});