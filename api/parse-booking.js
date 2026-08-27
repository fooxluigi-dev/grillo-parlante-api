// API endpoint: parse booking confirmation images using OCR + AI
// POST /api/parse-booking
// Body: { images: string[] } — array of base64 data URLs
// Uses GPT-4o vision (primary) → OCR.space (fallback) for text extraction + DeepSeek for parsing

import fetch from 'node-fetch';
import { withAuth } from '../lib/auth.js';
import { extractTextFromImages } from '../lib/ocr/index.js';
import { parseBookingWithDeepSeek } from '../lib/parsing/index.js';
import { parseBookingInputSchema, parsedBookingSchema } from '../lib/schemas/index.js';

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';

export default withAuth(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  const OCR_KEY = process.env.OCR_SPACE_API_KEY || 'helloworld';

  try {
    // Validate input
    const inputValidation = parseBookingInputSchema.safeParse(req.body);
    if (!inputValidation.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: inputValidation.error.flatten(),
      });
    }

    const { images, ocrText } = inputValidation.data;
    const imageCount = images?.length || 0;

    if (imageCount === 0 && !ocrText) {
      return res.status(400).json({ error: 'No images or text provided' });
    }

    // Extract text from images (or use provided OCR text)
    let extractedText = ocrText || '';

    if (!extractedText && imageCount > 0) {
      const { text, provider, error } = await extractTextFromImages(
        images,
        OPENAI_KEY,
        OCR_KEY
      );

      if (error) {
        console.error('OCR failed:', error);
      }

      extractedText = text;
    }

    if (!extractedText) {
      return res.status(200).json({
        destination: 'Unknown',
        checkIn: '—',
        checkOut: '—',
        hotel: '—',
        confirmation: '—',
        pages: imageCount,
        _ocrFailed: true,
        _note: 'Could not read text from your image. Try a clearer screenshot.',
      });
    }

    // Parse with DeepSeek + Zod validation
    const { data: parsed, validationErrors, error } = await parseBookingWithDeepSeek(
      extractedText,
      DEEPSEEK_KEY
    );

    if (error) {
      console.error('DeepSeek parsing failed:', error);
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

    // Validate final output with Zod
    const finalValidation = parsedBookingSchema.safeParse(parsed);
    if (!finalValidation.success) {
      console.error('Output validation failed:', finalValidation.error.flatten());
      // Return the raw parsed data anyway — a validation warning must never
      // drop the booking fields the user needs (this caused empty responses).
      return res.status(200).json({
        ...parsed,
        pages: imageCount,
        _ocrProvider: extractedText === ocrText ? 'provided' : 'auto',
        _validationWarnings: finalValidation.error.flatten().fieldErrors,
      });
    }

    return res.status(200).json({
      ...finalValidation.data,
      pages: imageCount,
      _ocrProvider: extractedText === ocrText ? 'provided' : 'auto',
      _validationWarnings: validationErrors ? validationErrors.fieldErrors : null,
    });

  } catch (e) {
    console.error('Parse error:', e);
    return res.status(500).json({ error: 'Internal error', pages: images?.length || 0 });
  }
});