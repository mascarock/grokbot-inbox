import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));
const samplePath = resolve(root, 'examples/sample-inbox.json');

function sampleInboxPlugin(): Plugin {
  const load = () => readFileSync(samplePath);
  return {
    name: 'sample-inbox',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const [path, query = ''] = (req.url ?? '').split('?');
        // Serve the public download only; Vite's own `?import` module request must pass through.
        if (path.endsWith('/sample-inbox.json') && !path.includes('/examples/') && !/(^|&)import(=|&|$)/.test(query)) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(load());
          return;
        }
        next();
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'sample-inbox.json',
        source: load(),
      });
    },
  };
}

// The site is served from a domain root (Vercel). Set VITE_BASE_PATH
// (for example "/grokbot-inbox/") to build for a sub-path such as a
// GitHub Pages project site.
const base = normalizeBase(process.env.VITE_BASE_PATH ?? '/');

function normalizeBase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') return '/';
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`;
}

export default defineConfig({
  base,
  plugins: [react(), sampleInboxPlugin()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
