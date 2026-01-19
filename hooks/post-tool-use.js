#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

(async () => {
  try {
    const { onPostToolUse } = await import(join(__dirname, '../dist/features/plugin/plugin-wrapper.js'));
    await onPostToolUse();
    process.exit(0);
  } catch (error) {
    console.error('Hook error:', error);
    process.exit(1);
  }
})();
