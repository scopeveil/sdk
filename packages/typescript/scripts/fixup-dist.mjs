#!/usr/bin/env node
/**
 * Post-build fixup pra dual-format ESM+CJS.
 *
 * Node decide se um .js é ESM ou CJS olhando o `"type"` do package.json
 * mais próximo. O package raiz tem `"type": "module"`, então sem essa
 * fixup os arquivos em dist/cjs/ seriam tratados como ESM e quebrariam
 * em `require()`.
 *
 * Solução: cada subpasta dist/ ganha um package.json mínimo com o
 * `type` correto. Idiomático no ecosystem (pkgroll, tsup fazem o mesmo).
 */

import { writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');

const targets = [
  { dir: 'dist/esm', type: 'module' },
  { dir: 'dist/cjs', type: 'commonjs' },
];

for (const { dir, type } of targets) {
  const dirPath = resolve(PKG_ROOT, dir);
  if (!existsSync(dirPath)) {
    console.error(`[fixup-dist] missing dir ${dir} — did the tsc step fail?`);
    process.exit(1);
  }
  const pjPath = resolve(dirPath, 'package.json');
  writeFileSync(pjPath, JSON.stringify({ type }, null, 2) + '\n');
  console.log(`[fixup-dist] wrote ${dir}/package.json (type=${type})`);
}
