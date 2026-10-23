import { useEffect, type KeyboardEvent } from 'react';
import { participantSummary, summaryParticipants, threadCounterpart } from '../lib/addresses';
import { threadHasFileAttachment } from '../lib/attachments';
import { formatThreadTime } from '../lib/dates';
import { FOLDERS, countLabel, messageSnippet, type DirectionFilter, type ThreadFilters } from '../lib/filterThreads';
import { draftForThread, isStarred, isUnread, threadLabels, type LocalInboxState } from '../lib/localInboxState';
import type { Thread } from '../types/inbox';
import { Avatar } from './Avatar';
import { PaperclipIcon, StarIcon } from './Icons';

const DIRECTIONS: { id: DirectionFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'received', label: 'Received' },
  { id: 'sent', label: 'Sent' },
];

export function ThreadList({
  threads,
  total,
  inboxAddress,
  selectedId,
  filters,
  tags,
  labels,
  state,
  unreadCount,
  onFilters,
  onSelect,
  onOpen,
  onToggleStar,
  exportedLabel,
  origin,
  note,
  lite,
}: {
  threads: Thread[];
  total: number;
  inboxAddress: string;
  selectedId: string | null;
  filters: ThreadFilters;
  tags: string[];
  labels: string[];
  state: LocalInboxState;
  unreadCount: number;
  onFilters: (filters: ThreadFilters) => void;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onToggleStar: (id: string) => void;
  exportedLabel: string;
  origin: string | null;
  note: string | null;
  lite: boolean;
}) {
  useEffect(() => {
    if (!selectedId) return;
    document.getElementById(`thread-${selectedId}`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = threads.findIndex((thread) => thread.id === selectedId);
    const nextIndex = event.key === 'ArrowDown' ? Math.min(threads.length - 1, index + 1) : Math.max(0, index - 1);
    const next = threads[nextIndex];
    if (!next) return;
    onSelect(next.id);
    document.getElementById(`thread-${next.id}`)?.focus();
  }

  const countText = threads.length === total ? `${total} ${total === 1 ? 'thread' : 'threads'}` : `${threads.length} of ${total}`;

  return (
    <section className="pane list-pane" aria-label="Threads">
      <div className="list-head">
        <nav className="folders" aria-label="Folders">
          {FOLDERS.map((folder) => (
            <button
              key={folder.id}
              type="button"
              className={filters.folder === folder.id ? 'folder is-on' : 'folder'}
              aria-current={filters.folder === folder.id ? 'page' : undefined}
              onClick={() => onFilters({ ...filters, folder: folder.id })}
            >
              {folder.label}
              {folder.id === 'inbox' && unreadCount > 0 && <span className="folder-count">{unreadCount}</span>}
            </button>
          ))}
        </nav>
        <div className="segment" role="radiogroup" aria-label="Direction">
          {DIRECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={filters.direction === item.id}
              className={filters.direction === item.id ? 'is-on' : undefined}
              onClick={() => onFilters({ ...filters, direction: item.id })}
            >
              {item.label}
            </button>
          ))}
        </div>
        {tags.length > 0 && (
          <div className="tag-row" role="toolbar" aria-label="Plus-tag filter">
            <button
              type="button"
              className={filters.tag == null ? 'chip is-on' : 'chip'}
              aria-pressed={filters.tag == null}
              onClick={() => onFilters({ ...filters, tag: null })}
            >
              All tags
            </button>
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={filters.tag === tag ? 'chip is-on' : 'chip'}
                aria-pressed={filters.tag === tag}
                onClick={() => onFilters({ ...filters, tag })}
              >
                +{tag}
              </button>
            ))}
          </div>
        )}
        {labels.length > 0 && (
          <div className="tag-row" role="toolbar" aria-label="Label filter">
            <button
              type="button"
              className={filters.label == null ? 'chip is-on' : 'chip'}
              aria-pressed={filters.label == null}
              onClick={() => onFilters({ ...filters, label: null })}
            >
              All labels
            </button>
            {labels.map((label) => (
              <button
                key={label}
                type="button"
                className={filters.label === label ? 'chip chip-label is-on' : 'chip chip-label'}
                aria-pressed={filters.label === label}
                onClick={() => onFilters({ ...filters, label })}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <p className="list-count" aria-live="polite">
          {countText}
        </p>
      </div>
      <div className="thread-scroll" onKeyDown={onKeyDown}>
        {threads.length === 0 ? (
          <p className="read-empty">No threads match.</p>
        ) : (
          <div>
            {threads.map((thread) => {
              const active = thread.id === selectedId;
              const latest = thread.messages[thread.messages.length - 1];
              const who = threadCounterpart(thread, inboxAddress);
              const unread = isUnread(thread, state, inboxAddress);
              const starred = isStarred(thread.id, state);
              const draft = draftForThread(thread.id, state);
              const rowLabels = threadLabels(thread.id, state);
              const className = ['thread-row', active && 'is-active', unread && 'is-unread'].filter(Boolean).join(' ');
              return (
                <div key={thread.id} className={className}>
                  <button
                    id={`thread-${thread.id}`}
                    type="button"
                    className="thread-open"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => onOpen(thread.id)}
                  >
                    <Avatar participant={who} />
                    <span className="thread-main">
                      <span className="subject-line">
                        {unread && <span className="unread-dot" aria-hidden="true" />}
                        {thread.subject}
                        {unread && <span className="sr-only"> (unread)</span>}
                      </span>
                      <span className="participants">{participantSummary(summaryParticipants(thread, inboxAddress))}</span>
                      <span className="snippet">
                        {draft && (
                          <span className="draft-mark">{draft.handedToBotAt ? 'Handed to bot' : 'Draft'} · </span>
                        )}
                        {latest ? messageSnippet(latest) : ''}
                      </span>
                      {rowLabels.length > 0 && (
                        <span className="row-labels">
                          {rowLabels.map((label) => (
                            <span key={label} className="label-chip is-small">
                              {label}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className="thread-meta">
                      <time dateTime={thread.lastMessageAt || undefined}>{formatThreadTime(thread.lastMessageAt)}</time>
                      <span className="thread-icons">
                        {threadHasFileAttachment(thread) && (
                          <span className="clip" title="Has files">
                            <PaperclipIcon />
                            <span className="sr-only">Has files</span>
                          </span>
                        )}
                        <span className="count-badge" title="Messages">
                          {countLabel(thread)}
                        </span>
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={starred ? 'star-btn is-on' : 'star-btn'}
                    aria-pressed={starred}
                    aria-label={starred ? `Unstar ${thread.subject}` : `Star ${thread.subject}`}
                    onClick={() => onToggleStar(thread.id)}
                  >
                    <StarIcon filled={starred} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <footer className="list-foot">
        {exportedLabel && <p>Exported {exportedLabel}</p>}
        {origin && <p>{origin}</p>}
        {note && <p>{note}</p>}
        {lite && <p title="Quoted replies and inline images were left out to keep the link short.">Lite export</p>}
        <p className="local-only">Stays in this browser. Stars, labels and drafts too.</p>
      </footer>
    </section>
  );
}
