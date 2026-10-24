import type { IncomingMessage, ServerResponse } from 'node:http';

export const ALLOWED_HOST_SUFFIXES: string[];
export function isAllowedTarget(url: string, suffixes?: readonly string[]): boolean;
export default function handler(req: IncomingMessage | object, res: ServerResponse | object): Promise<void>;
