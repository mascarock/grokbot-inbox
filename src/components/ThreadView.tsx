import { useState } from 'react';
import { participantSummary } from '../lib/addresses';
import type { ComposeKind } from '../lib/command';
import type { Draft } from '../lib/compose';
import { countLabel } from '../lib/filterThreads';
import type { Message, Thread } from '../types/inbox';
import { ArchiveIcon, ReplyIcon, StarIcon } from './Icons';
import { LabelEditor } from './LabelEditor';
import { CollapsedMessage, MessageCard } from './MessageCard';

export function ThreadView({
  thread,
  inboxAddress,
  theme,
  remoteImages,
  inlineOpen,
  starred,
  archived,
  labels,
  labelSuggestions,
  draft,
  onToggleRemote,
  onToggleInline,
  onBack,
  onCompose,
  onResumeDraft,
  onToggleStar,
  onToggleArchive,
  onMarkUnread,
  onAddLabel,
  onRemoveLabel,
}: {
  thread: Thread;
  inboxAddress: string;
  theme: 'light' | 'dark';
  remoteImages: Record<string, boolean>;
  inlineOpen: Record<string, boolean>;
  starred: boolean;
  archived: boolean;
  labels: string[];
  labelSuggestions: string[];
  draft: Draft | undefined;
  onToggleRemote: (id: string) => void;
  onToggleInline: (id: string) => void;
  onBack: () => void;
  onCompose: (kind: ComposeKind, message: Message) => void;
  onResumeDraft: () => void;
  onToggleStar: () => void;
  onToggleArchive: () => void;
  onMarkUnread: () => void;
  onAddLabel: (label: string) => void;
  onRemoveLabel: (label: string) => void;
}) {
  const latest = thread.messages[thread.messages.length - 1];
  const lastId = latest?.id ?? '';
  const [openFor, setOpenFor] = useState(thread.id);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  if (openFor !== thread.id) {
    setOpenFor(thread.id);
    setOpened({});
  }

  const count = countLabel(thread);
  const countText = count.includes('/') ? `${count} messages in this export` : `${count} ${count === '1' ? 'message' : 'messages'}`;

  return (
    <div className="thread-view">
      <header className="read-head">
        <button type="button" className="back-btn" onClick={onBack}>
          ‹ Threads
        </button>
        <div className="read-title">
          <h1>{thread.subject}</h1>
          <div className="read-tools" role="toolbar" aria-label="Thread actions">
            <button
              type="button"
              className={starred ? 'icon-btn is-on' : 'icon-btn'}
              onClick={onToggleStar}
              aria-pressed={starred}
              aria-label={starred ? 'Unstar thread' : 'Star thread'}
              title={`${starred ? 'Unstar' : 'Star'} (s)`}
            >
              <StarIcon filled={starred} />
            </button>
            <button
              type="button"
              className={archived ? 'icon-btn is-on' : 'icon-btn'}
              onClick={onToggleArchive}
              aria-pressed={archived}
              aria-label={archived ? 'Move back to inbox' : 'Archive thread'}
              title={`${archived ? 'Unarchive' : 'Archive'} (e)`}
            >
              <ArchiveIcon />
            </button>
            <button type="button" className="btn btn-small" onClick={onMarkUnread} title="Mark unread (u)">
              Mark unread
            </button>
          </div>
        </div>
        <p className="read-sub">
          {participantSummary(thread.participants)} · {countText}
          {archived && <span className="state-pill">Archived</span>}
        </p>
        <LabelEditor labels={labels} suggestions={labelSuggestions} onAdd={onAddLabel} onRemove={onRemoveLabel} />
        {latest && (
          <div className="reply-bar">
            <button type="button" className="btn btn-primary" onClick={() => onCompose('reply', latest)} title="Reply (r)">
              <ReplyIcon /> Reply
            </button>
            <button type="button" className="btn" onClick={() => onCompose('reply-all', latest)} title="Reply all (a)">
              Reply all
            </button>
            <button type="button" className="btn" onClick={() => onCompose('forward', latest)} title="Forward (f)">
              Forward
            </button>
            {draft && (
              <button type="button" className="btn btn-quiet draft-resume" onClick={onResumeDraft}>
                {draft.handedToBotAt ? 'Draft handed to bot' : 'Resume draft'}
              </button>
            )}
          </div>
        )}
      </header>
      <div className="message-scroll">
        {thread.messages.length === 0 && <p className="read-empty">This thread has no messages in the export.</p>}
        {thread.messages.map((message) => {
          const showBody = thread.messages.length <= 1 || opened[message.id] || message.id === lastId;
          if (!showBody) {
            return (
              <CollapsedMessage
                key={message.id}
                message={message}
                onOpen={() => setOpened((current) => ({ ...current, [message.id]: true }))}
              />
            );
          }
          return (
            <MessageCard
              key={message.id}
              message={message}
              inboxAddress={inboxAddress}
              theme={theme}
              threadSubject={thread.subject}
              remoteImages={Boolean(remoteImages[message.id])}
              inlineOpen={Boolean(inlineOpen[message.id])}
              onToggleRemote={() => onToggleRemote(message.id)}
              onToggleInline={() => onToggleInline(message.id)}
              onCompose={(kind) => onCompose(kind, message)}
            />
          );
        })}
      </div>
    </div>
  );
}
