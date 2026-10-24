import { deriveOutboxToken, encryptOutboxItem } from './crypto';
import { deliver, isConfigured, type DeliveryResult, type WebhookPayload, type WebhookSettings } from './webhook';

/**
 * The encrypted outbox: `/api/outbox` on the viewer's own origin, backed by
 * the owner's Vercel Blob store. The viewer encrypts each payload with the
 * snapshot key (AES-256-GCM, additional data OUTBOX_AAD) and authenticates
 * with a token derived from that key, so the function stores ciphertext it
 * cannot read for a bot that picks it up every ~15 minutes. docs/RELAY.md §6.
 */
export const OUTBOX_PATH = '/api/outbox';
export const OUTBOX_PICKUP_HINT = 'within ~15 min';

export interface OutboxResult {
  ok: boolean;
  id?: string;
  status?: number;
  error?: string;
}

/** HEAD probe: 204 means the bot finished Part G on this project. */
export async function probeOutbox(fetchFn: typeof fetch = fetch, origin = ''): Promise<boolean> {
  try {
    const res = await fetchFn(`${origin}${OUTBOX_PATH}`, { method: 'HEAD', cache: 'no-store' });
    return res.status === 204;
  } catch {
    return false;
  }
}

export function describeOutboxStatus(status: number, detail = ''): string {
  switch (status) {
    case 404:
      return 'This copy of the viewer has no /api/outbox yet (older deployment).';
    case 503:
      return 'Your bot has not set up the outbox on this project yet.';
    case 401:
      return 'The outbox did not accept this device\'s key. Ask your bot for a fresh link.';
    case 429:
      return 'Too many items in a minute. Wait a moment and try again.';
    case 413:
      return 'This message is too large for the outbox (256 KB).';
    default:
      return detail || `The outbox answered ${status}.`;
  }
}

export async function postToOutbox(payload: WebhookPayload, keyB64: string, fetchFn: typeof fetch = fetch, origin = ''): Promise<OutboxResult> {
  let body: string;
  let token: string;
  try {
    token = await deriveOutboxToken(keyB64);
    body = JSON.stringify(await encryptOutboxItem(JSON.stringify(payload), keyB64));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not encrypt the item.' };
  }
  try {
    const res = await fetchFn(`${origin}${OUTBOX_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body,
    });
    let data: { id?: string; error?: string } = {};
    try {
      data = (await res.json()) as { id?: string; error?: string };
    } catch {
      /* no json body */
    }
    if (res.status === 201 && typeof data.id === 'string') return { ok: true, id: data.id, status: res.status };
    return { ok: false, status: res.status, error: describeOutboxStatus(res.status, data.error) };
  } catch {
    return { ok: false, error: 'Could not reach the outbox.' };
  }
}

export type DeliveryTarget = 'webhook' | 'outbox' | 'copy';

export interface DeliveryOptions {
  webhook: WebhookSettings;
  /** Snapshot key on this device; null when the inbox did not come from a snapshot. */
  outboxKey: string | null;
  /** The probe or the snapshot meta said `/api/outbox` is configured. */
  outboxReady: boolean;
}

export interface DeliveryOutcome {
  ok: boolean;
  via: DeliveryTarget;
  /** Outbox item id, when it went through the outbox. */
  id?: string;
  status?: number;
  error?: string;
  /** Set when the webhook failed and the outbox took the item instead. */
  webhookError?: string;
}

/** Which button the compose window should show. */
export function chooseDelivery(options: DeliveryOptions): DeliveryTarget {
  if (isConfigured(options.webhook)) return 'webhook';
  if (options.outboxReady && options.outboxKey) return 'outbox';
  return 'copy';
}

/**
 * Webhook first when the owner configured one (instant), then the outbox
 * (picked up on the bot's schedule), otherwise nothing: the caller falls
 * back to copying the command block.
 */
export async function deliverPayload(
  payload: WebhookPayload,
  options: DeliveryOptions,
  fetchFn: typeof fetch = fetch,
  origin = '',
): Promise<DeliveryOutcome> {
  let webhookError: string | undefined;
  if (isConfigured(options.webhook)) {
    const result: DeliveryResult = await deliver(payload, options.webhook, fetchFn, origin);
    if (result.ok) return { ok: true, via: 'webhook', status: result.status };
    webhookError = result.error ?? 'The bot could not be reached.';
    if (!(options.outboxReady && options.outboxKey)) return { ok: false, via: 'webhook', status: result.status, error: webhookError };
  }
  if (options.outboxReady && options.outboxKey) {
    const result = await postToOutbox(payload, options.outboxKey, fetchFn, origin);
    if (result.ok) return { ok: true, via: 'outbox', id: result.id, status: result.status, webhookError };
    return { ok: false, via: 'outbox', status: result.status, error: result.error, webhookError };
  }
  return { ok: false, via: 'copy', error: 'No way to reach your bot from here.' };
}

/** One item this device left in the outbox and has not yet seen acknowledged. */
export interface QueuedItem {
  id: string;
  type: WebhookPayload['type'];
  summary: string;
  queuedAt: string;
}

const QUEUE_PREFIX = 'grokbot-inbox-outbox:';
const QUEUE_MAX = 50;

export function summarizePayload(payload: WebhookPayload): string {
  switch (payload.type) {
    case 'inbox-send': {
      const kind = payload.kind === 'reply-all' ? 'Reply all' : payload.kind === 'reply' ? 'Reply' : payload.kind === 'forward' ? 'Forward' : 'New message';
      return `${kind}: ${payload.subject || '(no subject)'}`;
    }
    case 'inbox-refresh':
      return 'Refresh request';
    case 'inbox-action':
      return `${payload.action[0].toUpperCase()}${payload.action.slice(1)} thread`;
  }
}

export function loadQueue(inbox: string): QueuedItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_PREFIX + inbox);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is QueuedItem =>
        Boolean(item) && typeof item === 'object' && typeof (item as QueuedItem).id === 'string' && typeof (item as QueuedItem).summary === 'string',
    );
  } catch {
    return [];
  }
}

export function saveQueue(inbox: string, queue: QueuedItem[]): void {
  try {
    if (queue.length === 0) localStorage.removeItem(QUEUE_PREFIX + inbox);
    else localStorage.setItem(QUEUE_PREFIX + inbox, JSON.stringify(queue.slice(-QUEUE_MAX)));
  } catch {
    /* quota or private mode */
  }
}

export function enqueue(queue: QueuedItem[], payload: WebhookPayload, id: string, now = new Date()): QueuedItem[] {
  if (queue.some((item) => item.id === id)) return queue;
  return [...queue, { id, type: payload.type, summary: summarizePayload(payload), queuedAt: now.toISOString() }].slice(-QUEUE_MAX);
}

/** Drops items the bot reported as handled in `inbox.meta.json`'s `outboxAcked`. */
export function reconcileQueue(queue: QueuedItem[], acked: readonly string[]): { queue: QueuedItem[]; handled: QueuedItem[] } {
  if (acked.length === 0 || queue.length === 0) return { queue, handled: [] };
  const set = new Set(acked);
  const handled = queue.filter((item) => set.has(item.id));
  if (handled.length === 0) return { queue, handled };
  return { queue: queue.filter((item) => !set.has(item.id)), handled };
}
