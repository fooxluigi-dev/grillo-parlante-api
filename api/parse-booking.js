// API endpoint: parse booking confirmation images using OCR + AI
// POST /api/parse-booking
// Body: { images: string[] } — array of base64 data URLs
// Uses OCR.space for text extraction + DeepSeek for parsing

const fetch = require('node-fetch');
const { withAuth } = require('../lib/auth');

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';

module.exports = withAuth(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
  const OCR_KEY = process.env.OCR_SPACE_API_KEY || 'helloworld';

  try {
    const { images, ocrText } = req.body;
    const imageCount = images?.length || 0;
    if (imageCount === 0 && !ocrText) {
      return res.status(400).json({ error: 'No images or text provided' });
    }

    let extractedText = ocrText || '';

    // Server-side OCR if no pre-extracted text
    if (!extractedText && imageCount > 0) {
      // Process ALL images and concatenate extracted text
      for (const image of images) {
        if (!image) continue;
        const rawData = image.replace(/^data:image\/\w+;base64,/, '');

        // Resize with sharp first (handles large images, converts to JPEG)
        let finalB64, finalMime = 'image/jpeg';
        try {
          const sharp = require('sharp');
          const buf = Buffer.from(rawData, 'base64');
          const img = sharp(buf);
          const meta = await img.metadata();
          if (meta.width > 2000) {
            const resized = await img.resize(2000, null, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
            finalB64 = resized.toString('base64');
            console.log(`Sharp resized ${meta.width}x${meta.height} → ${(resized.length/1024).toFixed(0)}KB`);
          } else {
            finalB64 = rawData;
            finalMime = meta.format === 'png' ? 'image/png' : 'image/jpeg';
          }
        } catch(e) {
          finalB64 = rawData;
          console.log('Sharp fallback:', e.message);
        }

        // OCR.space
        try {
          const formData = new URLSearchParams();
          formData.append('base64Image', `data:${finalMime};base64,${finalB64}`);
          formData.append('language', 'eng');
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
              const t = ocrData.ParsedResults[0].ParsedText.trim();
              if (t) {
                extractedText += (extractedText ? '\n' : '') + t;
                console.log(`OCR.space extracted ${t.length} chars from image ${imageCount - images.indexOf(image)}`);
              }
            }
          }
        } catch (ocrErr) {
          console.error('OCR.space failed:', ocrErr.message);
        }

        // Stop if we already have enough text
        if (extractedText.length > 500) break;
      }
    }

    if (!extractedText) {
      return res.status(200).json({
        destination: 'Unknown',
        checkIn: '—', checkOut: '—', hotel: '—', confirmation: '—',
        pages: imageCount,
        _ocrFailed: true,
        _note: 'Could not read text from your image. Try a clearer screenshot.',
      });
    }

    // DeepSeek parses extracted text
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
        checkIn: '—', checkOut: '—', hotel: '—', confirmation: '—',
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
        checkIn: '—', checkOut: '—', hotel: '—', confirmation: '—',
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