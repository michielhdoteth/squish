#!/usr/bin/env node
import {
  readStdin,
  parseClaudeContext,
  createHookContext,
  importHandler,
  executeHandler,
  handleFatalError,
} from './utils.js';

(async () => {
  try {
    const inputData = await readStdin();
    const claudeContext = parseClaudeContext(inputData);
    
    const context = createHookContext(claudeContext);
    const handler = await importHandler('onSessionStop');
    
    // Session end doesn't return context, just executes
    if (handler) {
      await handler(context);
    }
    
    process.exit(0);
  } catch (error) {
    handleFatalError(error);
  }
})();
