/**
 * A link-loaded inbox is kept for this tab only, so a reload does not lose
 * it after the fragment has been stripped. "Forget" clears it.
 */
const KEY = 'grokbot-inbox-link-payload';

export function rememberLinkPayload(payload: string): void {
  try {
    sessionStorage.setItem(KEY, payload);
  } catch {
    /* quota or private mode: the inbox still works until the tab closes */
  }
}

export function recallLinkPayload(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function forgetLinkPayload(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
