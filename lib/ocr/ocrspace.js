// OCR.space - Fallback OCR provider
import fetch from 'node-fetch';
import sharp from 'sharp';

const OCR_API = 'https://api.ocr.space/parse/image';

export async function extractTextWithOCRSpace(images, apiKey) {
  if (!apiKey || apiKey === 'helloworld') return { text: '', error: 'No valid OCR.space key' };

  let combinedText = '';

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    if (!image) continue;
    if (combinedText.length > 500) break;

    const rawData = image.replace(/^data:image\/\w+;base64,/, '');

    // Resize with sharp first (handles large images, converts to JPEG)
    let finalB64, finalMime = 'image/jpeg';
    try {
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
    } catch (e) {
      finalB64 = rawData;
      console.log('Sharp fallback:', e.message);
    }

    // OCR.space request
    try {
      const formData = new URLSearchParams();
      formData.append('base64Image', `data:${finalMime};base64,${finalB64}`);
      formData.append('language', 'eng');
      formData.append('OCREngine', '2');
      formData.append('scale', 'true');

      const response = await fetch(OCR_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          apikey: apiKey,
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        console.error(`OCR.space HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      if (data?.ParsedResults?.[0]?.ParsedText) {
        const text = data.ParsedResults[0].ParsedText.trim();
        if (text) {
          combinedText += (combinedText ? '\n' : '') + text;
          console.log(`OCR.space extracted ${text.length} chars from image ${i + 1}`);
        }
      }
    } catch (err) {
      console.error('OCR.space failed:', err.message);
    }
  }

  return { text: combinedText, error: combinedText ? null : 'No text extracted' };
}