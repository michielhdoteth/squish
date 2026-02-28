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
    
    const context = createHookContext(claudeContext, true); // Include userMessage
    const handler = await importHandler('onUserPromptSubmit');
    const result = await executeHandler(handler, context, 'UserPromptSubmit');
    
    outputResult(result);
    process.exit(0);
  } catch (error) {
    handleFatalError(error);
  }
})();
