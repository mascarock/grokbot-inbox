import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommandPalette, type PaletteItem } from './components/CommandPalette';
import { ComposeView } from './components/ComposeView';
import { EmptyState } from './components/EmptyState';
import {
  ArchiveIcon,
  CloseIcon,
  FolderOpenIcon,
  ForwardIcon,
  HashIcon,
  InboxIcon,
  KeyboardIcon,
  LogoMark,
  MailIcon,
  MailOpenIcon,
  MoonIcon,
  PenIcon,
  RefreshIcon,
  ReplyAllIcon,
  ReplyIcon,
  SearchIcon,
  SparkIcon,
  StarIcon,
  SunIcon,
  TagIcon,
  TrashIcon,
} from './components/Icons';
import { ShortcutsModal } from './components/ShortcutsModal';
import { Sidebar } from './components/Sidebar';
import { SkeletonInbox } from './components/Skeleton';
import { ThreadList } from './components/ThreadList';
import { ThreadView } from './components/ThreadView';
import { useInboxSession } from './hooks/useInboxSession';
import { useLocalInboxState } from './hooks/useLocalInboxState';
import { useMatchMedia } from './hooks/useMatchMedia';
import { useTheme } from './hooks/useTheme';
import { participantSummary } from './lib/addresses';
import { copyText } from './lib/clipboard';
import { formatRefreshCommand, type ComposeKind } from './lib/command';
import { draftKey, startDraft, type Draft } from './lib/compose';
import { formatExportTime } from './lib/dates';
import { FOLDERS, INITIAL_FILTERS, collectPlusTags, filterThreads, type Folder } from './lib/filterThreads';
import { allLabels, isArchived, isStarred, isUnread, threadLabels } from './lib/localInboxState';
import type { Message, Thread } from './types/inbox';

interface Notice {
  message: string;
  tone: 'info' | 'error';
}

