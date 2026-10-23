import { useEffect, type KeyboardEvent } from 'react';
import { participantSummary, summaryParticipants, threadCounterpart } from '../lib/addresses';
import { threadHasFileAttachment } from '../lib/attachments';
import { formatThreadTime } from '../lib/dates';
import { countLabel, messageSnippet, type DirectionFilter, type ThreadFilters } from '../lib/filterThreads';
import type { Thread } from '../types/inbox';
import { Avatar } from './Avatar';
import { PaperclipIcon } from './Icons';

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
  onFilters,
  onSelect,
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
  onFilters: (filters: ThreadFilters) => void;
  onSelect: (id: string) => void;
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
              return (
                <button
                  key={thread.id}
                  id={`thread-${thread.id}`}
                  type="button"
                  className={active ? 'thread-row is-active' : 'thread-row'}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onSelect(thread.id)}
                >
                  <Avatar participant={who} />
                  <span className="thread-main">
                    <span className="subject-line">{thread.subject}</span>
                    <span className="participants">{participantSummary(summaryParticipants(thread, inboxAddress))}</span>
                    {latest && <span className="snippet">{messageSnippet(latest)}</span>}
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
        <p className="local-only">Stays in this browser.</p>
      </footer>
    </section>
  );
}
