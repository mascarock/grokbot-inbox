import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { canShare, copyText, shareText } from '../lib/clipboard';
import { CommandError, formatSendCommand, parseRecipients } from '../lib/command';
import { draftBody, type Draft } from '../lib/compose';
import { CloseIcon, CopyIcon, MaximizeIcon, MinimizeIcon, ShareIcon, TrashIcon } from './Icons';

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
  const [expanded, setExpanded] = useState(false);
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
      mode === 'share' ? await shareText(`Send with my bot: ${draft.subject}`, command.text) : await copyText(command.text);
    if (!ok) {
      setShowCommand(true);
      onToast(
        mode === 'share' ? 'Sharing was cancelled. Copy the block instead.' : 'Could not copy. Select the block below and copy it.',
        'error',
      );
      return;
    }
    onHanded({ ...draft, handedToBotAt: new Date().toISOString() });
    onToast(mode === 'share' ? 'Shared. Paste it in your bot chat.' : 'Copied, paste it in your bot chat');
  }

  const problem = error ?? (!command.text && (draft.body || draft.to) ? command.problem : null);

  return (
    <section className={expanded ? 'compose is-expanded' : 'compose'} aria-label={TITLES[draft.kind]}>
      <form className="compose-card" onSubmit={(event) => void handToBot('copy', event)}>
        <header className="compose-head">
          <div className="compose-title">
            <h2>{TITLES[draft.kind]}</h2>
            {draft.handedToBotAt && <span className="handed-pill">Handed to bot</span>}
          </div>
          <div className="compose-head-tools">
            <button
              type="button"
              className="icon-btn is-small"
              onClick={() => setExpanded((v) => !v)}
              aria-pressed={expanded}
              aria-label={expanded ? 'Shrink compose' : 'Expand compose'}
              title={expanded ? 'Shrink' : 'Expand'}
            >
              {expanded ? <MinimizeIcon /> : <MaximizeIcon />}
            </button>
            <button type="button" className="icon-btn is-small" onClick={onClose} aria-label="Close compose (draft is kept)" title="Close (Esc)">
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="compose-fields">
          <div className="field is-static">
            <span>From</span>
            <span className="mono field-static">{inboxAddress}</span>
          </div>
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
            <input type="text" inputMode="email" autoComplete="off" spellCheck={false} value={draft.cc} onChange={(event) => update({ cc: event.target.value })} />
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
            rows={expanded ? 16 : 8}
            onChange={(event) => update({ body: event.target.value })}
          />
          {draft.quoted && (
            <details className="quoted-draft">
              <summary>
                <label onClick={(event) => event.stopPropagation()}>
                  <input type="checkbox" checked={draft.includeQuote} onChange={(event) => update({ includeQuote: event.target.checked })} />{' '}
                  Include the {draft.kind === 'forward' ? 'forwarded message' : 'quoted original'}
                </label>
              </summary>
              <textarea className="compose-quote" aria-label="Quoted original" value={draft.quoted} rows={6} onChange={(event) => update({ quoted: event.target.value })} />
            </details>
          )}
        </div>

        {problem && (
          <p className="compose-problem" role="status">
            {problem}
          </p>
        )}

        {showCommand && (
          <pre className="command-preview mono" tabIndex={0} aria-label="Command block">
            {command.text ?? `Fix the draft first: ${command.problem}`}
          </pre>
        )}

        <footer className="compose-foot">
          <button type="submit" className="btn btn-primary">
            <CopyIcon />
            Send with my bot
          </button>
          {canShare() && (
            <button type="button" className="btn" onClick={() => void handToBot('share')}>
              <ShareIcon />
              Share
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={() => setShowCommand((v) => !v)} aria-pressed={showCommand}>
            {showCommand ? 'Hide command' : 'Show command'}
          </button>
          <span className="compose-spacer" />
          <button type="button" className="icon-btn is-small" onClick={onDiscard} aria-label="Discard draft" title="Discard draft">
            <TrashIcon />
          </button>
        </footer>
        <p className="compose-note">The viewer never sends mail. Paste the block in your Grok Bot chat; the bot shows a draft card you confirm.</p>
      </form>
    </section>
  );
}
