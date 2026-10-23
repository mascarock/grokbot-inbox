import type { Participant, Thread } from '../types/inbox';

/** Plus-tags in a local part. `name+roma@host` yields `["roma"]`. */
export function plusTags(address: string): string[] {
  const local = address.split('@')[0] ?? '';
  const tags: string[] = [];
  for (const match of local.matchAll(/\+([^@+]+)/g)) {
    const tag = match[1]?.trim().toLowerCase();
    if (tag) tags.push(tag);
  }
  return tags;
}

export function threadAddresses(thread: Thread): string[] {
  const out: string[] = [];
  for (const participant of thread.participants) out.push(participant.address);
  for (const message of thread.messages) {
    out.push(message.from.address);
    for (const recipient of message.to) out.push(recipient.address);
    for (const recipient of message.cc ?? []) out.push(recipient.address);
  }
  return out.filter(Boolean);
}

export function addressesEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function formatParticipant(participant: Participant): string {
  const name = participant.name?.trim();
  const address = participant.address?.trim();
  if (name && address) return `${name} <${address}>`;
  return name || address || 'Unknown';
}

export function shortName(participant: Participant): string {
  return participant.name?.trim() || participant.address?.trim() || 'Unknown';
}

export function participantSummary(participants: Participant[], max = 3): string {
  const labels = participants.map(shortName).filter(Boolean);
  if (labels.length === 0) return 'No participants';
  if (labels.length <= max) return labels.join(', ');
  return `${labels.slice(0, max).join(', ')} +${labels.length - max}`;
}

export function initials(participant: Participant): string {
  const name = participant.name?.trim();
  if (name) {
    const bits = name.split(/\s+/).filter(Boolean);
    const first = bits[0]?.[0] ?? '';
    const second = bits[1]?.[0] ?? bits[0]?.[1] ?? '';
    return `${first}${second}`.toUpperCase() || '?';
  }
  const local = (participant.address.split('@')[0] ?? participant.address).replace(/[^a-zA-Z0-9]/g, '');
  return (local.slice(0, 2) || '?').toUpperCase();
}

const AVATAR_COLORS = [
  { bg: '#f3d2c4', fg: '#7a3418' },
  { bg: '#d7e4d1', fg: '#24512d' },
  { bg: '#d5e3f3', fg: '#1e3f6b' },
  { bg: '#efe3c2', fg: '#6a4e12' },
  { bg: '#eadcf2', fg: '#5a3470' },
  { bg: '#f6d5de', fg: '#7a2940' },
];

export function avatarColor(address: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < address.length; i += 1) {
    hash = (hash * 31 + address.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}

/** Who the row is about: the other person, not the mailbox owner when we can tell. */
export function threadCounterpart(thread: Thread, inboxAddress: string): Participant {
  const latest = thread.messages[thread.messages.length - 1];
  if (latest && !addressesEqual(latest.from.address, inboxAddress) && (latest.from.address || latest.from.name)) {
    return latest.from;
  }
  const recipient = latest?.to.find((person) => person.address && !addressesEqual(person.address, inboxAddress));
  if (recipient) return recipient;
  const other = thread.participants.find((person) => person.address && !addressesEqual(person.address, inboxAddress));
  if (other) return other;
  return latest?.from ?? thread.participants[0] ?? { address: '' };
}

export function summaryParticipants(thread: Thread, inboxAddress: string): Participant[] {
  const others = thread.participants.filter((person) => person.address && !addressesEqual(person.address, inboxAddress));
  return others.length > 0 ? others : thread.participants;
}
