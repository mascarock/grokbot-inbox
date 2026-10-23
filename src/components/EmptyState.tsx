import { FileIcon, FolderOpenIcon, LogoMark, SparkIcon } from './Icons';

export function EmptyState({
  loading,
  onOpen,
  onSample,
}: {
  loading: boolean;
  onOpen: () => void;
  onSample: () => void;
}) {
  return (
    <div className="empty-wrap">
      <div className="empty-glow" aria-hidden="true" />
      <div className="empty-card">
        <div className="empty-brand">
          <LogoMark size={40} />
          <span className="brand-name">Grok Bot Inbox</span>
        </div>
        <h1>Your bot's mail, read in your browser.</h1>
        <p className="empty-lead">
          Grok Bot has no public inbox API, so your own bot exports the mailbox and hands you a link. The page decodes it
          locally. Nothing is uploaded, and replies go back through your bot.
        </p>
        <div className="empty-actions">
          <button type="button" className="btn btn-primary" onClick={onSample} disabled={loading}>
            <SparkIcon />
            {loading ? 'Opening…' : 'Load sample inbox'}
          </button>
          <button type="button" className="btn" onClick={onOpen} disabled={loading}>
            <FolderOpenIcon />
            Open export
          </button>
        </div>
        <ul className="empty-steps">
          <li>
            <FileIcon />
            <span>
              Or drop a <code>.json</code> export anywhere on this page.
            </span>
          </li>
          <li>
            <span className="mono empty-cmd">#data=</span>
            <span>Links from your bot carry the inbox in the URL fragment, which never reaches a server.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
