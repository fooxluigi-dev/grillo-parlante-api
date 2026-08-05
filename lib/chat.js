// Chat history persistence — Supabase
// Handles saving/retrieving chat messages for a trip

const SUPABASE_URL = 'https://yfjlcdvntjtukuakhtzs.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

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

  if (response.status === 204 || options.method === 'DELETE') {
    return null;
  }

  return response.json();
}

export async function saveChatMessage({ user_id, trip_id, role, content, metadata }) {
  const data = {
    user_id,
    trip_id: trip_id || null,
    role,
    content,
    metadata: metadata || {},
    created_at: new Date().toISOString(),
  };

  return supabaseRequest('/chat_messages', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getChatHistory({ user_id, trip_id, limit = 50 }) {
  let query = `/chat_messages?user_id=eq.${user_id}&order=created_at.desc&limit=${limit}`;
  if (trip_id) {
    query += `&trip_id=eq.${trip_id}`;
  }
  const messages = await supabaseRequest(query);
  return messages?.reverse() || []; // Return chronological order
}

export async function getRecentChatContext({ user_id, trip_id, maxMessages = 10 }) {
  const messages = await getChatHistory({ user_id, trip_id, limit: maxMessages });
  // Format for LLM: [{role, content}, ...]
  return messages.map(m => ({ role: m.role, content: m.content }));
}

export async function clearChatHistory({ user_id, trip_id }) {
  let path = `/chat_messages?user_id=eq.${user_id}`;
  if (trip_id) {
    path += `&trip_id=eq.${trip_id}`;
  }
  return supabaseRequest(path, { method: 'DELETE' });
}