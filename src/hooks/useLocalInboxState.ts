import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Draft } from '../lib/compose';
import {
  EMPTY_STATE,
  addLabel,
  dropDraft,
  loadState,
  markRead,
  markUnread,
  putDraft,
  removeLabel,
  saveState,
  toggleArchive,
  toggleStar,
  type LocalInboxState,
} from '../lib/localInboxState';
import type { Thread } from '../types/inbox';

/** Per-inbox local state. Loads when the inbox changes and writes through to localStorage. */
export function useLocalInboxState(inbox: string | null) {
  const [state, setState] = useState<LocalInboxState>(() => (inbox ? loadState(inbox) : EMPTY_STATE));
  const [loadedFor, setLoadedFor] = useState(inbox);

  if (inbox !== loadedFor) {
    setLoadedFor(inbox);
    setState(inbox ? loadState(inbox) : EMPTY_STATE);
  }

  useEffect(() => {
    if (!inbox || state === EMPTY_STATE) return;
    saveState(inbox, state);
  }, [inbox, state]);

  useEffect(() => {
    if (!inbox) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key.endsWith(inbox.trim().toLowerCase())) setState(loadState(inbox));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [inbox]);

  const actions = useMemo(
    () => ({
      markRead: (thread: Thread) => setState((s) => markRead(s, thread)),
      markUnread: (threadId: string) => setState((s) => markUnread(s, threadId)),
      toggleStar: (threadId: string) => setState((s) => toggleStar(s, threadId)),
      toggleArchive: (threadId: string) => setState((s) => toggleArchive(s, threadId)),
      addLabel: (threadId: string, label: string) => setState((s) => addLabel(s, threadId, label)),
      removeLabel: (threadId: string, label: string) => setState((s) => removeLabel(s, threadId, label)),
      saveDraft: (draft: Draft) => setState((s) => putDraft(s, draft)),
      discardDraft: (id: string) => setState((s) => dropDraft(s, id)),
    }),
    [],
  );

  const reset = useCallback(() => setState(EMPTY_STATE), []);

  return useMemo(() => ({ state, ...actions, reset }), [state, actions, reset]);
}
