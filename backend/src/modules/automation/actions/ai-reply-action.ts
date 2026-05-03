/**
 * ai-reply-action.ts
 * Automation action: generate an AI reply draft and send it automatically.
 * Only fires when the contact has opted into AI auto-reply via metadata.aiAutoReply = true.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../shared/database/prisma-client.js';
import { logger } from '../../../shared/utils/logger.js';
import { config } from '../../../config/index.js';
import { getAiConfig } from '../../ai/ai-service.js';
import { generateWithOpenaiCompat } from '../../ai/providers/openai-compat.js';
import { buildReplyDraftPrompt } from '../../ai/prompts/reply-draft.js';
import { zaloPool } from '../../zalo/zalo-pool.js';
import { zaloRateLimiter } from '../../zalo/zalo-rate-limiter.js';
import { retrieveContext, buildRagContext } from '../../knowledge/rag-retrieval.js';

type MessageRow = { senderType: string; senderName: string | null; content: string | null; sentAt: Date };

function detectLanguage(text: string): 'vi' | 'en' {
  if (/[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(text)) return 'vi';
  const hints = [' khách ', ' chào ', ' tư vấn ', ' báo giá ', ' sản phẩm ', ' giúp ', ' nhé ', ' không '];
  return hints.some((h) => (` ${text.toLowerCase()} `).includes(h)) ? 'vi' : 'en';
}

function escapeXml(text: string): string {
  return text.replace(/<\/?conversation_context>/gi, '');
}

function buildContext(messages: MessageRow[]): string {
  return messages
    .map((m) => {
      const author = m.senderType === 'self' ? 'staff' : (m.senderName || 'customer');
      return `[${m.sentAt.toISOString()}] ${author}: ${escapeXml(m.content || '(empty)')}`;
    })
    .join('\n');
}

export async function aiReplyAction(input: {
  orgId: string;
  conversationId: string;
  zaloAccountId: string;
  threadId: string | null;
  threadType: string;
}): Promise<boolean> {
  if (!input.threadId) return false;

  // Load AI config
  const aiConfig = await getAiConfig(input.orgId);
  if (!aiConfig.enabled) {
    logger.warn('[ai-reply] AI disabled for org, skipping');
    return false;
  }

  const apiKey = config.openrouterApiKey;
  if (!apiKey) {
    logger.warn('[ai-reply] No OpenRouter API key configured, skipping');
    return false;
  }

  // Load conversation + recent messages
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, orgId: input.orgId },
    include: {
      contact: { select: { fullName: true } },
      messages: {
        where: { isDeleted: false },
        orderBy: { sentAt: 'desc' },
        take: 30,
        select: { senderType: true, senderName: true, content: true, sentAt: true },
      },
    },
  });
  if (!conversation) return false;

  const messages = [...conversation.messages].reverse();
  const contextText = buildContext(messages);
  const language = detectLanguage(contextText);
  const customerName = conversation.contact?.fullName || 'customer';

  // --- RAG: Find teams managing this Zalo account and retrieve knowledge context ---
  // Take the last 10 messages for better semantic search context instead of just the last one
  const recentMessages = messages.slice(-10);
  const recentContextQuery = recentMessages
    .filter(m => m.content)
    .map(m => `${m.senderType === 'contact' ? 'Khách hàng' : 'Nhân viên'}: ${m.content}`)
    .join('\n');
    
  let ragContext = '';
  try {
    // Find users who have access to this Zalo account
    const accessUsers = await prisma.zaloAccountAccess.findMany({
      where: { zaloAccountId: input.zaloAccountId },
      select: { userId: true },
    });
    const userIds = accessUsers.map(a => a.userId);

    let teamIds: string[] = [];
    if (userIds.length > 0) {
      // Find all teams these users belong to (via TeamMember N-N)
      const teamMemberships = await prisma.teamMember.findMany({
        where: { userId: { in: userIds } },
        select: { teamId: true },
      });
      teamIds = [...new Set(teamMemberships.map(m => m.teamId))];
    } else {
      // Fallback: if no explicit access control, use all teams in the organization
      const orgTeams = await prisma.team.findMany({
        where: { orgId: input.orgId },
        select: { id: true }
      });
      teamIds = orgTeams.map(t => t.id);
    }

    if (teamIds.length > 0 && recentContextQuery) {
      const chunks = await retrieveContext(recentContextQuery, teamIds);
      ragContext = buildRagContext(chunks);
      if (ragContext) {
        logger.info(`[ai-reply] RAG context found: ${chunks.length} chunks from ${teamIds.length} teams`);
      }
    }
  } catch (err) {
    logger.warn('[ai-reply] RAG retrieval failed (non-critical):', err);
  }
  // --- End RAG ---

  const system = buildReplyDraftPrompt(language);
  const userPrompt = [
    ragContext, // Inject knowledge context BEFORE conversation
    '<conversation_context>',
    `Customer: ${customerName}`,
    contextText,
    '</conversation_context>',
  ].filter(Boolean).join('\n');

  // Generate AI reply via OpenRouter
  let replyText: string;
  try {
    replyText = (await generateWithOpenaiCompat(
      config.openrouterBaseUrl,
      apiKey,
      aiConfig.model,
      system,
      userPrompt,
    )).trim();
  } catch (err) {
    logger.error('[ai-reply] AI generation failed:', err);
    return false;
  }

  if (!replyText) return false;

  // Split into multiple messages on the ---MSG--- delimiter
  const MSG_DELIMITER = '---MSG---';
  const messageParts = replyText
    .split(MSG_DELIMITER)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Send via Zalo
  const instance = zaloPool.getInstance(input.zaloAccountId);
  if (!instance?.api) {
    logger.warn('[ai-reply] Zalo instance not found:', input.zaloAccountId);
    return false;
  }

  const limits = zaloRateLimiter.checkLimits(input.zaloAccountId);
  if (!limits.allowed) {
    logger.warn('[ai-reply] Zalo rate limit hit, skipping');
    return false;
  }

  try {
    const threadType = input.threadType === 'group' ? 1 : 0;

    for (let i = 0; i < messageParts.length; i++) {
      const part = messageParts[i];

      // Small human-like delay between messages (skip before first message)
      if (i > 0) {
        await new Promise(r => setTimeout(r, 1200 + Math.random() * 800)); // 1.2–2s
      }

      zaloRateLimiter.recordSend(input.zaloAccountId);
      const sendResult = await instance.api.sendMessage({ msg: part }, input.threadId, threadType);
      const zaloMsgId = String(sendResult?.msgId || sendResult?.data?.msgId || '');

      await prisma.message.create({
        data: {
          id: randomUUID(),
          conversationId: input.conversationId,
          zaloMsgId: zaloMsgId || null,
          senderType: 'self',
          senderUid: null,
          senderName: 'AI Trợ lý',
          content: part,
          contentType: 'text',
          sentAt: new Date(),
        },
      });
    }

    await prisma.conversation.update({
      where: { id: input.conversationId },
      data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 },
    });

    // Record AI usage (using the full combined text)
    await prisma.aiSuggestion.create({
      data: {
        orgId: input.orgId,
        conversationId: input.conversationId,
        type: 'reply_draft',
        content: messageParts.join('\n'),
        confidence: 0.8,
      },
    });

    logger.info(`[ai-reply] Auto-replied to conversation ${input.conversationId} (${messageParts.length} messages)`);
    return true;
  } catch (err) {
    logger.error('[ai-reply] Failed to send message:', err);
    return false;
  }
}
