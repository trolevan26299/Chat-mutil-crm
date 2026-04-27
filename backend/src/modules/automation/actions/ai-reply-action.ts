/**
 * ai-reply-action.ts
 * Automation action: generate an AI reply draft and send it automatically.
 * Only fires when the contact has opted into AI auto-reply via metadata.aiAutoReply = true.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../shared/database/prisma-client.js';
import { logger } from '../../../shared/utils/logger.js';
import { getAiConfig, getProviderApiKey } from '../../ai/ai-service.js';
import { getProviderConfig } from '../../ai/provider-registry.js';
import { generateWithAnthropic } from '../../ai/providers/anthropic.js';
import { generateWithGemini } from '../../ai/providers/gemini.js';
import { generateWithOpenaiCompat } from '../../ai/providers/openai-compat.js';
import { buildReplyDraftPrompt } from '../../ai/prompts/reply-draft.js';
import { zaloPool } from '../../zalo/zalo-pool.js';
import { zaloRateLimiter } from '../../zalo/zalo-rate-limiter.js';

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

async function callAi(orgId: string, provider: string, model: string, apiKey: string, system: string, prompt: string): Promise<string> {
  const providerDef = getProviderConfig(provider);
  const baseUrl = providerDef?.baseUrl || '';
  if (provider === 'anthropic') return generateWithAnthropic(baseUrl, apiKey, model, system, prompt);
  if (provider === 'gemini')    return generateWithGemini(baseUrl, apiKey, model, system, prompt);
  if (provider === 'openai')    return generateWithOpenaiCompat(`${baseUrl}/v1/chat/completions`, apiKey, model, system, prompt);
  if (provider === 'qwen')      return generateWithOpenaiCompat(`${baseUrl}/compatible-mode/v1/chat/completions`, apiKey, model, system, prompt);
  if (provider === 'kimi')      return generateWithOpenaiCompat(`${baseUrl}/v1/chat/completions`, apiKey, model, system, prompt);
  throw new Error(`Unsupported AI provider: ${provider}`);
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

  const apiKey = await getProviderApiKey(input.orgId, aiConfig.provider);
  if (!apiKey) {
    logger.warn('[ai-reply] No AI API key configured, skipping');
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

  const system = buildReplyDraftPrompt(language);
  const userPrompt = [
    '<conversation_context>',
    `Customer: ${customerName}`,
    contextText,
    '</conversation_context>',
  ].join('\n');

  // Generate AI reply
  let replyText: string;
  try {
    replyText = (await callAi(input.orgId, aiConfig.provider, aiConfig.model, apiKey, system, userPrompt)).trim();
  } catch (err) {
    logger.error('[ai-reply] AI generation failed:', err);
    return false;
  }

  if (!replyText) return false;

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
    zaloRateLimiter.recordSend(input.zaloAccountId);
    const threadType = input.threadType === 'group' ? 1 : 0;
    const sendResult = await instance.api.sendMessage({ msg: replyText }, input.threadId, threadType);
    const zaloMsgId = String(sendResult?.msgId || sendResult?.data?.msgId || '');

    await prisma.message.create({
      data: {
        id: randomUUID(),
        conversationId: input.conversationId,
        zaloMsgId: zaloMsgId || null,
        senderType: 'self',
        senderUid: null,
        senderName: 'AI Trợ lý',
        content: replyText,
        contentType: 'text',
        sentAt: new Date(),
      },
    });

    await prisma.conversation.update({
      where: { id: input.conversationId },
      data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 },
    });

    logger.info(`[ai-reply] Auto-replied to conversation ${input.conversationId}`);
    return true;
  } catch (err) {
    logger.error('[ai-reply] Failed to send message:', err);
    return false;
  }
}
