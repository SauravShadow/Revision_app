#!/usr/bin/env node
// Copies the pdf.js worker asset into public/ so it can be served as a
// deterministic static file (workerSrc = '/pdf.worker.min.mjs'), instead of
// relying on bundler-specific `new URL(..., import.meta.url)` resolution.
//
// This monorepo uses npm workspaces, so `pdfjs-dist` may be hoisted to the
// repo-root node_modules instead of living under apps/frontend/node_modules.
// We check both locations and use whichever exists.

import { existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(frontendRoot, '..', '..');

const WORKER_RELATIVE = path.join(
  'node_modules',
  'pdfjs-dist',
  'build',
  'pdf.worker.min.mjs',
);

const candidates = [
  path.join(frontendRoot, WORKER_RELATIVE),
  path.join(repoRoot, WORKER_RELATIVE),
];

const source = candidates.find((candidate) => existsSync(candidate));

if (!source) {
  console.error(
    '[copy-pdf-worker] Could not find pdf.worker.min.mjs. Checked:\n' +
      candidates.map((c) => `  - ${c}`).join('\n') +
      '\nIs `pdfjs-dist` installed? Run `npm install` and try again.',
  );
  process.exit(1);
}

const publicDir = path.join(frontendRoot, 'public');
if (!existsSync(publicDir)) {
  mkdirSync(publicDir, { recursive: true });
}

const dest = path.join(publicDir, 'pdf.worker.min.mjs');
copyFileSync(source, dest);

const { size } = statSync(dest);
console.log(`[copy-pdf-worker] Copied pdf.js worker:`);
console.log(`  source: ${source}`);
console.log(`  dest:   ${dest}`);
console.log(`  size:   ${size} bytes`);
