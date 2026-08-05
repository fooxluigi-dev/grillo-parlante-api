// Unified OCR - tries GPT-4o first, falls back to OCR.space
import { extractTextWithGPT4o, GPT4oOCRResult } from './gpt4o.js';
import { extractTextWithOCRSpace, OCRSpaceResult } from './ocrspace.js';

export interface UnifiedOCRResult {
  text: string;
  provider: 'gpt4o' | 'ocrspace' | 'none';
  error: string | null;
}

export async function extractTextFromImages(
  images: string[],
  openaiKey: string,
  ocrSpaceKey: string
): Promise<UnifiedOCRResult> {
  // Primary: GPT-4o Vision (reads all images at once)
  if (openaiKey) {
    console.log('Trying GPT-4o Vision OCR...');
    const result: GPT4oOCRResult = await extractTextWithGPT4o(images, openaiKey);
    if (result.text) {
      console.log(`GPT-4o extracted ${result.text.length} chars from ${images.length} image(s)`);
      return { text: result.text, provider: 'gpt4o', error: null };
    }
    console.log('GPT-4o failed:', result.error);
  }

  // Fallback: OCR.space (per image)
  console.log('Falling back to OCR.space...');
  const result: OCRSpaceResult = await extractTextWithOCRSpace(images, ocrSpaceKey);
  if (result.text) {
    console.log(`OCR.space extracted ${result.text.length} chars total`);
    return { text: result.text, provider: 'ocrspace', error: null };
  }
  console.log('OCR.space failed:', result.error);

  return { text: '', provider: 'none', error: 'All OCR providers failed' };
}

// Re-export for convenience
export { extractTextWithGPT4o } from './gpt4o.js';
export { extractTextWithOCRSpace } from './ocrspace.js';
export type { GPT4oOCRResult, OCRSpaceResult };