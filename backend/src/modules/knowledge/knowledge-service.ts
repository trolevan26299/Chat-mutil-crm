/**
 * knowledge-service.ts
 * CRUD for team knowledge documents + indexing pipeline (chunking + embedding).
 * Supports: text, URL, PDF file.
 */
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { chunkText, fetchUrlContent } from './chunking.js';
import { embedBatch } from './embedding-service.js';

const require = createRequire(import.meta.url);

// ─── Types ───────────────────────────────────────────────────────────────────

export type CreateKnowledgeInput = {
  orgId: string;
  teamId: string;
  title: string;
  sourceType: 'text' | 'url' | 'file';
  content?: string;     // For 'text' type
  sourceUrl?: string;   // For 'url' type
  crawlLimit?: number;  // For 'url' type (how many subpages to crawl)
  fileBuffer?: Buffer;  // For 'file' type (PDF)
  fileUrl?: string;     // Stored file path
};

// ─── Create & Index ──────────────────────────────────────────────────────────

/**
 * Creates a new knowledge document and triggers background indexing.
 */
export async function createKnowledge(input: CreateKnowledgeInput) {
  let rawContent = '';

  // 1. For text and file, extract synchronously as it is fast
  if (input.sourceType === 'text') {
    rawContent = input.content || '';
    if (!rawContent.trim()) throw new Error('No content provided.');
  } else if (input.sourceType === 'file' && input.fileBuffer) {
    rawContent = await parsePdf(input.fileBuffer);
    if (!rawContent.trim()) throw new Error('No content could be extracted from PDF.');
  }

  // 2. Save knowledge record immediately
  const knowledge = await prisma.teamKnowledge.create({
    data: {
      id: randomUUID(),
      orgId: input.orgId,
      teamId: input.teamId,
      title: input.title,
      sourceType: input.sourceType,
      content: rawContent, // Will be updated later if URL
      sourceUrl: input.sourceUrl,
      fileUrl: input.fileUrl,
      status: 'indexing', // Show indexing status immediately on frontend
    },
  });

  // 3. Trigger async processing based on type
  if (input.sourceType === 'url' && input.sourceUrl) {
    // Run crawling AND indexing in the background
    processUrlInBackground(knowledge.id, input.sourceUrl, input.crawlLimit || 50).catch(err => {
      logger.error(`[knowledge] Background crawling failed for ${knowledge.id}:`, err);
    });
  } else {
    // Trigger async indexing for text/file directly
    indexKnowledge(knowledge.id, rawContent).catch(err => {
      logger.error(`[knowledge] Background indexing failed for ${knowledge.id}:`, err);
    });
  }

  return knowledge;
}

/**
 * Background worker to crawl URL then trigger indexing
 */
async function processUrlInBackground(knowledgeId: string, url: string, limit: number) {
  try {
    const rawContent = await fetchUrlContent(url, limit);
    if (!rawContent.trim()) {
      throw new Error('No content could be extracted from the provided URL.');
    }

    // Update content in DB
    await prisma.teamKnowledge.update({
      where: { id: knowledgeId },
      data: { content: rawContent },
    });

    // Continue to index
    await indexKnowledge(knowledgeId, rawContent);
  } catch (err) {
    logger.error(`[knowledge] Process URL error for ${knowledgeId}:`, err);
    await prisma.teamKnowledge.update({
      where: { id: knowledgeId },
      data: { status: 'failed', errorMsg: String(err) },
    });
  }
}

/**
 * Runs the indexing pipeline: chunk → embed → save vectors.
 */
export async function indexKnowledge(knowledgeId: string, content: string) {
  try {
    // Get teamId for the record
    const knowledge = await prisma.teamKnowledge.findUnique({
      where: { id: knowledgeId },
      select: { teamId: true, orgId: true },
    });
    if (!knowledge) return;

    // Delete old chunks if re-indexing
    await prisma.knowledgeChunk.deleteMany({ where: { knowledgeId } });

    // Split into chunks
    const chunks = chunkText(content);
    logger.info(`[knowledge] Indexing ${knowledgeId}: ${chunks.length} chunks`);

    // Embed all chunks
    const embeddings = await embedBatch(chunks);

    // Save chunks with embeddings using raw SQL (pgvector)
    let savedCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunkId = randomUUID();
      const embedding = embeddings[i];

      if (embedding) {
        // Use raw query to insert vector type
        await prisma.$executeRaw`
          INSERT INTO knowledge_chunks (id, knowledge_id, team_id, org_id, chunk_index, content, embedding, created_at)
          VALUES (
            ${chunkId},
            ${knowledgeId},
            ${knowledge.teamId},
            ${knowledge.orgId},
            ${i},
            ${chunks[i]},
            ${`[${embedding.join(',')}]`}::vector,
            NOW()
          )
        `;
        savedCount++;
      } else {
        // Save without embedding if API call failed
        await prisma.knowledgeChunk.create({
          data: {
            id: chunkId,
            knowledgeId,
            teamId: knowledge.teamId,
            orgId: knowledge.orgId,
            chunkIndex: i,
            content: chunks[i],
          },
        });
      }
    }

    // Update status
    await prisma.teamKnowledge.update({
      where: { id: knowledgeId },
      data: { status: 'indexed', chunkCount: savedCount },
    });

    logger.info(`[knowledge] Indexed ${knowledgeId}: ${savedCount}/${chunks.length} chunks with embeddings`);
  } catch (err) {
    logger.error(`[knowledge] Indexing error for ${knowledgeId}:`, err);
    await prisma.teamKnowledge.update({
      where: { id: knowledgeId },
      data: { status: 'failed', errorMsg: String(err) },
    });
  }
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function listKnowledge(teamId: string, orgId: string) {
  return prisma.teamKnowledge.findMany({
    where: { teamId, orgId },
    select: { id: true, title: true, sourceType: true, status: true, chunkCount: true, createdAt: true, sourceUrl: true, fileUrl: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function deleteKnowledge(id: string, orgId: string) {
  return prisma.teamKnowledge.delete({
    where: { id, orgId },
  });
}

export async function reindexKnowledge(id: string, orgId: string) {
  const knowledge = await prisma.teamKnowledge.findFirst({
    where: { id, orgId },
    select: { content: true },
  });
  if (!knowledge) throw new Error('Knowledge not found');

  await prisma.teamKnowledge.update({ where: { id }, data: { status: 'indexing' } });
  indexKnowledge(id, knowledge.content).catch(() => {});
}

// ─── PDF Parsing ─────────────────────────────────────────────────────────────

async function parsePdf(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import to avoid issues with ESM/CJS
    const pdfParse = require('pdf-parse');
    const result = await pdfParse(buffer);
    return result.text || '';
  } catch (err) {
    logger.error('[knowledge] PDF parse error:', err);
    throw new Error('Failed to parse PDF file');
  }
}
