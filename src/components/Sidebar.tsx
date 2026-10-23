import { FOLDERS, type Folder, type ThreadFilters } from '../lib/filterThreads';
import {
  ArchiveIcon,
  HashIcon,
  InboxIcon,
  KeyboardIcon,
  LogoMark,
  MailIcon,
  MoonIcon,
  PenIcon,
  RefreshIcon,
  StarIcon,
  SunIcon,
  TagIcon,
} from './Icons';

const FOLDER_ICONS: Record<Folder, React.ReactNode> = {
  inbox: <InboxIcon />,
  unread: <MailIcon />,
  starred: <StarIcon />,
  archived: <ArchiveIcon />,
};

export function Sidebar({
  inboxAddress,
  filters,
  counts,
  labels,
  tags,
  theme,
  exportedLabel,
  lite,
  onFilters,
  onCompose,
  onRefresh,
  onToggleTheme,
  onShortcuts,
}: {
  inboxAddress: string;
  filters: ThreadFilters;
  counts: Record<Folder, number>;
  labels: string[];
  tags: string[];
  theme: 'light' | 'dark';
  exportedLabel: string;
  lite: boolean;
  onFilters: (filters: ThreadFilters) => void;
  onCompose: () => void;
  onRefresh: () => void;
  onToggleTheme: () => void;
  onShortcuts: () => void;
}) {
  return (
    <aside className="sidebar" aria-label="Folders and labels">
      <div className="sidebar-brand">
        <LogoMark size={26} />
        <span className="brand-name">Grok Bot Inbox</span>
      </div>
      <button type="button" className="btn btn-primary compose-btn" onClick={onCompose} title="New message (c)">
        <PenIcon />
        <span>Compose</span>
      </button>
      <nav className="side-group" aria-label="Folders">
        {FOLDERS.map((folder) => {
          const on = filters.folder === folder.id;
          const count = counts[folder.id];
          return (
            <button
              key={folder.id}
              type="button"
              className={on ? 'side-item is-on' : 'side-item'}
              aria-current={on ? 'page' : undefined}
              onClick={() => onFilters({ ...filters, folder: folder.id })}
            >
              {FOLDER_ICONS[folder.id]}
              <span>{folder.label}</span>
              {count > 0 && <span className={folder.id === 'unread' ? 'side-count is-strong' : 'side-count'}>{count}</span>}
            </button>
          );
        })}
      </nav>
      {labels.length > 0 && (
        <nav className="side-group" aria-label="Labels">
          <p className="side-heading">Labels</p>
          {labels.map((label) => {
            const on = filters.label === label;
            return (
              <button
                key={label}
                type="button"
                className={on ? 'side-item is-on' : 'side-item'}
                aria-pressed={on}
                onClick={() => onFilters({ ...filters, label: on ? null : label })}
              >
                <TagIcon />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      )}
      {tags.length > 0 && (
        <nav className="side-group" aria-label="Plus-tags">
          <p className="side-heading">Addresses</p>
          {tags.map((tag) => {
            const on = filters.tag === tag;
            return (
              <button
                key={tag}
                type="button"
                className={on ? 'side-item is-on' : 'side-item'}
                aria-pressed={on}
                onClick={() => onFilters({ ...filters, tag: on ? null : tag })}
              >
                <HashIcon />
                <span className="mono">+{tag}</span>
              </button>
            );
          })}
        </nav>
      )}
      <div className="side-spacer" />
      <footer className="side-foot">
        <p className="mono side-address" title={inboxAddress}>
          {inboxAddress}
        </p>
        <p className="side-meta">
          {exportedLabel && <span>Exported {exportedLabel}</span>}
          {lite && <span title="Quoted replies and inline images were left out to keep the link short."> · lite</span>}
        </p>
        <div className="side-tools">
          <button type="button" className="icon-btn" onClick={onRefresh} aria-label="Copy the refresh command for your bot" title="Refresh via your bot">
            <RefreshIcon />
          </button>
          <button type="button" className="icon-btn" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title="Theme">
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button type="button" className="icon-btn" onClick={onShortcuts} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
            <KeyboardIcon />
          </button>
        </div>
      </footer>
    </aside>
  );
}
