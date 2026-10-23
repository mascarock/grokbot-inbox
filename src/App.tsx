import { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from './components/EmptyState';
import { LogoMark, MoonIcon, SearchIcon, SunIcon } from './components/Icons';
import { ThreadList } from './components/ThreadList';
import { ThreadView } from './components/ThreadView';
import { useInboxSession } from './hooks/useInboxSession';
import { useMatchMedia } from './hooks/useMatchMedia';
import { useTheme } from './hooks/useTheme';
import { formatExportTime } from './lib/dates';
import { collectPlusTags, filterThreads } from './lib/filterThreads';
import type { InboxExport } from './types/inbox';

export function App() {
  const { theme, toggleTheme } = useTheme();
  const narrow = useMatchMedia('(max-width: 840px)');
  const {
    inbox,
    origin,
    sourceKind,
    error,
    loading,
    dragging,
    filters,
    setFilters,
    selectedId,
    setSelectedId,
    remoteImages,
    inlineOpen,
    openFile,
    openSample,
    forget,
    dismissError,
    toggleRemote,
    toggleInline,
  } = useInboxSession();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mobileThread, setMobileThread] = useState(false);

  const visible = useMemo(() => (inbox ? filterThreads(inbox.threads, filters) : []), [inbox, filters]);
  const tags = useMemo(() => (inbox ? collectPlusTags(inbox) : []), [inbox]);
  const selected = visible.find((thread) => thread.id === selectedId) ?? null;

  useEffect(() => {
    if (!inbox) return;
    if (visible.some((thread) => thread.id === selectedId)) return;
    setSelectedId(visible[0]?.id ?? null);
  }, [inbox, visible, selectedId, setSelectedId]);

  useEffect(() => {
    setMobileThread(false);
  }, [inbox]);

  useEffect(() => {
    document.title = inbox ? `${inbox.inbox} · Grok Bot Inbox` : 'Grok Bot Inbox';
  }, [inbox]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (event.key === '/' && !typing) {
        event.preventDefault();
        document.getElementById('mail-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pane = narrow && mobileThread && selected ? 'thread' : 'list';

  return (
    <div className="app">
      <a className="skip" href="#mailbox">
        Skip to mail
      </a>
      <header className="topbar">
        <div className="brand">
          <LogoMark />
          <div className="brand-text">
            <strong>Inbox</strong>
            <small>Grok Bot</small>
          </div>
        </div>
        {inbox && (
          <p className="inbox-chip" title={inbox.inbox}>
            {inbox.inbox}
          </p>
        )}
        <label className="search">
          <SearchIcon />
          <input
            id="mail-search"
            type="search"
            placeholder="Search mail"
            aria-label="Search mail"
            value={filters.query}
            disabled={!inbox}
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
          />
        </label>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={loading}>
          Open export
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <input
          ref={fileRef}
          className="sr-only"
          type="file"
          accept=".json,.txt,application/json,text/plain"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) openFile(file);
          }}
        />
      </header>

      {inbox && sourceKind === 'link' && (
        <div className="privacy-banner" role="status">
          <p>
            <strong>This inbox is loaded only in your browser.</strong> It came from the link's <code>#data</code>{' '}
            fragment, which is never sent to a server. The fragment was removed from the address bar and the inbox is
            remembered in this tab only.
          </p>
          <button type="button" className="btn" onClick={forget}>
            Forget
          </button>
        </div>
      )}

      {inbox ? (
        <div className="workspace" id="mailbox" data-show={narrow ? pane : 'both'}>
          <ThreadList
            threads={visible}
            total={inbox.threads.length}
            inboxAddress={inbox.inbox}
            selectedId={selected?.id ?? null}
            filters={filters}
            tags={tags}
            onFilters={setFilters}
            onSelect={(id) => {
              setSelectedId(id);
              setMobileThread(true);
            }}
            exportedLabel={formatExportTime(inbox.exportedAt)}
            origin={origin}
            note={sourceNote(inbox)}
            lite={inbox.mode === 'lite'}
          />
          <section className="pane read-pane" aria-label="Conversation">
            {selected ? (
              <ThreadView
                thread={selected}
                inboxAddress={inbox.inbox}
                theme={theme}
                remoteImages={remoteImages}
                inlineOpen={inlineOpen}
                onToggleRemote={toggleRemote}
                onToggleInline={toggleInline}
                onBack={() => setMobileThread(false)}
              />
            ) : (
              <p className="read-empty">No thread to show.</p>
            )}
          </section>
        </div>
      ) : (
        <div className="workspace" id="mailbox">
          <EmptyState loading={loading} onOpen={() => fileRef.current?.click()} onSample={openSample} />
        </div>
      )}

      {dragging && (
        <div className="drop-overlay">
          <div className="drop-card">
            <strong>Drop the JSON export</strong>
            <p>It opens locally. Nothing is uploaded.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="toast" role="alert">
          <p>{error}</p>
          <button type="button" className="btn" onClick={dismissError}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

function sourceNote(inbox: InboxExport): string | null {
  const note = inbox.source?.note;
  return typeof note === 'string' && note.trim() ? note.trim() : null;
}
