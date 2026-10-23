import { useState } from 'react';
import { participantSummary } from '../lib/addresses';
import { countLabel } from '../lib/filterThreads';
import type { Thread } from '../types/inbox';
import { CollapsedMessage, MessageCard } from './MessageCard';

export function ThreadView({
  thread,
  inboxAddress,
  theme,
  remoteImages,
  inlineOpen,
  onToggleRemote,
  onToggleInline,
  onBack,
}: {
  thread: Thread;
  inboxAddress: string;
  theme: 'light' | 'dark';
  remoteImages: Record<string, boolean>;
  inlineOpen: Record<string, boolean>;
  onToggleRemote: (id: string) => void;
  onToggleInline: (id: string) => void;
  onBack: () => void;
}) {
  const lastId = thread.messages[thread.messages.length - 1]?.id ?? '';
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
        <h1>{thread.subject}</h1>
        <p className="read-sub">
          {participantSummary(thread.participants)} · {countText}
        </p>
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
            />
          );
        })}
      </div>
    </div>
  );
}
