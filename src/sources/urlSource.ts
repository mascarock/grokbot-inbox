import { ExportParseError, parseExportText } from './parseExport';
import type { InboxSource } from './types';

/**
 * Load an export from a URL the browser can read.
 * Credentials are omitted. Unlike `#data=`, a query string is sent to the
 * server that hosts the page, so prefer the link source for mail.
 */
export function createUrlSource(url: string): InboxSource {
  const trimmed = url.trim();
  return {
    kind: 'url',
    label: trimmed || 'URL',
    async load() {
      let parsed: URL;
      try {
        parsed = new URL(trimmed);
      } catch {
        throw new ExportParseError('That src URL is not valid.');
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new ExportParseError('Only http and https URLs can be loaded.');
      }
      let response: Response;
      try {
        response = await fetch(parsed.toString(), {
          credentials: 'omit',
          mode: 'cors',
          redirect: 'follow',
          referrerPolicy: 'no-referrer',
        });
      } catch {
        throw new ExportParseError(
          'Could not load that URL. The host may be blocking browser access (CORS).',
        );
      }
      if (!response.ok) {
        throw new ExportParseError(`Could not load that URL (HTTP ${response.status}).`);
      }
      return parseExportText(await response.text());
    },
  };
}
