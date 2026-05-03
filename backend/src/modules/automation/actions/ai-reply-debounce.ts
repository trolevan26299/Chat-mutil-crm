/**
 * ai-reply-debounce.ts
 * Debounces AI auto-replies so the bot waits for the customer to finish
 * typing before responding. Each new incoming message resets the timer.
 *
 * Strategy:
 *   - When a message arrives, schedule the AI reply after DEBOUNCE_MS.
 *   - If another message arrives before the timer fires, cancel the old timer
 *     and start a fresh one.
 *   - This means the bot will only reply after the customer has been silent
 *     for DEBOUNCE_MS milliseconds (default: 60 seconds).
 */

import { logger } from '../../../shared/utils/logger.js';
import { aiReplyAction } from './ai-reply-action.js';

/** How long to wait after the last message before replying (ms). */
const DEBOUNCE_MS = 45_000; // 45 seconds

type AiReplyInput = Parameters<typeof aiReplyAction>[0];

/** Map of conversationId → pending timer handle */
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Schedules an AI auto-reply for the given conversation, debounced by
 * DEBOUNCE_MS. Calling this again before the timer fires will reset the
 * countdown — ensuring the bot only replies after the customer is done typing.
 */
export function scheduleAiReply(input: AiReplyInput): void {
  const { conversationId } = input;

  // Cancel any previously scheduled reply for this conversation
  const existing = pendingTimers.get(conversationId);
  if (existing) {
    clearTimeout(existing);
    logger.debug(`[ai-debounce] Reset timer for conversation ${conversationId}`);
  }

  // Schedule a new reply after DEBOUNCE_MS silence
  const timer = setTimeout(async () => {
    pendingTimers.delete(conversationId);
    logger.info(`[ai-debounce] Firing AI reply for conversation ${conversationId} after ${DEBOUNCE_MS / 1000}s silence`);
    try {
      await aiReplyAction(input);
    } catch (err) {
      logger.error(`[ai-debounce] AI reply failed for conversation ${conversationId}:`, err);
    }
  }, DEBOUNCE_MS);

  pendingTimers.set(conversationId, timer);
  logger.debug(`[ai-debounce] Scheduled AI reply for conversation ${conversationId} in ${DEBOUNCE_MS / 1000}s`);
}

/**
 * Cancels any pending AI reply for a conversation (e.g. staff replied manually).
 */
export function cancelAiReply(conversationId: string): void {
  const existing = pendingTimers.get(conversationId);
  if (existing) {
    clearTimeout(existing);
    pendingTimers.delete(conversationId);
    logger.debug(`[ai-debounce] Cancelled pending AI reply for conversation ${conversationId}`);
  }
}
