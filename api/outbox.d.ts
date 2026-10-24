import type { IncomingMessage, ServerResponse } from 'node:http';

export const BLOB_API: string;
export const BLOB_API_VERSION: string;
export const OUTBOX_PREFIX: string;
export const MAX_BODY_BYTES: number;
export const LIST_LIMIT: number;

export interface OutboxConfig {
  blobToken: string;
  tokenSha256: string;
  access: 'private' | 'public';
}

export function readConfig(env?: Record<string, string | undefined>): OutboxConfig | null;
export function sha256Hex(text: string): string;
export function tokenMatches(presented: unknown, expectedSha256Hex: string): boolean;
export function isEnvelope(input: unknown): boolean;
export function isOutboxId(id: unknown): id is string;
export function makeId(now?: Date, random?: string): string;
export function idToTime(id: string): string;
export function rateLimited(ip: string, now?: number, max?: number): boolean;
export default function handler(req: IncomingMessage | object, res: ServerResponse | object): Promise<void>;
