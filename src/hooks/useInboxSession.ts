import { useCallback, useEffect, useRef, useState } from 'react';
import type { ThreadFilters } from '../lib/filterThreads';
import { createFileSource, createSampleSource, createUrlSource, type InboxSource } from '../sources';
import type { InboxExport } from '../types/inbox';

const INITIAL_FILTERS: ThreadFilters = { query: '', direction: 'all', tag: null };

export function useInboxSession() {
  const [inbox, setInbox] = useState<InboxExport | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [filters, setFilters] = useState<ThreadFilters>(INITIAL_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [remoteImages, setRemoteImages] = useState<Record<string, boolean>>({});
  const [inlineOpen, setInlineOpen] = useState<Record<string, boolean>>({});
  const dragDepth = useRef(0);

  const load = useCallback(async (source: InboxSource) => {
    setLoading(true);
    setError(null);
    try {
      const next = await source.load();
      setInbox(next);
      setOrigin(source.label);
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

  useEffect(() => {
    const src = new URLSearchParams(window.location.search).get('src');
    if (src) void load(createUrlSource(src));
  }, [load]);

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

  const toggleRemote = useCallback((id: string) => {
    setRemoteImages((current) => ({ ...current, [id]: !current[id] }));
  }, []);

  const toggleInline = useCallback((id: string) => {
    setInlineOpen((current) => ({ ...current, [id]: !current[id] }));
  }, []);

  return {
    inbox,
    origin,
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
    dismissError: () => setError(null),
    toggleRemote,
    toggleInline,
  };
}
