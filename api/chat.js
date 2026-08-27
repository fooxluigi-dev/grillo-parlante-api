// Vercel Serverless Function — Chat with Grillo (DeepSeek) + history persistence
// POST /api/chat
// Body: { messages: [{role, content}], tripContext: string, tripId: string }
// Uses chat history from Supabase for context

import fetch from 'node-fetch';
import { withAuth } from '../lib/auth.js';
import { saveChatMessage, getRecentChatContext } from '../lib/chat.js';
import { chatInputSchema } from '../lib/schemas/index.js';

const LLM_BASE = process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.deepseek.com/v1/chat/completions';
const LLM_MODEL = process.env.OPENROUTER_API_KEY ? 'deepseek/deepseek-v4-flash-0731' : 'deepseek-chat';

export default withAuth(async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENROUTER_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'LLM API key not configured' });

  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const userId = user.id;

  try {
    // Validate input
    const validation = chatInputSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: validation.error.flatten(),
      });
    }

    const { messages, tripContext, tripId } = validation.data;

    // Fetch recent chat history for this trip/user
    const history = await getRecentChatContext({ user_id: userId, trip_id: tripId, maxMessages: 10 });

    // Build system prompt
    const systemPrompt = `Sei Grillo 🦗, compagno di viaggio AI. Aiuti l'utente a pianificare viaggi, trovare ristoranti, suggerire attività e dare consigli di viaggio.

${tripContext ? `L'utente sta viaggiando verso: ${tripContext}.` : ''}

Rispondi in italiano, in modo amichevole, conciso e utile. Usa emoji occasionalmente. Dai consigli specifici quando possibile. Sii sempre entusiasta e incoraggiante sui viaggi!`;

    // Prepare messages: system + history + current messages
    const allMessages = [
      { role: 'system', content: systemPrompt },
      ...history,
      ...(messages || []),
    ];

    // Call DeepSeek
    const response = await fetch(LLM_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: allMessages,
        temperature: 0.85,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('DeepSeek chat error:', response.status, errText);
      return res.status(502).json({ error: 'AI service error' });
    }

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message;

    // Save user message(s) and assistant response to history
    // Only save the LAST user message and the assistant response to avoid duplicates
    const lastUserMessage = [...(messages || [])].reverse().find(m => m.role === 'user');
    if (lastUserMessage) {
      await saveChatMessage({
        user_id: userId,
        trip_id: tripId || null,
        role: 'user',
        content: lastUserMessage.content,
      });
    }
    if (assistantMessage?.content) {
      await saveChatMessage({
        user_id: userId,
        trip_id: tripId || null,
        role: 'assistant',
        content: assistantMessage.content,
      });
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error('Chat error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});