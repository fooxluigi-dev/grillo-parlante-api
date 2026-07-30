// API endpoint: parse booking confirmation images using OCR + AI
// POST /api/parse-booking
// Body: { images: string[] } — array of base64 data URLs
// Uses free OCR APIs + Gemini (when quota available) + DeepSeek for parsing

const fetch = require('node-fetch');
const { withAuth } = require('../lib/auth');

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
const GEMINI_MODELS = ['gemini-3.1-flash-lite', 'gemini-2.0-flash', 'gemini-3.1-flash-lite-image'];

module.exports = withAuth(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  const OCR_KEY = process.env.OCR_SPACE_API_KEY || 'helloworld';

  try {
    const { images, ocrText } = req.body;
    const imageCount = images?.length || 0;
    if (imageCount === 0 && !ocrText) {
      return res.status(400).json({ error: 'No images or text provided' });
    }

    // If client already ran OCR, use that text directly
    let extractedText = ocrText || '';

    // Fall back to server-side OCR if no pre-extracted text
    if (!extractedText && imageCount > 0) {
      const rawData = images[0].replace(/^data:image\/\w+;base64,/, '');
      const mimeType = images[0].startsWith('data:image/png') ? 'image/png' : 'image/jpeg';

      for (const modelName of GEMINI_MODELS) {
        try {
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: 'Extract ALL text visible in this booking confirmation. Return every word, number, and date you can see.' },
                    { inline_data: { mime_type: mimeType, data: rawData } }
                  ]
                }],
                generationConfig: { maxOutputTokens: 2048 }
              }),
            }
          );

          if (resp.ok) {
            const d = await resp.json();
            extractedText = d?.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n') || '';
            if (extractedText) break;
          }
        } catch (e) { /* try next model */ }
      }
    }

    // === Method 2: OCR.space (free OCR, no API key needed) ===
    if (!extractedText) {
      try {
        // Extract the correct MIME type and base64 data
        const mimeMatch = images[0].match(/^data:(image\/\w+);base64,(.+)$/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        const base64Data = mimeMatch ? mimeMatch[2] : images[0].replace(/^data:image\/\w+;base64,/, '');

        const formData = new URLSearchParams();
        formData.append('base64Image', `data:${mimeType};base64,${base64Data}`);
        formData.append('language', 'eng');
        formData.append('isOverlayRequired', 'false');
        formData.append('OCREngine', '2');
        formData.append('scale', 'true');

        const ocrResp = await fetch('https://api.ocr.space/parse/image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'apikey': OCR_KEY,
          },
          body: formData.toString(),
        });

        if (ocrResp.ok) {
          const ocrData = await ocrResp.json();
          if (ocrData?.ParsedResults?.[0]?.ParsedText) {
            extractedText = ocrData.ParsedResults[0].ParsedText.trim();
            console.log(`OCR.space extracted ${extractedText.length} chars`);
          }
        }
      } catch (ocrErr) {
        console.error('OCR.space failed:', ocrErr.message);
      }
    }

    // If both failed, return error
    if (!extractedText) {
      return res.status(200).json({
        destination: 'Unknown',
        checkIn: '—',
        checkOut: '—',
        hotel: '—',
        confirmation: '—',
        pages: imageCount,
        _ocrFailed: true,
        _note: 'Could not read text from your image. Try a clearer screenshot with the booking details visible.',
      });
    }

    // === Step 3: DeepSeek parses extracted text ===
    const response = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: [
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
            content: `Booking text:\n${extractedText}\n\nExtract the booking info as JSON.`,
          },
        ],
        max_tokens: 1024,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(200).json({
        destination: extractedText.slice(0, 100).replace(/\n/g, ' ').trim(),
        checkIn: '—',
        checkOut: '—',
        hotel: '—',
        confirmation: '—',
        pages: imageCount,
        _rawOcr: extractedText.slice(0, 500),
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    let parsed;

    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }

    if (!parsed || !parsed.destination || parsed.destination === 'Unknown') {
      return res.status(200).json({
        destination: extractedText.slice(0, 100).replace(/\n/g, ' ').trim(),
        checkIn: '—',
        checkOut: '—',
        hotel: '—',
        confirmation: '—',
        pages: imageCount,
        _rawOcr: extractedText.slice(0, 500),
      });
    }

    return res.status(200).json({ ...parsed, pages: imageCount });

  } catch (e) {
    console.error('Parse error:', e);
    return res.status(500).json({ error: 'Internal error', pages: images?.length || 0 });
  }
});
