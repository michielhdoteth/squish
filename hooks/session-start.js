#!/usr/bin/env node
import {
  readStdin,
  parseClaudeContext,
  createHookContext,
  importHandler,
  executeHandler,
  outputResult,
  handleFatalError,
} from './utils.js';

(async () => {
  try {
    const inputData = await readStdin();
    const claudeContext = parseClaudeContext(inputData);
    
    // Ensure data directory exists
    const { ensureDataDirectory } = await import(
      new URL('../dist/db/bootstrap.js', import.meta.url)
    );
    await ensureDataDirectory();
    
    // Create hook context and execute handler
    const context = createHookContext(claudeContext);
    const handler = await importHandler('onSessionStart');
    const result = await executeHandler(handler, context, 'SessionStart');
    
    outputResult(result);
    process.exit(0);
  } catch (error) {
    handleFatalError(error);
  }
})();
