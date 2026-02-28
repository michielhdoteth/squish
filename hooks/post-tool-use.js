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
    
    const context = createHookContext(claudeContext, true); // Include userMessage for tool context
    const handler = await importHandler('onPostToolUse');
    const result = await executeHandler(handler, context, 'PostToolUse');
    
    outputResult(result);
    process.exit(0);
  } catch (error) {
    handleFatalError(error);
  }
})();
