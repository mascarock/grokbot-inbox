import { ExportParseError, parseExportText } from './parseExport';
import type { InboxSource } from './types';

export function createFileSource(file: File): InboxSource {
  return {
    kind: 'file',
    label: file.name || 'Export file',
    async load() {
      return parseExportText(await readFileText(file));
    },
  };
}

/** FileReader, with Blob#text when the runtime provides it. */
export async function readFileText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new ExportParseError('Could not read that file.'));
    reader.readAsText(file);
  });
}
