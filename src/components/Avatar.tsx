import { avatarColor, initials } from '../lib/addresses';
import type { Participant } from '../types/inbox';

export function Avatar({ participant }: { participant: Participant }) {
  const color = avatarColor(participant.address || participant.name || '?');
  return (
    <span className="avatar" style={{ background: color.bg, color: color.fg }} aria-hidden="true">
      {initials(participant)}
    </span>
  );
}
