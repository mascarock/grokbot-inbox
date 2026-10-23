import type { Attachment, Thread } from '../types/inbox';

export function partitionAttachments(attachments: Attachment[]): {
  files: Attachment[];
  inline: Attachment[];
} {
  const files: Attachment[] = [];
  const inline: Attachment[] = [];
  for (const attachment of attachments) {
    if (attachment.inline) inline.push(attachment);
    else files.push(attachment);
  }
  return { files, inline };
}

export function threadHasFileAttachment(thread: Thread): boolean {
  return thread.messages.some((message) => message.attachments.some((attachment) => !attachment.inline));
}

export function formatSize(bytes: number, sizeDisplay?: string): string {
  if (sizeDisplay?.trim()) return sizeDisplay.trim();
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) {
    const value = bytes / 1024;
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} KB`;
  }
  const value = bytes / (1024 * 1024);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} MB`;
}

const RASTER_DATA = /^data:image\/(?:png|jpe?g|gif|webp)[;,]/i;

/** http(s) links, or data URLs that are not SVG/HTML/script. */
export function isSafeAttachmentUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  if (lower.startsWith('https://') || lower.startsWith('http://')) return true;
  if (!lower.startsWith('data:')) return false;
  const mime = lower.slice(5).split(/[;,]/)[0] ?? '';
  if (!mime || /svg|html|xml|script|javascript/.test(mime)) return false;
  return true;
}

/** Inline previews only for raster data URLs. Remote URLs are not loaded here. */
export function isInlineRasterPreview(url: string | undefined): url is string {
  return Boolean(url && RASTER_DATA.test(url.trim()));
}

export function fileKind(contentType: string, filename: string): string {
  const type = contentType.toLowerCase();
  const name = filename.toLowerCase();
  if (type.includes('pdf') || name.endsWith('.pdf')) return 'PDF';
  if (type.startsWith('image/')) return 'Image';
  if (type.startsWith('text/') || type.includes('json')) return 'Text';
  if (type.includes('zip') || type.includes('compressed')) return 'Archive';
  if (type.startsWith('audio/')) return 'Audio';
  if (type.startsWith('video/')) return 'Video';
  return 'File';
}
