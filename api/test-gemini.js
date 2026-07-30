// Simple test endpoint — tests Gemini OCR and returns raw result
const fetch = require('node-fetch');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();
  
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  const { image } = req.body;
  
  if (!image) return res.json({ error: 'no image' });
  
  const rawData = image.replace(/^data:image\/\w+;base64,/, '');
  const mimeType = image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
  
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Extract ALL text visible in this booking confirmation. Return every word, number, and date.' },
              { inline_data: { mime_type: mimeType, data: rawData } }
            ]
          }],
          generationConfig: { maxOutputTokens: 1024 }
        }),
      }
    );
    
    const result = await resp.json();
    
    return res.json({
      gemini_status: resp.status,
      gemini_ok: resp.ok,
      raw: JSON.stringify(result).slice(0, 2000),
      key_prefix: GEMINI_KEY ? GEMINI_KEY.slice(0, 8) + '...' : 'NO KEY',
      key_len: GEMINI_KEY ? GEMINI_KEY.length : 0,
    });
  } catch (e) {
    return res.json({ error: e.message, stack: e.stack?.slice(0, 200) });
  }
};
