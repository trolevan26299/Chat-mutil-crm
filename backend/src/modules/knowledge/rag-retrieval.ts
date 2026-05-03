/**
 * rag-retrieval.ts
 * Vector similarity search using pgvector.
 * Given a user query, finds the top-K most relevant knowledge chunks for a team.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { embedText } from './embedding-service.js';

const TOP_K = 5; // Number of chunks to retrieve

export type RetrievedChunk = {
  content: string;
  similarity: number;
};

/**
 * Finds the most relevant knowledge chunks for a given query within a team's knowledge base.
 * Returns empty array if no API key configured or no indexed knowledge exists.
 */
export async function retrieveContext(
  query: string,
  teamIds: string[],
): Promise<RetrievedChunk[]> {
  if (!teamIds.length) return [];

  try {
    // Embed the query
    const queryEmbedding = await embedText(query);
    if (!queryEmbedding) return [];

    const vectorStr = `[${queryEmbedding.join(',')}]`;

    // Use pgvector cosine similarity search across all relevant teams
    const chunks = await prisma.$queryRaw<{ content: string; similarity: number }[]>`
      SELECT 
        content,
        1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM knowledge_chunks
      WHERE team_id = ANY(${teamIds}::text[])
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${TOP_K}
    `;

    return chunks.filter(c => c.similarity > 0.3); // Discard low-relevance results
  } catch (err) {
    logger.error('[rag-retrieval] Vector search failed:', err);
    return [];
  }
}

/**
 * Builds the RAG context string to inject into the AI prompt.
 */
export function buildRagContext(chunks: RetrievedChunk[]): string {
  if (!chunks.length) return '';

  const contextParts = chunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n');
  return `\n<knowledge_base>\n${contextParts}\n</knowledge_base>\n`;
}
