/**
 * Hosts `/api/relay` is willing to forward to. Shared by the Vercel function
 * (api/relay.js copies this list; keep them in sync, api/relay.test.ts checks)
 * and by the viewer, which warns before saving a webhook URL that the relay
 * would refuse.
 *
 * Grok Bot routine webhooks are served from x.ai / grok.com; Cursor's
 * automations webhooks live on cursor.com. Add a suffix here, redeploy, done.
 */
export const RELAY_ALLOWED_HOST_SUFFIXES: readonly string[] = [
  'x.ai',
  'grok.com',
  'cursor.com',
  'cursor.sh',
];

export function isAllowedRelayTarget(url: string, suffixes: readonly string[] = RELAY_ALLOWED_HOST_SUFFIXES): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase();
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
