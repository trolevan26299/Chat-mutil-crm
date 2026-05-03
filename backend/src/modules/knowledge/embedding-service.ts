/**
 * embedding-service.ts
 * Calls Google Gemini text-embedding-004 to generate vector embeddings.
 * Free tier: 1,500 req/min, 1M tokens/day — sufficient for knowledge base indexing.
 */
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';

const GEMINI_EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent`;

/**
 * Generates a 768-dimension vector embedding for the given text.
 * Returns null if the API key is not configured.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = config.googleAiApiKey;
  if (!apiKey) {
    logger.warn('[embedding] GOOGLE_AI_API_KEY not configured — skipping embedding');
    return null;
  }

  // Truncate to ~8000 chars to stay within token limits
  const truncated = text.slice(0, 8000);

  const res = await fetch(`${GEMINI_EMBED_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-2',
      content: { parts: [{ text: truncated }] },
      outputDimensionality: 768,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[embedding] Gemini API error ${res.status}: ${err}`);
  }

  const json = await res.json() as any;
  return json?.embedding?.values as number[];
}

/**
 * Batch embed multiple texts (sequential to avoid rate limits).
 */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = [];
  for (const text of texts) {
    try {
      results.push(await embedText(text));
      // Small delay to respect rate limits
      await new Promise(r => setTimeout(r, 50));
    } catch (err) {
      logger.error('[embedding] Failed to embed chunk:', err);
      results.push(null);
    }
  }
  return results;
}
