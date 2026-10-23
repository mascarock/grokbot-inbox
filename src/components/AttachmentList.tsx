import {
  fileKind,
  formatSize,
  isInlineRasterPreview,
  isSafeAttachmentUrl,
  partitionAttachments,
} from '../lib/attachments';
import type { Attachment } from '../types/inbox';

export function AttachmentList({
  attachments,
  inlineOpen,
  onToggleInline,
}: {
  attachments: Attachment[];
  inlineOpen: boolean;
  onToggleInline: () => void;
}) {
  const { files, inline } = partitionAttachments(attachments);
  if (files.length === 0 && inline.length === 0) return null;

  const inlineNoun = inline.every((item) => item.contentType.toLowerCase().startsWith('image/'))
    ? inline.length === 1
      ? 'inline image'
      : 'inline images'
    : inline.length === 1
      ? 'inline attachment'
      : 'inline attachments';

  return (
    <div className="attach-block">
      {files.length > 0 && (
        <>
          <p className="attach-label">Files</p>
          <ul className="file-list">
            {files.map((file, index) => (
              <FileRow key={`${file.attachmentId ?? file.filename}-${index}`} attachment={file} />
            ))}
          </ul>
        </>
      )}
      {inline.length > 0 && (
        <div className="inline-block">
          <button type="button" className="inline-toggle" onClick={onToggleInline} aria-expanded={inlineOpen}>
            {inlineOpen ? 'Hide' : 'Show'} {inline.length} {inlineNoun}
          </button>
          {inlineOpen && (
            <ul className="inline-list">
              {inline.map((file, index) => (
                <InlineRow key={`${file.attachmentId ?? file.filename}-${index}`} attachment={file} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function FileRow({ attachment }: { attachment: Attachment }) {
  const meta = [fileKind(attachment.contentType, attachment.filename), formatSize(attachment.size, attachment.sizeDisplay)]
    .filter(Boolean)
    .join(' · ');
  const safe = attachment.url && isSafeAttachmentUrl(attachment.url) ? attachment.url : null;
  const body = (
    <>
      <span className="file-kind">{fileKind(attachment.contentType, attachment.filename)}</span>
      <span className="file-copy">
        <span className="file-name">{attachment.filename}</span>
        <span className="file-meta">{safe ? meta : `${meta} · Not included in the export`}</span>
      </span>
    </>
  );
  if (!safe) {
    return <li className="file-row">{body}</li>;
  }
  return (
    <li>
      <a className="file-row is-link" href={safe} target="_blank" rel="noopener noreferrer">
        {body}
        <span className="file-open">Open</span>
      </a>
    </li>
  );
}

function InlineRow({ attachment }: { attachment: Attachment }) {
  const preview = isInlineRasterPreview(attachment.url) ? attachment.url : null;
  return (
    <li className="inline-row">
      {preview && <img className="inline-thumb" src={preview} alt="" />}
      <span className="file-copy">
        <span className="file-name">{attachment.filename}</span>
        <span className="file-meta">
          {[attachment.contentType, formatSize(attachment.size, attachment.sizeDisplay), 'inline']
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
    </li>
  );
}