export function App() {
  const { theme, toggleTheme } = useTheme();
  const narrow = useMatchMedia('(max-width: 840px)');
  const {
    inbox,
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
  const [showPalette, setShowPalette] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pillHidden, setPillHidden] = useState(false);

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
  const counts = useMemo<Record<Folder, number>>(() => {
    const out: Record<Folder, number> = { inbox: 0, unread: 0, starred: 0, archived: 0 };
    for (const thread of inbox?.threads ?? []) {
      const archived = isArchived(thread.id, local.state);
      if (archived) out.archived += 1;
      else out.inbox += 1;
      if (!archived && isUnread(thread, local.state, inboxAddress)) out.unread += 1;
      if (isStarred(thread.id, local.state)) out.starred += 1;
    }
    return out;
  }, [inbox, local.state, inboxAddress]);
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
    setPillHidden(false);
  }, [inbox]);

  useEffect(() => {
    const unread = counts.unread > 0 ? `(${counts.unread}) ` : '';
    document.title = inbox ? `${unread}${inbox.inbox} · Grok Bot Inbox` : 'Grok Bot Inbox';
  }, [inbox, counts.unread]);

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
    toast(
      ok ? 'Copied /inbox-refresh, paste it in your bot chat for a fresh link.' : 'Could not copy. Type /inbox-refresh in your bot chat.',
      ok ? 'info' : 'error',
    );
  }, [inbox, toast]);

  const openThread = useCallback(
    (id: string) => {
      setSelectedId(id);
      setMobileThread(true);
    },
    [setSelectedId],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setShowPalette((open) => !open);
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);

      if (event.key === 'Escape') {
        if (showPalette) setShowPalette(false);
        else if (showShortcuts) setShowShortcuts(false);
        else if (compose) closeCompose(compose);
        else if (typing) (target as HTMLElement).blur();
        return;
      }
      if (typing || showPalette) return;
      if (event.key === '?') {
        event.preventDefault();
        setShowShortcuts((open) => !open);
        return;
      }
      if (showShortcuts || compose) return;
      if (event.key === '/') {
        event.preventDefault();
        const search = document.getElementById('mail-search');
        if (search) search.focus();
        else setShowPalette(true);
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
  }, [
    inbox,
    selected,
    narrow,
    compose,
    showShortcuts,
    showPalette,
    closeCompose,
    moveSelection,
    openCompose,
    archiveSelected,
    markUnreadSelected,
    local,
  ]);

  const paletteItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [];
    const latest = selected?.messages[selected.messages.length - 1];
    if (inbox) {
      items.push({ id: 'compose', label: 'New message', group: 'Actions', shortcut: 'c', icon: <PenIcon />, run: () => openCompose('new') });
      if (selected && latest) {
        items.push(
          { id: 'reply', label: 'Reply', group: 'Actions', shortcut: 'r', icon: <ReplyIcon />, run: () => openCompose('reply', selected, latest) },
          { id: 'reply-all', label: 'Reply all', group: 'Actions', shortcut: 'a', icon: <ReplyAllIcon />, run: () => openCompose('reply-all', selected, latest) },
          { id: 'forward', label: 'Forward', group: 'Actions', shortcut: 'f', icon: <ForwardIcon />, run: () => openCompose('forward', selected, latest) },
          {
            id: 'archive',
            label: isArchived(selected.id, local.state) ? 'Move back to Inbox' : 'Archive thread',
            group: 'Actions',
            shortcut: 'e',
            icon: <ArchiveIcon />,
            run: archiveSelected,
          },
          {
            id: 'star',
            label: isStarred(selected.id, local.state) ? 'Unstar thread' : 'Star thread',
            group: 'Actions',
            shortcut: 's',
            icon: <StarIcon />,
            run: () => local.toggleStar(selected.id),
          },
          { id: 'unread', label: 'Mark unread', group: 'Actions', shortcut: 'u', icon: <MailOpenIcon />, run: markUnreadSelected },
        );
      }
      items.push({
        id: 'refresh',
        label: 'Refresh via your bot',
        hint: 'copies /inbox-refresh',
        group: 'Actions',
        keywords: 'reload export link',
        icon: <RefreshIcon />,
        run: () => void copyRefresh(),
      });
      for (const folder of FOLDERS) {
        items.push({
          id: `folder-${folder.id}`,
          label: `Go to ${folder.label}`,
          hint: counts[folder.id] ? String(counts[folder.id]) : undefined,
          group: 'Folders',
          keywords: 'folder view',
          icon: folder.id === 'inbox' ? <InboxIcon /> : folder.id === 'unread' ? <MailIcon /> : folder.id === 'starred' ? <StarIcon /> : <ArchiveIcon />,
          run: () => setFilters({ ...filters, folder: folder.id, query: '' }),
        });
      }
      for (const label of labels) {
        items.push({
          id: `label-${label}`,
          label: `Label: ${label}`,
          group: 'Labels',
          icon: <TagIcon />,
          run: () => setFilters({ ...filters, label: filters.label === label ? null : label }),
        });
      }
      for (const tag of tags) {
        items.push({
          id: `tag-${tag}`,
          label: `Address: +${tag}`,
          group: 'Addresses',
          icon: <HashIcon />,
          run: () => setFilters({ ...filters, tag: filters.tag === tag ? null : tag }),
        });
      }
      for (const thread of inbox.threads.slice(0, 400)) {
        items.push({
          id: `thread-${thread.id}`,
          label: thread.subject || '(no subject)',
          hint: participantSummary(thread.participants, 2),
          group: 'Threads',
          keywords: thread.participants.map((p) => `${p.name ?? ''} ${p.address}`).join(' '),
          icon: <MailIcon />,
          run: () => {
            const visibleNow = filterThreads([thread], filters, local.state, inboxAddress).length > 0;
            if (!visibleNow) {
              setFilters({
                ...INITIAL_FILTERS,
                folder: isArchived(thread.id, local.state) ? 'archived' : 'inbox',
              });
            }
            openThread(thread.id);
          },
        });
      }
    }
    items.push(
      { id: 'theme', label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', group: 'Settings', icon: theme === 'dark' ? <SunIcon /> : <MoonIcon />, run: toggleTheme },
      { id: 'shortcuts', label: 'Keyboard shortcuts', group: 'Settings', shortcut: '?', icon: <KeyboardIcon />, run: () => setShowShortcuts(true) },
      { id: 'open', label: 'Open export file…', group: 'Settings', icon: <FolderOpenIcon />, run: () => fileRef.current?.click() },
    );
    if (!inbox) items.push({ id: 'sample', label: 'Load sample inbox', group: 'Settings', icon: <SparkIcon />, run: openSample });
    if (inbox && sourceKind === 'link') {
      items.push({ id: 'forget', label: 'Forget this inbox', hint: 'clears it from this tab', group: 'Settings', icon: <TrashIcon />, run: forget });
    }
    return items;
  }, [
    inbox,
    selected,
    local,
    labels,
    tags,
    filters,
    counts,
    theme,
    sourceKind,
    inboxAddress,
    openCompose,
    archiveSelected,
    markUnreadSelected,
    copyRefresh,
    setFilters,
    openThread,
    toggleTheme,
    openSample,
    forget,
  ]);

  const pane = narrow && mobileThread && selected ? 'thread' : 'list';

  return (
    <div className="app">
      <a className="skip" href="#mailbox">
        Skip to mail
      </a>
      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept=".json,.txt,application/json,text/plain"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) openFile(file);
        }}
      />

      {inbox && (
        <header className="mobile-bar">
          <div className="sidebar-brand">
            <LogoMark size={24} />
            <span className="brand-name">Inbox</span>
          </div>
          <span className="mono mobile-address" title={inbox.inbox}>
            {inbox.inbox}
          </span>
          <button type="button" className="icon-btn" onClick={() => setShowPalette(true)} aria-label="Search and commands">
            <SearchIcon />
          </button>
          <button type="button" className="icon-btn is-primary" onClick={() => openCompose('new')} aria-label="New message">
            <PenIcon />
          </button>
        </header>
      )}

      {loading && !inbox ? (
        <SkeletonInbox />
      ) : inbox ? (
        <div className="workspace" id="mailbox" data-show={narrow ? pane : 'all'}>
          <Sidebar
            inboxAddress={inbox.inbox}
            filters={filters}
            counts={counts}
            labels={labels}
            tags={tags}
            theme={theme}
            exportedLabel={formatExportTime(inbox.exportedAt)}
            lite={inbox.mode === 'lite'}
            onFilters={setFilters}
            onCompose={() => openCompose('new')}
            onRefresh={() => void copyRefresh()}
            onToggleTheme={toggleTheme}
            onShortcuts={() => setShowShortcuts(true)}
          />
          <ThreadList
            threads={visible}
            total={inbox.threads.length}
            inboxAddress={inbox.inbox}
            selectedId={selected?.id ?? null}
            filters={filters}
            state={local.state}
            onFilters={setFilters}
            onSelect={setSelectedId}
            onOpen={openThread}
            onToggleStar={local.toggleStar}
            onPalette={() => setShowPalette(true)}
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
              <div className="read-hint">
                <LogoMark size={36} />
                <p>Select a thread to read it.</p>
                <p className="fine-print">
                  <kbd>⌘K</kbd> commands · <kbd>c</kbd> compose · <kbd>?</kbd> shortcuts
                </p>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="workspace is-empty" id="mailbox">
          <EmptyState loading={loading} onOpen={() => fileRef.current?.click()} onSample={openSample} />
          <div className="empty-foot">
            <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>
      )}

      {inbox && sourceKind === 'link' && !pillHidden && (
        <div className="privacy-pill" role="status">
          <span className="pill-dot" aria-hidden="true" />
          <span>
            Loaded only in your browser. The <code>#data</code> link was removed from the address bar.
          </span>
          <button type="button" className="pill-link" onClick={forget}>
            Forget
          </button>
          <button type="button" className="pill-close" onClick={() => setPillHidden(true)} aria-label="Hide">
            <CloseIcon />
          </button>
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

      {showPalette && (
        <CommandPalette
          items={paletteItems}
          onClose={() => setShowPalette(false)}
          onSearch={(query) => setFilters({ ...filters, query })}
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
        <div className="toast is-error" role="alert">
          <p>{error}</p>
          <button type="button" className="toast-btn" onClick={dismissError}>
            Dismiss
          </button>
        </div>
      )}
      {notice && !error && (
        <div className={notice.tone === 'error' ? 'toast is-error' : 'toast'} role="status">
          <p>{notice.message}</p>
          <button type="button" className="toast-btn" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}