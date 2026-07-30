// API endpoint: parse booking confirmation images using DeepSeek
// POST /api/parse-booking
// Body: { images: string[] } — array of base64 data URLs

const fetch = require('node-fetch');
const { withAuth } = require('../lib/auth');

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';

module.exports = withAuth(async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
  if (!DEEPSEEK_KEY) {
    return res.status(500).json({ error: 'Missing DEEPSEEK_API_KEY' });
  }

  try {
    const { images } = req.body;
    const imageCount = images?.length || 0;

    if (imageCount === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }

    // Build prompt for DeepSeek with image URLs
    const messages = [
      {
        role: 'system',
        content: `You are a travel booking parser. Extract structured information from hotel/flight booking confirmation images.
Return ONLY valid JSON with these fields:
{
  "destination": "City, Country",
  "checkIn": "Aug 22",
  "checkOut": "Aug 28",
  "hotel": "Hotel or property name",
  "confirmation": "Booking reference number",
  "guests": "Number of guests if visible",
  "notes": "Any other useful info"
}
If you cannot read an image, use your best guess from context. Never return null — always return at least the destination.`,
      },
    ];

    // Add each image as a user message with proper image format
    const userContent = [];
    for (let i = 0; i < imageCount; i++) {
      const img = images[i];
      // Check if it's a base64 data URL
      if (img && img.startsWith('data:')) {
        userContent.push(
          { type: 'text', text: `Booking confirmation page ${i + 1}/${imageCount}:` },
          { type: 'image_url', image_url: { url: img } }
        );
      } else {
        userContent.push(
          { type: 'text', text: `Booking confirmation page ${i + 1}/${imageCount} (URL: ${img})` }
        );
      }
    }
    userContent.push({ type: 'text', text: 'Extract the booking information from the images above. Return ONLY valid JSON.' });

    messages.push({ role: 'user', content: userContent });

    const payload = {
      model: 'deepseek-v4-flash',
      messages,
      max_tokens: 1024,
      temperature: 0.1,
    };

    const response = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('DeepSeek API error:', response.status, errText);
      return res.status(502).json({ error: 'AI service error', pages: imageCount });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse JSON from the response
    let parsed;
    try {
      // Try direct parse
      parsed = JSON.parse(content);
    } catch {
      // Try to extract JSON block
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          parsed = null;
        }
      }
    }

    if (!parsed || !parsed.destination) {
      // Fallback with best guess
      return res.status(200).json({
        destination: 'Unknown destination',
        checkIn: '—',
        checkOut: '—',
        hotel: '—',
        confirmation: '—',
        pages: imageCount,
        _raw: content,
      });
    }

    return res.status(200).json({
      ...parsed,
      pages: imageCount,
    });
  } catch (e) {
    console.error('Parse booking error:', e);
    return res.status(500).json({ error: 'Internal error', pages: images?.length || 0 });
  }
});
