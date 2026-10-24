import { useEffect, useRef, useState } from 'react';
import { isAllowedRelayTarget } from '../lib/relayAllowlist';
import { DEFAULT_KEY_HEADER, DEFAULT_KEY_PREFIX, isHttpsUrl, type WebhookSettings } from '../lib/webhook';
import type { SnapshotStatus } from '../hooks/useInboxSession';
import { formatExportTime, formatRelativeTime } from '../lib/dates';
import { OUTBOX_PICKUP_HINT, type QueuedItem } from '../lib/outbox';
import { CloseIcon } from './Icons';

export function SettingsModal({
  settings,
  snapshot,
  outboxReady = false,
  queue = [],
  prefilledUrl,
  onSave,
  onClear,
  onClearQueue,
  onForgetDevice,
  onClose,
}: {
  settings: WebhookSettings;
  snapshot: SnapshotStatus | null;
  /** The encrypted outbox on this origin is set up, so replies reach the bot without a webhook. */
  outboxReady?: boolean;
  /** Drafts this device left in the outbox that no snapshot has acknowledged yet. */
  queue?: QueuedItem[];
  prefilledUrl?: string;
  onSave: (settings: WebhookSettings) => void;
  onClear: () => void;
  onClearQueue?: () => void;
  onForgetDevice?: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<WebhookSettings>(settings);
  const [showKey, setShowKey] = useState(false);
  useEffect(() => closeRef.current?.focus(), []);

  const url = draft.url.trim();
  const urlProblem = url && !isHttpsUrl(url) ? 'The webhook URL must start with https://' : null;
  const relayWarning = url && !urlProblem && !isAllowedRelayTarget(url) ? 'This host is outside the relay allowlist, so only direct posting can work.' : null;
  const canSave = !urlProblem;

  function set<K extends keyof WebhookSettings>(key: K, value: WebhookSettings[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  return (
    <div className="modal-layer" onMouseDown={onClose}>
      <form
        className="modal-card settings-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSave) return;
          onSave({ ...draft, url, key: draft.key.trim(), header: draft.header.trim() || DEFAULT_KEY_HEADER });
          onClose();
        }}
      >
        <header className="modal-head">
          <h2 id="settings-title">Settings</h2>
          <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>

        {(outboxReady || queue.length > 0) && (
          <section className="settings-section">
            <h3>Waiting for your bot</h3>
            <p className="settings-help">
              {outboxReady
                ? `Replies go to an encrypted outbox on this site. Your bot picks them up ${OUTBOX_PICKUP_HINT} and shows you a draft card to confirm; nothing is sent until you do.`
                : 'Drafts you queued earlier. They disappear once a new snapshot shows your bot took them.'}
            </p>
            {queue.length > 0 ? (
              <ul className="queue-list">
                {queue.map((item) => (
                  <li key={item.id}>
                    <span className="queue-summary">{item.summary}</span>
                    <span className="queue-when">{formatRelativeTime(item.queuedAt) || 'just now'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="settings-help">Nothing waiting right now.</p>
            )}
            {queue.length > 0 && onClearQueue && (
              <button type="button" className="btn btn-small" onClick={onClearQueue}>
                Clear this list
              </button>
            )}
          </section>
        )}

        <section className="settings-section">
          <h3>{outboxReady ? 'Webhook (optional, instant)' : 'Send with my bot'}</h3>
          <p className="settings-help">
            {outboxReady
              ? 'Only if you want replies to reach your bot right away instead of on its schedule: paste the webhook URL and sender key from a webhook routine. If the webhook fails, the outbox takes over.'
              : 'Paste the webhook URL and sender key from your Grok Bot routine. They stay in this browser only. The bot shows a draft card you confirm before anything is sent.'}
          </p>
          <label className="settings-field">
            <span>Webhook URL</span>
            <input
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://…/routines/…/webhook"
              value={draft.url}
              onChange={(event) => set('url', event.target.value)}
            />
            {prefilledUrl && draft.url === prefilledUrl && <small>Prefilled by your bot's latest snapshot.</small>}
            {urlProblem && <small className="is-problem">{urlProblem}</small>}
            {relayWarning && <small className="is-problem">{relayWarning}</small>}
          </label>
          <label className="settings-field">
            <span>Sender key</span>
            <span className="settings-inline">
              <input
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                placeholder="paste the key from the routine panel"
                value={draft.key}
                onChange={(event) => set('key', event.target.value)}
              />
              <button type="button" className="btn btn-small btn-quiet" onClick={() => setShowKey((v) => !v)} aria-pressed={showKey}>
                {showKey ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>
          <details className="settings-advanced" open={draft.header !== DEFAULT_KEY_HEADER || draft.prefix !== DEFAULT_KEY_PREFIX || draft.viaRelay}>
            <summary>Advanced</summary>
            <label className="settings-field">
              <span>Key header</span>
              <input type="text" autoComplete="off" spellCheck={false} value={draft.header} onChange={(event) => set('header', event.target.value)} />
              <small>
                Sent as <code className="mono">{draft.header || DEFAULT_KEY_HEADER}: {draft.prefix}&lt;key&gt;</code>
              </small>
            </label>
            <label className="settings-field">
              <span>Key prefix</span>
              <input type="text" autoComplete="off" spellCheck={false} value={draft.prefix} onChange={(event) => set('prefix', event.target.value)} />
              <small>Clear this if the routine wants the bare key, for example in an X-Api-Key header.</small>
            </label>
            <label className="settings-check">
              <input type="checkbox" checked={draft.viaRelay} onChange={(event) => set('viaRelay', event.target.checked)} />
              <span>
                Always post through this site's <code className="mono">/api/relay</code> (skip the direct attempt)
              </span>
            </label>
          </details>
        </section>

        {snapshot && (
          <section className="settings-section">
            <h3>This device</h3>
            <p className="settings-help">
              Encrypted snapshot published {formatExportTime(snapshot.updatedAt) || 'at an unknown time'}. The key from your link is kept
              on this device so the bare URL keeps opening the inbox.
            </p>
            {onForgetDevice && (
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  onForgetDevice();
                  onClose();
                }}
              >
                Forget this device
              </button>
            )}
          </section>
        )}

        <footer className="settings-foot">
          <button type="submit" className="btn btn-primary" disabled={!canSave}>
            Save
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              onClear();
              setDraft({ url: '', key: '', header: DEFAULT_KEY_HEADER, prefix: DEFAULT_KEY_PREFIX, viaRelay: false });
            }}
          >
            Clear webhook
          </button>
        </footer>
      </form>
    </div>
  );
}
