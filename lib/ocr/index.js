// Unified OCR - tries GPT-4o first, falls back to OCR.space
import { extractTextWithGPT4o } from './gpt4o.js';
import { extractTextWithOCRSpace } from './ocrspace.js';

export async function extractTextFromImages(images, openaiKey, ocrSpaceKey) {
  // Primary: GPT-4o Vision (reads all images at once)
  if (openaiKey) {
    try {
      const result = await extractTextWithGPT4o(images, openaiKey);
      if (result.text) {
        return { text: result.text, provider: 'gpt4o', error: null };
      }
    } catch (e) {
      console.error('GPT-4o OCR threw:', e.message);
    }
  }

  // Fallback: OCR.space (per image)
  try {
    const result = await extractTextWithOCRSpace(images, ocrSpaceKey);
    if (result.text) {
      return { text: result.text, provider: 'ocrspace', error: null };
    }
  } catch (e) {
    console.error('OCR.space threw:', e.message);
  }

  return { text: '', provider: 'none', error: 'All OCR providers failed' };
}

// Re-export for convenience
export { extractTextWithGPT4o } from './gpt4o.js';
export { extractTextWithOCRSpace } from './ocrspace.js';
