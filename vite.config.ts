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
        const path = req.url?.split('?')[0] ?? '';
        if (path.endsWith('/sample-inbox.json')) {
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

export default defineConfig({
  base: '/grokbot-inbox/',
  plugins: [react(), sampleInboxPlugin()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
