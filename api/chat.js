// Vercel Serverless Function — Proxies chat to DeepSeek API
import { withAuth } from '../lib/auth';

const fetch = require('node-fetch');

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';

export default withAuth(async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'DeepSeek API key not configured' });

  try {
    const { messages, tripContext } = req.body;

    const systemPrompt = `You are Grillo 🦗, an AI travel companion. You help users plan trips, find restaurants, suggest activities, and give travel tips.

${tripContext ? `The user is traveling to: ${tripContext}.` : ''}

Keep responses friendly, concise, and helpful. Use emojis occasionally. Give specific recommendations when possible. If the user asks about a place you're not sure about, suggest alternatives. Always be upbeat and encouraging about travel!`;

    const response = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          ...(messages || []),
        ],
        temperature: 0.85,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('DeepSeek chat error:', response.status, errText);
      return res.status(502).json({ error: 'AI service error' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (e) {
    console.error('Chat error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
