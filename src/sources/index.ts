/**
 * v1 inbox sources. A remote source can be added beside these factories
 * when the backend in docs/ROADMAP.md exists. Thread rendering stays on
 * InboxExport either way.
 */
export type { InboxSource } from './types';
export { ExportParseError, parseExportText, parseInboxExport } from './parseExport';
export { createFileSource } from './fileSource';
export { createUrlSource } from './urlSource';
export { createSampleSource } from './sampleSource';
