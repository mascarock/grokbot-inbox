import { useCallback, useEffect, useRef, useState } from 'react';
import { readKeyFragment, type SnapshotMeta } from '../lib/crypto';
import { INITIAL_FILTERS, type ThreadFilters } from '../lib/filterThreads';
import { forgetSnapshotKey, recallSnapshotKey, rememberSnapshotKey } from '../lib/keyMemory';
import { probeOutbox } from '../lib/outbox';
import { readLinkPayload } from '../lib/linkCodec';
import { forgetLinkPayload, recallLinkPayload, rememberLinkPayload } from '../lib/linkMemory';
import {
  createFileSource,
  createLinkSource,
  createSampleSource,
  createSnapshotSource,
  createUrlSource,
  isNewerSnapshot,
  type InboxSource,
} from '../sources';
import type { InboxExport } from '../types/inbox';

/** How often the viewer looks for a newer encrypted snapshot while visible. */
export const SNAPSHOT_POLL_MS = 60_000;

export interface SnapshotStatus {
  seq: number;
  /** When the bot produced the snapshot (ISO-8601). */
  updatedAt: string;
  /** When this device last asked the origin (ISO-8601). */
  checkedAt: string;
  refreshing: boolean;
  /** Last background check failed; the shown inbox is still the previous one. */
  stale: boolean;
}

/** What the viewer knows about `/api/outbox` on this origin. */
export interface OutboxStatus {
  /** The snapshot meta says the bot set it up, or a HEAD probe answered 204. */
  available: boolean;
  /** Item ids the bot reported handled in the latest `inbox.meta.json`. */
  acked: string[];
}

const NO_OUTBOX: OutboxStatus = { available: false, acked: [] };

