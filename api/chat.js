// Vercel Serverless Function — Proxies chat to DeepSeek API
const fetch = require('node-fetch');

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'DeepSeek API key not configured' });
  }

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
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('DeepSeek API error:', response.status, errText);
      return res.status(502).json({ error: 'DeepSeek API error', detail: errText });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '🦗 Sorry, I couldn\'t process that. Try again!';

    res.json({ reply });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
