import { prisma } from '../../shared/database/prisma-client.js';
import { config } from '../../config/index.js';
import { OPENROUTER_MODELS } from './provider-registry.js';
import { generateWithOpenaiCompat } from './providers/openai-compat.js';
import { buildReplyDraftPrompt } from './prompts/reply-draft.js';
import { buildSummaryPrompt } from './prompts/summary.js';
import { buildSentimentPrompt } from './prompts/sentiment.js';
import { retrieveContext, buildRagContext } from '../knowledge/rag-retrieval.js';
import { logger } from '../../shared/utils/logger.js';
export type AiTaskType = 'reply_draft' | 'summary' | 'sentiment';

type MessageContext = { senderType: string; senderName: string | null; content: string | null; sentAt: Date };
type SentimentResult = { label: 'positive' | 'neutral' | 'negative'; confidence: number; reason: string };

function detectLanguage(text: string): 'vi' | 'en' {
  if (/[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(text)) return 'vi';
  const vietnameseHints = [' khách ', ' chào ', ' tư vấn ', ' báo giá ', ' sản phẩm ', ' giúp ', ' nhé ', ' không '];
  return vietnameseHints.some((hint) => (` ${text.toLowerCase()} `).includes(hint)) ? 'vi' : 'en';
}

function escapeXmlBoundary(text: string): string {
  return text.replace(/<\/?conversation_context>/gi, '');
}

function buildConversationContext(messages: MessageContext[]) {
  return messages
    .map((msg) => {
      const author = msg.senderType === 'self' ? 'staff' : (msg.senderName || 'customer');
      const content = escapeXmlBoundary(msg.content || '(empty)');
      return `[${msg.sentAt.toISOString()}] ${author}: ${content}`;
    })
    .join('\n');
}

export async function getAiConfig(orgId: string) {
  let aiConfig = await prisma.aiConfig.findUnique({ where: { orgId } });
  if (!aiConfig) {
    aiConfig = await prisma.aiConfig.create({
      data: { orgId, provider: 'openrouter', model: config.aiDefaultModel, maxDaily: 500, enabled: true },
    });
  }

  // Migrate stale model slugs (e.g. old 'gemini-flash-latest') to new default
  const validValues = OPENROUTER_MODELS.map(m => m.value);
  const effectiveModel = validValues.includes(aiConfig.model) ? aiConfig.model : config.aiDefaultModel;
  if (effectiveModel !== aiConfig.model) {
    // Silently update DB so next load is clean
    await prisma.aiConfig.update({ where: { orgId }, data: { model: effectiveModel, provider: 'openrouter' } });
  }

  return {
    ...aiConfig,
    model: effectiveModel,
    provider: 'openrouter',
    hasKey: !!config.openrouterApiKey,
    availableModels: OPENROUTER_MODELS,
  };
}

export async function updateAiConfig(orgId: string, input: { model?: string; maxDaily?: number; enabled?: boolean }) {
  return prisma.aiConfig.upsert({
    where: { orgId },
    create: {
      orgId,
      provider: 'openrouter',
      model: input.model || config.aiDefaultModel,
      maxDaily: input.maxDaily ?? 500,
      enabled: input.enabled ?? true,
    },
    update: {
      model: input.model,
      maxDaily: input.maxDaily,
      enabled: input.enabled,
    },
  });
}

export async function getAiUsage(orgId: string) {
  const currentConfig = await getAiConfig(orgId);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const usedToday = await prisma.aiSuggestion.count({ where: { orgId, createdAt: { gte: startOfDay } } });

  // 1. Fetch 7-day usage chart data from database
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  
  const weeklyRecords = await prisma.aiSuggestion.findMany({
    where: { orgId, createdAt: { gte: sevenDaysAgo } },
    select: { createdAt: true },
  });

  const chartData = Array(7).fill(0);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  weeklyRecords.forEach(record => {
    const recordDate = new Date(record.createdAt);
    recordDate.setHours(0, 0, 0, 0);
    const diffDays = Math.round((startOfToday.getTime() - recordDate.getTime()) / (1000 * 3600 * 24));
    if (diffDays >= 0 && diffDays < 7) {
      chartData[6 - diffDays]++;
    }
  });

  // 2. Fetch OpenRouter billing data
  let costDaily = 0;
  let costMonthly = 0;
  if (config.openrouterApiKey) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { Authorization: `Bearer ${config.openrouterApiKey}` },
      });
      if (res.ok) {
        const json = await res.json() as any;
        if (json?.data) {
          costDaily = json.data.usage_daily || 0;
          costMonthly = json.data.usage_monthly || 0;
        }
      }
    } catch (err) {
      logger.error('[ai-service] Failed to fetch OpenRouter billing:', err);
    }
  }

  return {
    usedToday,
    maxDaily: currentConfig.maxDaily,
    remaining: Math.max(0, currentConfig.maxDaily - usedToday),
    enabled: currentConfig.enabled,
    costDaily,
    costMonthly,
    chartData,
  };
}

