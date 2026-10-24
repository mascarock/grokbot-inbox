export const SKIP: Set<string>;
export function listFiles(dir: string): string[];
export function describe(dir: string, rel: string): { file: string; sha: string; size: number; bytes: Buffer };
export function manifest(dir: string): { file: string; sha: string; size: number }[];
export function uploadArgs(described: { file: string; sha: string; size: number; bytes: Buffer }): {
  file: string;
  xVercelDigest: string;
  contentLength: number;
  requestBody: string;
};
