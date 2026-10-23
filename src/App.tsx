import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ComposeView } from './components/ComposeView';
import { EmptyState } from './components/EmptyState';
import { LogoMark, MoonIcon, PenIcon, RefreshIcon, SearchIcon, SunIcon } from './components/Icons';
import { ShortcutsModal } from './components/ShortcutsModal';
import { ThreadList } from './components/ThreadList';
import { ThreadView } from './components/ThreadView';
import { useInboxSession } from './hooks/useInboxSession';
import { useLocalInboxState } from './hooks/useLocalInboxState';
import { useMatchMedia } from './hooks/useMatchMedia';
import { useTheme } from './hooks/useTheme';
import { copyText } from './lib/clipboard';
import { formatRefreshCommand, type ComposeKind } from './lib/command';
import { draftKey, startDraft, type Draft } from './lib/compose';
import { formatExportTime } from './lib/dates';
import { collectPlusTags, filterThreads } from './lib/filterThreads';
import { allLabels, isArchived, isStarred, isUnread, threadLabels } from './lib/localInboxState';
import type { InboxExport, Message, Thread } from './types/inbox';

interface Notice {
  message: string;
  tone: 'info' | 'error';
}

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
  const local = useLocalInboxState(inbox?.inbox ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mobileThread, setMobileThread] = useState(false);
  const [compose, setCompose] = useState<Draft | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const inboxAddress = inbox?.inbox ?? '';
  const visible = useMemo(() => {
    if (!inbox) return [];
    const matched = filterThreads(inbox.threads, filters, local.state, inboxAddress);
    // In the Unread folder the open thread turns read; keep it on screen until you move on.
    if (filters.folder !== 'unread' || !selectedId || matched.some((thread) => thread.id === selectedId)) return matched;
    const pinned = inbox.threads.find((thread) => thread.id === selectedId);
    if (!pinned || filterThreads([pinned], { ...filters, folder: 'inbox' }, local.state, inboxAddress).length === 0) {
      return matched;
    }
    const ids = new Set(matched.map((thread) => thread.id));
    return inbox.threads.filter((thread) => ids.has(thread.id) || thread.id === selectedId);
  }, [inbox, filters, local.state, inboxAddress, selectedId]);
  const tags = useMemo(() => (inbox ? collectPlusTags(inbox) : []), [inbox]);
  const labels = useMemo(() => allLabels(local.state), [local.state]);
  const unreadCount = useMemo(
    () =>
      inbox
        ? inbox.threads.filter((thread) => !isArchived(thread.id, local.state) && isUnread(thread, local.state, inboxAddress))
            .length
        : 0,
    [inbox, local.state, inboxAddress],
  );
  const selected = visible.find((thread) => thread.id === selectedId) ?? null;
  const threadOpen = Boolean(selected) && (!narrow || mobileThread);

  useEffect(() => {
    if (!inbox || !selectedId) return;
    if (visible.some((thread) => thread.id === selectedId)) return;
    setSelectedId(null);
  }, [inbox, visible, selectedId, setSelectedId]);

  useEffect(() => {
    if (selected && threadOpen) local.markRead(selected);
  }, [selected, threadOpen, local]);

  useEffect(() => {
    setMobileThread(false);
    setCompose(null);
  }, [inbox]);

  useEffect(() => {
    const unread = unreadCount > 0 ? `(${unreadCount}) ` : '';
    document.title = inbox ? `${unread}${inbox.inbox} · Grok Bot Inbox` : 'Grok Bot Inbox';
  }, [inbox, unreadCount]);

  useEffect(() => {
    if (!notice || notice.tone === 'error') return;
    const timer = window.setTimeout(() => setNotice(null), 3800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const toast = useCallback((message: string, tone: 'info' | 'error' = 'info') => setNotice({ message, tone }), []);

  const openCompose = useCallback(
    (kind: ComposeKind, thread?: Thread, message?: Message) => {
      if (!inbox) return;
      const key = draftKey(kind, thread?.id);
      const existing = local.state.drafts[key];
      if (existing && (existing.body.trim() || existing.handedToBotAt || kind === 'new')) {
        setCompose(existing);
        if (existing.body.trim()) toast(existing.handedToBotAt ? 'This draft was already handed to your bot.' : 'Resumed your draft.');
        return;
      }
      const draft = startDraft(kind, inbox.inbox, thread, message);
      local.saveDraft(draft);
      setCompose(draft);
    },
    [inbox, local, toast],
  );

  const closeCompose = useCallback(
    (draft: Draft) => {
      const untouched = !draft.body.trim() && !draft.handedToBotAt && (draft.kind !== 'new' || (!draft.to && !draft.subject));
      if (untouched) local.discardDraft(draft.id);
      setCompose(null);
    },
    [local],
  );

  const moveSelection = useCallback(
    (delta: number) => {
      if (visible.length === 0) return;
      const index = visible.findIndex((thread) => thread.id === selectedId);
      const next = visible[index < 0 ? 0 : Math.min(visible.length - 1, Math.max(0, index + delta))];
      if (next) setSelectedId(next.id);
    },
    [visible, selectedId, setSelectedId],
  );

  const archiveSelected = useCallback(() => {
    if (!selected) return;
    const index = visible.findIndex((thread) => thread.id === selected.id);
    const next = visible[index + 1] ?? visible[index - 1] ?? null;
    const wasArchived = isArchived(selected.id, local.state);
    local.toggleArchive(selected.id);
    toast(wasArchived ? 'Moved back to Inbox.' : 'Archived (stays in this browser).');
    if (narrow) setMobileThread(false);
    if (filters.folder !== 'starred') setSelectedId(next ? next.id : null);
  }, [selected, visible, local, toast, narrow, filters.folder, setSelectedId]);

  const markUnreadSelected = useCallback(() => {
    if (!selected) return;
    local.markUnread(selected.id);
    if (narrow) setMobileThread(false);
    else setSelectedId(null);
  }, [selected, local, narrow, setSelectedId]);

  const copyRefresh = useCallback(async () => {
    if (!inbox) return;
    const ok = await copyText(formatRefreshCommand(inbox.inbox));
    toast(ok ? 'Copied /inbox-refresh, paste it in your bot chat for a fresh link.' : 'Could not copy. Type /inbox-refresh in your bot chat.', ok ? 'info' : 'error');
  }, [inbox, toast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);

      if (event.key === 'Escape') {
        if (showShortcuts) setShowShortcuts(false);
        else if (compose) closeCompose(compose);
        else if (typing) (target as HTMLElement).blur();
        return;
      }
      if (typing) return;
      if (event.key === '?') {
        event.preventDefault();
        setShowShortcuts((open) => !open);
        return;
      }
      if (showShortcuts || compose) return;
      if (event.key === '/') {
        event.preventDefault();
        document.getElementById('mail-search')?.focus();
        return;
      }
      if (!inbox) return;
      const latest = selected?.messages[selected.messages.length - 1];
      switch (event.key) {
        case 'j':
          moveSelection(1);
          break;
        case 'k':
          moveSelection(-1);
          break;
        case 'Enter':
          if (selected && narrow) setMobileThread(true);
          break;
        case 'c':
          event.preventDefault();
          openCompose('new');
          break;
        case 'r':
          if (selected && latest) openCompose('reply', selected, latest);
          break;
        case 'a':
          if (selected && latest) openCompose('reply-all', selected, latest);
          break;
        case 'f':
          if (selected && latest) openCompose('forward', selected, latest);
          break;
        case 'e':
          archiveSelected();
          break;
        case 's':
          if (selected) local.toggleStar(selected.id);
          break;
        case 'u':
          markUnreadSelected();
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inbox, selected, narrow, compose, showShortcuts, closeCompose, moveSelection, openCompose, archiveSelected, markUnreadSelected, local]);

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
        {inbox ? (
          <>
            <button type="button" className="btn btn-primary compose-btn" onClick={() => openCompose('new')} title="New message (c)">
              <PenIcon /> <span>Compose</span>
            </button>
            <button type="button" className="icon-btn" onClick={() => void copyRefresh()} aria-label="Copy the refresh command for your bot" title="Refresh via your bot">
              <RefreshIcon />
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={loading}>
            Open export
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <button type="button" className="icon-btn kbd-btn" onClick={() => setShowShortcuts(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
          ?
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
          <div className="banner-actions">
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Open export
            </button>
            <button type="button" className="btn" onClick={forget}>
              Forget
            </button>
          </div>
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
            labels={labels}
            state={local.state}
            unreadCount={unreadCount}
            onFilters={setFilters}
            onSelect={setSelectedId}
            onOpen={(id) => {
              setSelectedId(id);
              setMobileThread(true);
            }}
            onToggleStar={local.toggleStar}
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
                starred={isStarred(selected.id, local.state)}
                archived={isArchived(selected.id, local.state)}
                labels={threadLabels(selected.id, local.state)}
                labelSuggestions={labels}
                draft={local.state.drafts[draftKey('reply', selected.id)]}
                onToggleRemote={toggleRemote}
                onToggleInline={toggleInline}
                onBack={() => setMobileThread(false)}
                onCompose={(kind, message) => openCompose(kind, selected, message)}
                onResumeDraft={() => {
                  const draft = local.state.drafts[draftKey('reply', selected.id)];
                  if (draft) setCompose(draft);
                }}
                onToggleStar={() => local.toggleStar(selected.id)}
                onToggleArchive={archiveSelected}
                onMarkUnread={markUnreadSelected}
                onAddLabel={(label) => local.addLabel(selected.id, label)}
                onRemoveLabel={(label) => local.removeLabel(selected.id, label)}
              />
            ) : (
              <div className="read-empty read-hint">
                <p>Select a thread to read it.</p>
                <p className="fine-print">
                  Press <kbd>?</kbd> for keyboard shortcuts, <kbd>c</kbd> to write a new message.
                </p>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="workspace" id="mailbox">
          <EmptyState loading={loading} onOpen={() => fileRef.current?.click()} onSample={openSample} />
        </div>
      )}

      {compose && inbox && (
        <ComposeView
          key={compose.id}
          draft={compose}
          inboxAddress={inbox.inbox}
          onChange={(draft) => {
            setCompose(draft);
            local.saveDraft(draft);
          }}
          onHanded={(draft) => {
            local.saveDraft(draft);
            setCompose(null);
          }}
          onDiscard={() => {
            local.discardDraft(compose.id);
            setCompose(null);
          }}
          onClose={() => closeCompose(compose)}
          onToast={toast}
        />
      )}

      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

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
      {notice && !error && (
        <div className={notice.tone === 'error' ? 'toast' : 'toast toast-info'} role="status">
          <p>{notice.message}</p>
          <button type="button" className="btn" onClick={() => setNotice(null)}>
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
