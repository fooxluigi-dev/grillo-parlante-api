// GPT-4o Vision OCR - Primary OCR provider
import fetch from 'node-fetch';

const OPENAI_API = 'https://api.openai.com/v1/chat/completions';

export interface GPT4oOCRResult {
  text: string;
  error: string | null;
}

export async function extractTextWithGPT4o(images: string[], apiKey: string): Promise<GPT4oOCRResult> {
  if (!apiKey) return { text: '', error: 'No API key' };

  try {
    const parts = images.map(img => ({
      type: 'image_url',
      image_url: { url: img, detail: 'high' },
    }));

    const response = await fetch(OPENAI_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract ALL text visible in these booking confirmation screenshots. Return every word, number, name, date and detail you can see. Preserve the original structure.',
            },
            ...parts,
          ],
        }],
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { text: '', error: `GPT-4o ${response.status}: ${errText.slice(0, 200)}` };
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || '';
    return { text, error: null };
  } catch (err) {
    return { text: '', error: err instanceof Error ? err.message : 'Unknown error' };
  }
}