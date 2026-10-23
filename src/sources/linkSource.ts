import { decodeInboxPayload } from '../lib/linkCodec';
import { parseExportText } from './parseExport';
import type { InboxSource } from './types';

/**
 * Export carried in the URL fragment (`#data=`). The fragment is never sent
 * to the server, so decoding happens entirely in the page.
 */
export function createLinkSource(payload: string): InboxSource {
  return {
    kind: 'link',
    label: 'Opened from a link',
    async load() {
      return parseExportText(decodeInboxPayload(payload));
    },
  };
}
