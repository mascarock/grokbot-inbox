import { LogoMark } from './Icons';

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
      <div className="empty-card">
        <LogoMark />
        <h1>Read your Grok Bot inbox</h1>
        <p>
          Grok Bot has no public inbox API. Ask your own bot for a JSON export, then open it here. The file is
          parsed in this browser and is not uploaded.
        </p>
        <div className="empty-actions">
          <button type="button" className="btn btn-primary" onClick={onSample} disabled={loading}>
            {loading ? 'Opening…' : 'Load sample'}
          </button>
          <button type="button" className="btn" onClick={onOpen} disabled={loading}>
            Open export
          </button>
        </div>
        <p className="fine-print">
          Or drop a .json file on this page. A <code>?src=https://…</code> link also works when that URL allows
          browser access. You only see the export you opened.
        </p>
      </div>
    </div>
  );
}
