import { initials } from '../lib/addresses';
import type { Participant } from '../types/inbox';

/** Monochrome avatar; a tiny per-address tone shift keeps rows scannable without colour. */
export function Avatar({ participant }: { participant: Participant }) {
  const key = participant.address || participant.name || '?';
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return (
    <span className="avatar" data-tone={hash % 4} aria-hidden="true">
      {initials(participant)}
    </span>
  );
}
