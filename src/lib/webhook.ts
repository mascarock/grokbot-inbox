import { formatRecipients, type Recipient, type SendCommand } from './command';
import type { RelayPrefill } from '../types/inbox';

/**
 * Webhook settings for "Send with my bot". Everything lives in this
 * browser's localStorage; the snapshot may prefill the URL and header shape
 * but never the key. docs/RELAY.md and docs/COMMANDS.md describe the wire
 * format.
 */
export interface WebhookSettings {
  url: string;
  key: string;
  /** Header name that carries the key. */
  header: string;
  /** Text placed in front of the key inside the header. */
  prefix: string;
  /** Prefer the same-origin relay instead of trying the webhook directly. */
  viaRelay: boolean;
}

export const DEFAULT_KEY_HEADER = 'Authorization';
export const DEFAULT_KEY_PREFIX = 'Bearer ';
export const RELAY_PATH = '/api/relay';
export const PAYLOAD_VERSION = 1;

const STORAGE_KEY = 'grokbot-inbox-webhook';

export const EMPTY_SETTINGS: WebhookSettings = {
  url: '',
  key: '',
  header: DEFAULT_KEY_HEADER,
  prefix: DEFAULT_KEY_PREFIX,
  viaRelay: false,
};

export function loadWebhookSettings(): WebhookSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<WebhookSettings>;
    return {
      url: typeof parsed.url === 'string' ? parsed.url : '',
      key: typeof parsed.key === 'string' ? parsed.key : '',
      header: typeof parsed.header === 'string' && parsed.header.trim() ? parsed.header.trim() : DEFAULT_KEY_HEADER,
      prefix: typeof parsed.prefix === 'string' ? parsed.prefix : DEFAULT_KEY_PREFIX,
      viaRelay: parsed.viaRelay === true,
    };
  } catch {
    return { ...EMPTY_SETTINGS };
  }
}

export function saveWebhookSettings(settings: WebhookSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* quota or private mode: settings last until the tab closes */
  }
}

export function clearWebhookSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Fills blanks from the snapshot's `relay` block. Values the user typed
 * win; a prefilled URL replaces one that itself came from an earlier
 * prefill, which is how the bot can rotate its webhook URL.
 */
export function applyPrefill(current: WebhookSettings, prefill: RelayPrefill | undefined): WebhookSettings {
  if (!prefill) return current;
  const next = { ...current };
  if (prefill.webhookUrl && (!current.url || isPrefilledUrl(current.url))) {
    next.url = prefill.webhookUrl;
    rememberPrefilledUrl(prefill.webhookUrl);
  }
  if (prefill.keyHeader && current.header === DEFAULT_KEY_HEADER) next.header = prefill.keyHeader;
  if (prefill.keyPrefix !== undefined && current.prefix === DEFAULT_KEY_PREFIX) next.prefix = prefill.keyPrefix;
  return next;
}

const PREFILL_URL_KEY = 'grokbot-inbox-webhook-prefilled-url';

function isPrefilledUrl(url: string): boolean {
  try {
    return localStorage.getItem(PREFILL_URL_KEY) === url;
  } catch {
    return false;
  }
}

function rememberPrefilledUrl(url: string): void {
  try {
    localStorage.setItem(PREFILL_URL_KEY, url);
  } catch {
    /* ignore */
  }
}

export function isConfigured(settings: WebhookSettings): boolean {
  return Boolean(settings.url.trim() && settings.key.trim() && isHttpsUrl(settings.url));
}

export function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

export interface RecipientJson {
  name?: string;
  address: string;
}

export interface SendPayload {
  type: 'inbox-send';
  v: 1;
  from: string;
  kind: SendCommand['kind'];
  threadId?: string;
  inReplyTo?: string;
  to: RecipientJson[];
  cc: RecipientJson[];
  subject: string;
  body: string;
  /** The same message as the paste-able command, so a bot can reuse Part C's parser. */
  command: string;
  sentAt: string;
}

export interface RefreshPayload {
  type: 'inbox-refresh';
  v: 1;
  inbox: string;
  sentAt: string;
}

