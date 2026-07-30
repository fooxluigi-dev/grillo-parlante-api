// API endpoint: parse booking confirmation images using AI vision
// POST /api/parse-booking
// Body: { images: string[] } — array of base64 data URLs
// Uses Google Gemini for OCR (free tier) then sends text to DeepSeek for parsing

const fetch = require('node-fetch');
const { withAuth } = require('../lib/auth');

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
// Gemini 1.5 Flash — free tier, supports vision/OCR
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent';

module.exports = withAuth(async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
  const GEMINI_KEY = process.env.GEMINI_API_KEY;

  try {
    const { images } = req.body;
    const imageCount = images?.length || 0;
    if (imageCount === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }

    // Step 1: Use Gemini to extract text from the image (OCR)
    let extractedText = '';
    try {
      if (!GEMINI_KEY) {
        console.warn('No GEMINI_API_KEY set — skipping OCR');
        throw new Error('No Gemini key');
      }
      
      const imageData = images[0].replace(/^data:image\/\w+;base64,/, '');
      
      const geminiResp = await fetch(`${GEMINI_API}?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Extract ALL text visible in this booking confirmation/receipt/screenshot. Return every word, number, and date you can see, organized as a plain text transcript.' },
              { inline_data: { mime_type: 'image/png', data: imageData } }
            ]
          }],
          generationConfig: { maxOutputTokens: 2048 }
        }),
      });

      if (geminiResp.ok) {
        const geminiData = await geminiResp.json();
        extractedText = geminiData?.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n') || '';
        console.log('Gemini extracted:', extractedText.slice(0, 300));
      } else {
        const errText = await geminiResp.text();
        console.error('Gemini OCR failed:', geminiResp.status, errText.slice(0, 300));
      }
    } catch (e) {
      console.error('Gemini error:', e.message);
    }

    // Step 2: Send extracted text to DeepSeek for structured parsing
    if (!extractedText) {
      return res.status(200).json({
        destination: 'Unknown',
        checkIn: '—',
        checkOut: '—',
        hotel: '—',
        confirmation: '—',
        pages: imageCount,
        _ocrFailed: true,
      });
    }

    const messages = [
      {
        role: 'system',
        content: `You are a travel booking parser. Extract structured information from the booking confirmation text below.
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
If you cannot determine a field, use your best guess. Never return null — always return at least the destination.`,
      },
      {
        role: 'user',
        content: `Here is the text extracted from a booking confirmation image:\n\n${extractedText}\n\nExtract the booking information. Return ONLY valid JSON.`,
      },
    ];

    const response = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages,
        max_tokens: 1024,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('DeepSeek parse error:', response.status, errText);
      // Return raw extracted text as fallback
      return res.status(200).json({
        destination: 'Unknown',
        checkIn: '—',
        checkOut: '—',
        hotel: '—',
        confirmation: '—',
        pages: imageCount,
        _rawText: extractedText,
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = null; }
      }
    }

    if (!parsed || !parsed.destination) {
      return res.status(200).json({
        destination: 'Unknown',
        checkIn: '—',
        checkOut: '—',
        hotel: '—',
        confirmation: '—',
        pages: imageCount,
        _rawText: content,
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
