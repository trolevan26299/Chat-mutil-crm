/**
 * zalo-pool-proxy.ts — Bridge between API container and Worker container.
 *
 * In production, the API container (WORKER_MODE=false) does NOT run ZaloPool.
 * When API needs to perform Zalo operations (send message, proxy file, etc.),
 * it forwards the request to the Worker container via internal Docker HTTP.
 *
 * Worker URL defaults to http://worker:3001 (Docker internal DNS).
 * In development (no Docker), falls back to localhost.
 */
import { zaloPool } from './zalo-pool.js';
import { logger } from '../../shared/utils/logger.js';

const WORKER_URL = process.env.WORKER_URL || 'http://worker:3001';
const IS_WORKER = process.env.WORKER_MODE === 'true';

interface SendMessageParams {
  conversationId: string;
  zaloAccountId: string;
  threadId: string;
  threadType: 'user' | 'group';
  content?: string;
  attachments?: any[];
  sticker?: { id: number; cateId: number; type: number };
  quote?: any;
  repliedByUserId?: string;
}

interface ProxySendResult {
  success: boolean;
  data?: any;
  error?: string;
  statusCode?: number;
}

/**
 * Get a Zalo API instance — either from local pool (Worker) or null (API container).
 * Use this to check if we can call ZaloPool directly.
 */
export function getLocalZaloInstance(accountId: string): any {
  return zaloPool.getInstance(accountId);
}

/**
 * Check if ZaloPool is available locally (i.e. this is the Worker container).
 */
export function isZaloPoolLocal(): boolean {
  return IS_WORKER;
}

/**
 * Forward a send-message request to the Worker container via internal HTTP.
 * Used by API container when it doesn't have ZaloPool.
 */
export async function proxySendMessage(
  params: SendMessageParams,
  authToken: string,
): Promise<ProxySendResult> {
  try {
    const url = `${WORKER_URL}/api/v1/conversations/${params.conversationId}/messages`;
    logger.info(`[proxy] Forwarding send-message to worker: ${url}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        content: params.content,
        attachments: params.attachments,
        sticker: params.sticker,
        quote: params.quote,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { success: false, error: (data as any).error || 'Worker request failed', statusCode: res.status };
    }

    return { success: true, data };
  } catch (err: any) {
    logger.error('[proxy] Failed to forward to worker:', err.message);
    return { success: false, error: `Cannot reach worker: ${err.message}`, statusCode: 502 };
  }
}

/**
 * Generic proxy for any Zalo-dependent GET request to Worker.
 */
export async function proxyGetToWorker(path: string, authToken: string): Promise<ProxySendResult> {
  try {
    const url = `${WORKER_URL}${path}`;
    logger.info(`[proxy] Forwarding GET to worker: ${url}`);

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${authToken}` },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: (data as any).error || 'Worker request failed', statusCode: res.status };
    }
    return { success: true, data };
  } catch (err: any) {
    logger.error('[proxy] Failed to forward GET to worker:', err.message);
    return { success: false, error: `Cannot reach worker: ${err.message}`, statusCode: 502 };
  }
}

/**
 * Generic proxy for any Zalo-dependent POST request to Worker.
 */
export async function proxyPostToWorker(path: string, body: any, authToken: string): Promise<ProxySendResult> {
  try {
    const url = `${WORKER_URL}${path}`;
    logger.info(`[proxy] Forwarding POST to worker: ${url}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: (data as any).error || 'Worker request failed', statusCode: res.status };
    }
    return { success: true, data };
  } catch (err: any) {
    logger.error('[proxy] Failed to forward POST to worker:', err.message);
    return { success: false, error: `Cannot reach worker: ${err.message}`, statusCode: 502 };
  }
}
