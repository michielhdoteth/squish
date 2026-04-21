#!/usr/bin/env node

// Compatibility entrypoint for generated adapter configs that still reference
// dist/core/commands/mcp-server.js. The implementation lives in packages/mcp.
await import('../../packages/mcp/src/index.js');