export interface ActionPayload {
  type: 'inbox-action';
  v: 1;
  inbox: string;
  action: 'archive' | 'unarchive' | 'star' | 'unstar' | 'read' | 'unread';
  threadId: string;
  sentAt: string;
}

export type WebhookPayload = SendPayload | RefreshPayload | ActionPayload;

function toJsonRecipients(recipients: Recipient[]): RecipientJson[] {
  return recipients.map((r) => (r.name ? { name: r.name, address: r.address } : { address: r.address }));
}

export function buildSendPayload(command: Omit<SendCommand, 'version'>, commandText: string, now = new Date()): SendPayload {
  const payload: SendPayload = {
    type: 'inbox-send',
    v: PAYLOAD_VERSION,
    from: command.from,
    kind: command.kind ?? 'new',
    to: toJsonRecipients(command.to),
    cc: toJsonRecipients(command.cc),
    subject: command.subject,
    body: command.body,
    command: commandText,
    sentAt: now.toISOString(),
  };
  if (command.thread) payload.threadId = command.thread;
  if (command.inReplyTo) payload.inReplyTo = command.inReplyTo;
  return payload;
}

export function buildRefreshPayload(inbox: string, now = new Date()): RefreshPayload {
  return { type: 'inbox-refresh', v: PAYLOAD_VERSION, inbox, sentAt: now.toISOString() };
}

export function buildActionPayload(inbox: string, action: ActionPayload['action'], threadId: string, now = new Date()): ActionPayload {
  return { type: 'inbox-action', v: PAYLOAD_VERSION, inbox, action, threadId, sentAt: now.toISOString() };
}

/** Human-readable recipients for toasts and logs. */
export function describeRecipients(recipients: Recipient[]): string {
  return formatRecipients(recipients);
}

export function authHeaderValue(settings: WebhookSettings): string {
  return `${settings.prefix}${settings.key.trim()}`;
}

export type DeliveryRoute = 'direct' | 'relay';

export interface DeliveryResult {
  ok: boolean;
  route: DeliveryRoute;
  status?: number;
  error?: string;
}

/**
 * POSTs the payload to the bot. Tries the webhook directly first; if the
 * browser cannot reach it (CORS, network) or the user asked for the relay,
 * posts to the same-origin `/api/relay`, which forwards server to server.
 */
export async function deliver(
  payload: WebhookPayload,
  settings: WebhookSettings,
  fetchFn: typeof fetch = fetch,
  relayOrigin = '',
): Promise<DeliveryResult> {
  if (!isConfigured(settings)) return { ok: false, route: 'direct', error: 'No webhook configured.' };
  const body = JSON.stringify(payload);
  const auth = authHeaderValue(settings);

  if (!settings.viaRelay) {
    try {
      const res = await fetchFn(settings.url, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json', [settings.header]: auth },
        body,
      });
      if (res.ok) return { ok: true, route: 'direct', status: res.status };
      // A definite answer from the webhook: do not retry through the relay.
      if (res.status === 401 || res.status === 403) return { ok: false, route: 'direct', status: res.status, error: 'The bot rejected the key.' };
      if (res.status >= 400 && res.status < 500) return { ok: false, route: 'direct', status: res.status, error: `The bot answered ${res.status}.` };
    } catch {
      /* CORS or network: fall through to the relay */
    }
  }

  try {
    const res = await fetchFn(`${relayOrigin}${RELAY_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Target': settings.url,
        'X-Relay-Header': settings.header,
        'X-Relay-Auth': auth,
      },
      body,
    });
    if (res.ok) return { ok: true, route: 'relay', status: res.status };
    let detail = '';
    try {
      const data = (await res.json()) as { error?: string };
      detail = data.error ?? '';
    } catch {
      /* no json body */
    }
    if (res.status === 404) return { ok: false, route: 'relay', status: 404, error: 'This copy of the viewer has no /api/relay (older deployment).' };
    return { ok: false, route: 'relay', status: res.status, error: detail || `Relay answered ${res.status}.` };
  } catch {
    return { ok: false, route: 'relay', error: 'Could not reach the bot or the relay.' };
  }
}
