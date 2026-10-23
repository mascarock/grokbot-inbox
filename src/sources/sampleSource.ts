import sample from '../../examples/sample-inbox.json';
import { parseInboxExport } from './parseExport';
import type { InboxSource } from './types';

export function createSampleSource(): InboxSource {
  return {
    kind: 'sample',
    label: 'Sample inbox',
    async load() {
      return parseInboxExport(sample);
    },
  };
}
