// Chat history persistence — Supabase
// Handles saving/retrieving chat messages for a trip

const SUPABASE_URL = 'https://yfjlcdvntjtukuakhtzs.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export interface ChatMessageData {
  user_id: string;
  trip_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

async function supabaseRequest(path: string, options: RequestInit = {}): Promise<unknown> {
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

export async function saveChatMessage(data: ChatMessageData): Promise<ChatMessageData[]> {
  const payload = {
    ...data,
    created_at: new Date().toISOString(),
  };

  return supabaseRequest('/chat_messages', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<ChatMessageData[]>;
}

export async function getChatHistory(params: {
  user_id: string;
  trip_id?: string;
  limit?: number;
}): Promise<ChatMessageData[]> {
  let query = `/chat_messages?user_id=eq.${params.user_id}&order=created_at.desc&limit=${params.limit || 50}`;
  if (params.trip_id) {
    query += `&trip_id=eq.${params.trip_id}`;
  }
  const messages = await supabaseRequest(query);
  return (messages as ChatMessageData[] || []).reverse(); // Return chronological order
}

export async function getRecentChatContext(params: {
  user_id: string;
  trip_id?: string;
  maxMessages?: number;
}): Promise<Array<{ role: string; content: string }>> {
  const messages = await getChatHistory({
    user_id: params.user_id,
    trip_id: params.trip_id,
    limit: params.maxMessages || 10,
  });
  // Format for LLM: [{role, content}, ...]
  return messages.map(m => ({ role: m.role, content: m.content }));
}

export async function clearChatHistory(params: {
  user_id: string;
  trip_id?: string;
}): Promise<void> {
  let path = `/chat_messages?user_id=eq.${params.user_id}`;
  if (params.trip_id) {
    path += `&trip_id=eq.${params.trip_id}`;
  }
  await supabaseRequest(path, { method: 'DELETE' });
}