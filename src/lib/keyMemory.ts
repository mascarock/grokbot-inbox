/**
 * The `#k=` key stays on this device so the bare URL keeps working. Unlike
 * the `#data=` payload (which holds the mail itself and lives in
 * sessionStorage), the key alone is useless without this origin's
 * ciphertext, so localStorage is acceptable. "Forget this device" clears it.
 */
const KEY = 'grokbot-inbox-snapshot-key';

export function rememberSnapshotKey(keyB64: string): void {
  try {
    localStorage.setItem(KEY, keyB64);
  } catch {
    /* quota or private mode: the key lasts for this page load */
  }
}

export function recallSnapshotKey(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function forgetSnapshotKey(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