export function useInboxSession() {
  const [inbox, setInbox] = useState<InboxExport | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [sourceKind, setSourceKind] = useState<string | null>(null);
  /** Bumps on every user-initiated open; background refreshes leave it alone. */
  const [sessionId, setSessionId] = useState(0);
  const [snapshot, setSnapshot] = useState<SnapshotStatus | null>(null);
  /** The `#k=` key while a snapshot is open; the outbox encrypts with it. */
  const [snapshotKey, setSnapshotKey] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<OutboxStatus>(NO_OUTBOX);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [filters, setFilters] = useState<ThreadFilters>(INITIAL_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [remoteImages, setRemoteImages] = useState<Record<string, boolean>>({});
  const [inlineOpen, setInlineOpen] = useState<Record<string, boolean>>({});
  const dragDepth = useRef(0);
  const snapshotSource = useRef<ReturnType<typeof createSnapshotSource> | null>(null);
  const snapshotRef = useRef<SnapshotStatus | null>(null);
  snapshotRef.current = snapshot;
  const outboxRef = useRef<OutboxStatus>(NO_OUTBOX);
  outboxRef.current = outbox;

  /** Folds the outbox fields of a fresh meta into state; probes once when the meta is silent. */
  const noteOutbox = useCallback(async (meta: SnapshotMeta | null, probe: boolean) => {
    const current = outboxRef.current;
    let available = current.available || meta?.outbox === true;
    if (!available && probe) available = await probeOutbox();
    const acked = meta?.outboxAcked ?? current.acked;
    if (available === current.available && acked === current.acked) return;
    setOutbox({ available, acked });
  }, []);

  const load = useCallback(async (source: InboxSource) => {
    setLoading(true);
    setError(null);
    try {
      const next = await source.load();
      if (source.kind !== 'link') forgetLinkPayload();
      if (source.kind !== 'snapshot') {
        snapshotSource.current = null;
        setSnapshot(null);
        setSnapshotKey(null);
        setOutbox(NO_OUTBOX);
      }
      setInbox(next);
      setOrigin(source.label);
      setSourceKind(source.kind);
      setSessionId((id) => id + 1);
      setFilters(INITIAL_FILTERS);
      setSelectedId(next.threads[0]?.id ?? null);
      setRemoteImages({});
      setInlineOpen({});
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not read that export.');
    } finally {
      setLoading(false);
    }
  }, []);

  const openSnapshot = useCallback(
    async (keyB64: string) => {
      const source = createSnapshotSource(keyB64);
      snapshotSource.current = source;
      setLoading(true);
      setError(null);
      try {
        const loaded = await source.loadSnapshot();
        forgetLinkPayload();
        const now = new Date().toISOString();
        setSnapshot({ seq: loaded.seq, updatedAt: loaded.updatedAt, checkedAt: now, refreshing: false, stale: false });
        setSnapshotKey(keyB64);
        setInbox(loaded.inbox);
        setOrigin(source.label);
        setSourceKind(source.kind);
        setSessionId((id) => id + 1);
        setFilters(INITIAL_FILTERS);
        setSelectedId(loaded.inbox.threads[0]?.id ?? null);
        setRemoteImages({});
        setInlineOpen({});
        setOutbox(NO_OUTBOX);
        outboxRef.current = NO_OUTBOX;
        void source.peek().then((meta) => noteOutbox(meta, true));
      } catch (err) {
        snapshotSource.current = null;
        setSnapshot(null);
        setSnapshotKey(null);
        setOutbox(NO_OUTBOX);
        setError(err instanceof Error && err.message ? err.message : 'Could not open the encrypted inbox.');
      } finally {
        setLoading(false);
      }
    },
    [noteOutbox],
  );

  /**
   * Background check. Only swaps the inbox when the origin has a newer
   * snapshot; filters, selection, open compose, and local state all stay.
   */
  const refreshSnapshot = useCallback(async (force = false) => {
    const source = snapshotSource.current;
    const current = snapshotRef.current;
    if (!source || !current || current.refreshing) return false;
    setSnapshot({ ...current, refreshing: true });
    try {
      // The sidecar is cheap and also carries the outbox flags.
      const meta = await source.peek();
      void noteOutbox(meta, force);
      if (!force && meta && !isNewerSnapshot(current, meta)) {
        setSnapshot({ ...current, checkedAt: new Date().toISOString(), refreshing: false, stale: false });
        return false;
      }
      const loaded = await source.loadSnapshot();
      const checkedAt = new Date().toISOString();
      if (!isNewerSnapshot(current, loaded)) {
        setSnapshot({ ...current, checkedAt, refreshing: false, stale: false });
        return false;
      }
      setInbox(loaded.inbox);
      setSnapshot({ seq: loaded.seq, updatedAt: loaded.updatedAt, checkedAt, refreshing: false, stale: false });
      return true;
    } catch {
      setSnapshot((s) => (s ? { ...s, checkedAt: new Date().toISOString(), refreshing: false, stale: true } : s));
      return false;
    }
  }, [noteOutbox]);

  useEffect(() => {
    const keyFromHash = readKeyFragment(window.location.hash);
    const fromHash = keyFromHash ? null : readLinkPayload(window.location.hash);
    if (keyFromHash || fromHash) {
      // The fragment never reached the server. Remove it from the address
      // bar too, so it is not copied, bookmarked, or kept in history.
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    if (keyFromHash) {
      rememberSnapshotKey(keyFromHash);
      void openSnapshot(keyFromHash);
      return;
    }
    if (fromHash) rememberLinkPayload(fromHash);
    const payload = fromHash ?? recallLinkPayload();
    if (payload) {
      void load(createLinkSource(payload));
      return;
    }
    const params = new URLSearchParams(window.location.search);
    // `/demo` (a redirect to `/?demo`) opens the fictional sample inbox.
    if (params.has('demo')) {
      void load(createSampleSource());
      return;
    }
    const rememberedKey = recallSnapshotKey();
    if (rememberedKey) {
      void openSnapshot(rememberedKey);
      return;
    }
    const src = params.get('src');
    if (src) void load(createUrlSource(src));
  }, [load, openSnapshot]);

  // A link pasted into an already-open tab only changes the hash.
  useEffect(() => {
    const onHashChange = () => {
      const key = readKeyFragment(window.location.hash);
      const payload = key ? null : readLinkPayload(window.location.hash);
      if (!key && !payload) return;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      if (key) {
        rememberSnapshotKey(key);
        void openSnapshot(key);
      } else if (payload) {
        rememberLinkPayload(payload);
        void load(createLinkSource(payload));
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [load, openSnapshot]);

  useEffect(() => {
    if (sourceKind !== 'snapshot') return;
    const tick = () => {
      if (document.visibilityState === 'visible') void refreshSnapshot();
    };
    const timer = window.setInterval(tick, SNAPSHOT_POLL_MS);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [sourceKind, refreshSnapshot]);

  useEffect(() => {
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const file = event.dataTransfer?.files?.[0];
      if (file) void load(createFileSource(file));
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [load]);

  const openFile = useCallback((file: File) => void load(createFileSource(file)), [load]);
  const openSample = useCallback(() => void load(createSampleSource()), [load]);

  const forget = useCallback(() => {
    forgetLinkPayload();
    forgetSnapshotKey();
    snapshotSource.current = null;
    setSnapshot(null);
    setSnapshotKey(null);
    setOutbox(NO_OUTBOX);
    setInbox(null);
    setOrigin(null);
    setSourceKind(null);
    setSelectedId(null);
    setRemoteImages({});
    setInlineOpen({});
    setFilters(INITIAL_FILTERS);
  }, []);

  const toggleRemote = useCallback((id: string) => {
    setRemoteImages((current) => ({ ...current, [id]: !current[id] }));
  }, []);

  const toggleInline = useCallback((id: string) => {
    setInlineOpen((current) => ({ ...current, [id]: !current[id] }));
  }, []);

  return {
    inbox,
    origin,
    sourceKind,
    sessionId,
    snapshot,
    snapshotKey,
    outbox,
    refreshSnapshot,
    error,
    loading,
    dragging,
    filters,
    setFilters,
    selectedId,
    setSelectedId,
    remoteImages,
    inlineOpen,
    openFile,
    openSample,
    forget,
    dismissError: () => setError(null),
    toggleRemote,
    toggleInline,
  };
}
