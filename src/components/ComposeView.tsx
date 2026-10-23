import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { canShare, copyText, shareText } from '../lib/clipboard';
import { CommandError, formatSendCommand, parseRecipients } from '../lib/command';
import { draftBody, type Draft } from '../lib/compose';
import { CloseIcon } from './Icons';

const TITLES: Record<Draft['kind'], string> = {
  new: 'New message',
  reply: 'Reply',
  'reply-all': 'Reply all',
  forward: 'Forward',
};

export function ComposeView({
  draft,
  inboxAddress,
  onChange,
  onHanded,
  onDiscard,
  onClose,
  onToast,
}: {
  draft: Draft;
  inboxAddress: string;
  onChange: (draft: Draft) => void;
  onHanded: (draft: Draft) => void;
  onDiscard: () => void;
  onClose: () => void;
  onToast: (message: string, tone?: 'info' | 'error') => void;
}) {
  const toRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [showCommand, setShowCommand] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsTo = draft.kind === 'forward' || draft.kind === 'new';

  useEffect(() => {
    (needsTo ? toRef.current : bodyRef.current)?.focus();
  }, [draft.id, needsTo]);

  const command = useMemo(() => {
    try {
      return {
        text: formatSendCommand({
          from: inboxAddress,
          kind: draft.kind,
          thread: draft.threadId,
          inReplyTo: draft.inReplyTo,
          to: parseRecipients(draft.to),
          cc: parseRecipients(draft.cc),
          subject: draft.subject,
          body: draftBody(draft),
        }),
        problem: null,
      };
    } catch (err) {
      return { text: null, problem: err instanceof CommandError ? err.message : 'This draft cannot be formatted yet.' };
    }
  }, [draft, inboxAddress]);

  function update(patch: Partial<Draft>) {
    setError(null);
    onChange({ ...draft, ...patch, updatedAt: new Date().toISOString() });
  }

  async function handToBot(mode: 'copy' | 'share', event?: FormEvent) {
    event?.preventDefault();
    if (!command.text) {
      setError(command.problem);
      return;
    }
    const ok =
      mode === 'share'
        ? await shareText(`Send with my bot: ${draft.subject}`, command.text)
        : await copyText(command.text);
    if (!ok) {
      setShowCommand(true);
      onToast(mode === 'share' ? 'Sharing was cancelled. Copy the block instead.' : 'Could not copy. Select the block below and copy it.', 'error');
      return;
    }
    onHanded({ ...draft, handedToBotAt: new Date().toISOString() });
    onToast(mode === 'share' ? 'Shared. Paste it in your bot chat.' : 'Copied, paste it in your bot chat');
  }

  return (
    <section className="compose" aria-label={TITLES[draft.kind]}>
      <form className="compose-card" onSubmit={(event) => void handToBot('copy', event)}>
        <header className="compose-head">
          <div>
            <h2>{TITLES[draft.kind]}</h2>
            <p className="compose-sub">
              from <span className="mono">{inboxAddress}</span>
              {draft.handedToBotAt && <span className="handed-pill">Handed to bot</span>}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close compose (draft is kept)">
            <CloseIcon />
          </button>
        </header>

        <div className="compose-fields">
          <label className="field">
            <span>To</span>
            <input
              ref={toRef}
              type="text"
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              placeholder="name@example.com, Another <other@example.com>"
              value={draft.to}
              onChange={(event) => update({ to: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Cc</span>
            <input
              type="text"
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              value={draft.cc}
              onChange={(event) => update({ cc: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Subject</span>
            <input type="text" value={draft.subject} onChange={(event) => update({ subject: event.target.value })} />
          </label>
          <textarea
            ref={bodyRef}
            className="compose-body"
            placeholder="Write your message"
            value={draft.body}
            rows={8}
            onChange={(event) => update({ body: event.target.value })}
          />
          {draft.quoted && (
            <details className="quoted-draft">
              <summary>
                <label onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={draft.includeQuote}
                    onChange={(event) => update({ includeQuote: event.target.checked })}
                  />{' '}
                  Include the {draft.kind === 'forward' ? 'forwarded message' : 'quoted original'}
                </label>
              </summary>
              <textarea
                className="compose-quote"
                aria-label="Quoted original"
                value={draft.quoted}
                rows={6}
                onChange={(event) => update({ quoted: event.target.value })}
              />
            </details>
          )}
        </div>

        {(error || (!command.text && (draft.body || draft.to))) && (
          <p className="compose-problem" role="status">
            {error ?? command.problem}
          </p>
        )}

        <footer className="compose-foot">
          <button type="submit" className="btn btn-primary">
            Send with my bot
          </button>
          {canShare() && (
            <button type="button" className="btn" onClick={() => void handToBot('share')}>
              Share
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={() => setShowCommand((v) => !v)}>
            {showCommand ? 'Hide command' : 'Show command'}
          </button>
          <span className="compose-spacer" />
          <button type="button" className="btn btn-quiet" onClick={onDiscard}>
            Discard
          </button>
        </footer>
        <p className="fine-print compose-note">
          The viewer never sends mail. Paste the block in your Grok Bot chat; the bot shows a draft card you confirm.
        </p>
        {showCommand && (
          <pre className="command-preview" tabIndex={0} aria-label="Command block">
            {command.text ?? `Fix the draft first: ${command.problem}`}
          </pre>
        )}
      </form>
    </section>
  );
}
