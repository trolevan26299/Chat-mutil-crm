/**
 * Campaign Runner — resolves contacts, builds queue chunks,
 * and sends messages with anti-spam random delays.
 *
 * Strategy:
 *   - Chunk size: 3 contacts per chunk
 *   - Delay between contacts in chunk: random 1000–2000ms
 *   - Delay between chunks: random 5000–10000ms
 *   - 1 contact ↔ multiple Zalo accounts → one queue item per account
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { resolveGroupContacts } from './campaign-routes.js';

const CHUNK_SIZE = 3;

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Build ordered list of sendable blocks — preserves creation order
type SendBlock =
  | { type: 'text'; value: string }
  | { type: 'image'; buffer: Buffer; filename: string; size: number };

function buildOrderedBlocks(content: any[]): SendBlock[] {
  const blocks: SendBlock[] = [];
  for (const block of (content || [])) {
    if (block.type === 'text' && block.value?.trim()) {
      blocks.push({ type: 'text', value: block.value });
    } else if (block.type === 'image' && block.base64) {
      const mimeMatch = block.base64.match(/^data:([^;]+);base64,/);
      const mime = mimeMatch?.[1] || 'image/jpeg';
      const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
      const rawBase64 = block.base64.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(rawBase64, 'base64');
      const filename = (block.filename as string | undefined) || `image.${ext}`;
      blocks.push({ type: 'image', buffer, filename, size: buffer.length });
    }
  }
  return blocks;
}

export async function enqueueCampaign(campaign: {
  id: string;
  orgId: string;
  group: any;
  content: any;
  title: string;
}) {
  logger.info(`[Campaign] Enqueueing campaign "${campaign.title}" (${campaign.id})`);

  // Resolve contacts from group
  const contacts = await resolveGroupContacts(campaign.group, campaign.orgId);
  if (!contacts.length) {
    logger.warn(`[Campaign] No contacts resolved for campaign ${campaign.id}`);
    return;
  }

  // Delete any previous pending items to avoid duplicate sends
  await prisma.campaignQueue.deleteMany({
    where: { campaignId: campaign.id, status: 'pending' },
  });

  // Build queue items: each (contact × zaloAccount) pair
  const queueItems: {
    id: string;
    campaignId: string;
    contactId: string;
    zaloAccountId: string;
    chunkIndex: number;
    status: string;
  }[] = [];

  let chunkIndex = 0;
  let positionInChunk = 0;

  for (const contact of contacts) {
    const convs = (contact as any).conversations || [];
    // Unique zalo account IDs linked to this contact
    const zaloAccountIds = [...new Set(convs.map((c: any) => c.zaloAccountId))] as string[];

    if (!zaloAccountIds.length) {
      // No Zalo account linked — skip
      continue;
    }

    for (const zaloAccountId of zaloAccountIds) {
      queueItems.push({
        id: randomUUID(),
        campaignId: campaign.id,
        contactId: contact.id,
        zaloAccountId,
        chunkIndex,
        status: 'pending',
      });

      positionInChunk++;
      if (positionInChunk >= CHUNK_SIZE) {
        positionInChunk = 0;
        chunkIndex++;
      }
    }
  }

  if (!queueItems.length) {
    logger.warn(`[Campaign] No Zalo-linked contacts for campaign ${campaign.id}`);
    return;
  }

  // Bulk insert queue items
  await prisma.campaignQueue.createMany({ data: queueItems });
  logger.info(`[Campaign] Queued ${queueItems.length} items in ${chunkIndex + 1} chunks`);

  // Run the queue
  await processCampaignQueue(campaign);
}

async function processCampaignQueue(campaign: { id: string; content: any; title: string }) {
  const orderedBlocks = buildOrderedBlocks(campaign.content as any[]);

  // Get distinct chunk indices
  const chunks = await prisma.campaignQueue.groupBy({
    by: ['chunkIndex'],
    where: { campaignId: campaign.id, status: 'pending' },
    orderBy: { chunkIndex: 'asc' },
  });

  for (let ci = 0; ci < chunks.length; ci++) {
    const { chunkIndex } = chunks[ci];

    const items = await prisma.campaignQueue.findMany({
      where: { campaignId: campaign.id, chunkIndex, status: 'pending' },
      include: {
        contact: { select: { zaloUid: true, fullName: true } },
      },
    });

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Mark as sending
      await prisma.campaignQueue.update({
        where: { id: item.id },
        data: { status: 'sending' },
      });

      try {
        const instance = zaloPool.getInstance(item.zaloAccountId);
        if (!instance?.api) throw new Error('Zalo account not connected');

        // Get thread ID from conversation
        const conv = await prisma.conversation.findFirst({
          where: { zaloAccountId: item.zaloAccountId, contactId: item.contactId },
          select: { externalThreadId: true, threadType: true },
        });

        if (!conv?.externalThreadId) throw new Error('No conversation found');

        const threadId = conv.externalThreadId;
        const threadType = (conv as any).threadType === 'group' ? 1 : 0;

        // Send blocks in original creation order (text → image → text → image...)
        for (let bIdx = 0; bIdx < orderedBlocks.length; bIdx++) {
          const block = orderedBlocks[bIdx];
          if (block.type === 'text') {
            await instance.api.sendMessage({ msg: block.value }, threadId, threadType);
          } else if (block.type === 'image') {
            await instance.api.sendMessage(
              {
                msg: '',
                attachments: [{
                  data: block.buffer,
                  filename: block.filename as any,
                  metadata: { totalSize: block.size },
                }],
              },
              threadId,
              threadType
            );
          }
          // Small delay between consecutive blocks (except after last)
          if (bIdx < orderedBlocks.length - 1) {
            await randomDelay(600, 1200);
          }
        }

        await prisma.campaignQueue.update({
          where: { id: item.id },
          data: { status: 'sent', sentAt: new Date() },
        });

        logger.info(`[Campaign] Sent to ${item.contact.fullName} via ${item.zaloAccountId}`);
      } catch (err: any) {
        logger.error(`[Campaign] Failed to send to contact ${item.contactId}:`, err.message);
        await prisma.campaignQueue.update({
          where: { id: item.id },
          data: { status: 'failed', error: err.message },
        });
      }

      // Delay between contacts within chunk (1–2s)
      if (i < items.length - 1) {
        await randomDelay(1000, 2000);
      }
    }

    // Delay between chunks (5–10s), skip after last chunk
    if (ci < chunks.length - 1) {
      await randomDelay(5000, 10000);
    }
  }

  logger.info(`[Campaign] Finished processing campaign ${campaign.id}`);
}
