#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const copies = [
  {
    from: path.join(root, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    to: path.join(root, 'dist', 'vendor', 'sql.js', 'sql-wasm.wasm'),
  },
];

for (const asset of copies) {
  if (!fs.existsSync(asset.from)) {
    throw new Error(`Runtime asset not found: ${asset.from}`);
  }

  fs.mkdirSync(path.dirname(asset.to), { recursive: true });
  fs.copyFileSync(asset.from, asset.to);
  console.log(`[copy-runtime-assets] Copied ${path.relative(root, asset.from)} -> ${path.relative(root, asset.to)}`);
}
