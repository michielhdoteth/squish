#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

(async () => {
  try {
    let inputData = '';
    let hasInput = false;

    const stdinTimeout = setTimeout(() => {
      if (!hasInput) {
        const output = {
          continue: true,
          hookSpecificOutput: {
            hookEventName: "PostToolUse"
          }
        };
        console.log(JSON.stringify(output));
        process.exit(0);
      }
    }, 2000);

    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        inputData += chunk;
        hasInput = true;
      }
    });

    process.stdin.on('end', async () => {
      clearTimeout(stdinTimeout);
      await processHook(inputData);
    });

    process.stdin.on('error', () => {
      clearTimeout(stdinTimeout);
      processHook(inputData);
    });

    async function processHook(data) {
      try {
        let claudeContext = {};

        if (data && data.trim()) {
          claudeContext = JSON.parse(data);
        }

        const context = {
          workingDirectory: claudeContext.cwd || process.cwd(),
          sessionId: claudeContext.session_id || 'unknown',
          toolName: claudeContext.tool_name,
          toolArguments: claudeContext.tool_input,
          toolResult: claudeContext.tool_response,
          config: {
            autoCapture: true,
            autoInject: true,
            generateFolderContext: true
          }
        };

        const modulePath = resolve(__dirname, '../dist/features/plugin/plugin-wrapper.js');
        const { onPostToolUse } = await import(`file://${modulePath}`);

        await onPostToolUse(context);

        const output = {
          continue: true,
          hookSpecificOutput: {
            hookEventName: "PostToolUse"
          }
        };
        console.log(JSON.stringify(output));
        process.exit(0);
      } catch (error) {
        console.error('Hook error:', error.message);
        process.exit(2);
      }
    }
  } catch (error) {
    console.error('Hook error:', error.message);
    process.exit(2);
  }
})();