async function loadConversation(conversationId: string, orgId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId },
    include: {
      contact: { select: { fullName: true } },
      messages: {
        where: { isDeleted: false },
        orderBy: { sentAt: 'desc' },
        take: 40,
        select: { senderType: true, senderName: true, content: true, sentAt: true },
      },
    },
  });
  if (!conversation) throw new Error('Conversation not found');
  return { ...conversation, messages: [...conversation.messages].reverse() };
}

async function generateText(model: string, system: string, prompt: string) {
  const apiKey = config.openrouterApiKey;
  if (!apiKey) throw new Error('AI provider key is not configured');
  return generateWithOpenaiCompat(config.openrouterBaseUrl, apiKey, model, system, prompt);
}

async function saveSuggestion(input: { orgId: string; conversationId: string; messageId?: string; type: AiTaskType; content: string; confidence: number }) {
  return prisma.aiSuggestion.create({
    data: {
      orgId: input.orgId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      type: input.type,
      content: input.content,
      confidence: input.confidence,
    },
  });
}

export async function generateAiOutput(input: { orgId: string; conversationId: string; type: AiTaskType; messageId?: string }) {
  const [currentConfig, conversation] = await Promise.all([
    getAiConfig(input.orgId),
    loadConversation(input.conversationId, input.orgId),
  ]);

  if (!currentConfig.enabled) throw new Error('AI is disabled for this organization');
  if (!currentConfig.hasKey) throw new Error('AI provider key is not configured');

  // Atomic quota check — count inside transaction to prevent TOCTOU race
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withinQuota = await prisma.$transaction(async (tx: any) => {
    const usedToday = await tx.aiSuggestion.count({ where: { orgId: input.orgId, createdAt: { gte: startOfDay } } });
    return usedToday < currentConfig.maxDaily;
  });
  if (!withinQuota) throw new Error('AI daily quota exceeded');

  const contextText = buildConversationContext(conversation.messages);
  const language = detectLanguage(contextText);
  const customerName = conversation.contact?.fullName || 'customer';

  // --- RAG: Inject knowledge base context for reply drafts ---
  let ragContext = '';
  if (input.type === 'reply_draft') {
    // Take the last 10 messages for better semantic search context instead of just the last one
    const recentMessages = conversation.messages.slice(-10);
    const recentContextQuery = recentMessages
      .filter(m => m.content)
      .map(m => `${m.senderType === 'contact' ? 'Khách hàng' : 'Nhân viên'}: ${m.content}`)
      .join('\n');

    if (recentContextQuery) {
      try {
        const accessUsers = await prisma.zaloAccountAccess.findMany({
          where: { zaloAccountId: conversation.zaloAccountId },
          select: { userId: true },
        });
        const userIds = accessUsers.map(a => a.userId);
        
        let teamIds: string[] = [];
        if (userIds.length > 0) {
          const teamMemberships = await prisma.teamMember.findMany({
            where: { userId: { in: userIds } },
            select: { teamId: true },
          });
          teamIds = [...new Set(teamMemberships.map(m => m.teamId))];
        } else {
          const orgTeams = await prisma.team.findMany({
            where: { orgId: input.orgId },
            select: { id: true }
          });
          teamIds = orgTeams.map(t => t.id);
        }
        
        if (teamIds.length > 0) {
          const chunks = await retrieveContext(recentContextQuery, teamIds);
          ragContext = buildRagContext(chunks);
        }
      } catch (err) {
        logger.warn('[ai-service] RAG retrieval failed:', err);
      }
    }
  }
  // --- End RAG ---

  const userPrompt = [
    ragContext,
    `<conversation_context>`,
    `Customer: ${customerName}`,
    contextText,
    `</conversation_context>`,
  ].filter(Boolean).join('\n');

  const system = input.type === 'reply_draft'
    ? buildReplyDraftPrompt(language)
    : input.type === 'summary'
      ? buildSummaryPrompt(language)
      : buildSentimentPrompt(language);

  const raw = await generateText(currentConfig.model, system, userPrompt);

  if (input.type === 'sentiment') {
    let parsed: SentimentResult;
    // Strip markdown code fences that some models wrap JSON in (e.g. ```json ... ```)
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    try {
      parsed = JSON.parse(cleaned) as SentimentResult;
    } catch {
      parsed = { label: 'neutral', confidence: 0.4, reason: cleaned };
    }
    const normalized = {
      label: (['positive', 'negative', 'neutral'].includes(parsed.label) ? parsed.label : 'neutral') as 'positive' | 'negative' | 'neutral',
      confidence: Number.isFinite(parsed.confidence) ? Math.max(0, Math.min(1, parsed.confidence)) : 0.4,
      reason: parsed.reason || cleaned,
    };
    await saveSuggestion({
      orgId: input.orgId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      type: 'sentiment',
      content: JSON.stringify(normalized),
      confidence: normalized.confidence,
    });
    return normalized;
  }

  const text = raw.trim();
  await saveSuggestion({
    orgId: input.orgId,
    conversationId: input.conversationId,
    messageId: input.messageId,
    type: input.type,
    content: text,
    confidence: 0.8,
  });
  return { content: text, confidence: 0.8 };
}
