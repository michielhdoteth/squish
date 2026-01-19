#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

(async () => {
  try {
    // Read context from stdin (with timeout)
    let inputData = '';
    let hasInput = false;

    // Set up timeout for stdin reading
    const stdinTimeout = setTimeout(() => {
      if (!hasInput) {
        console.error('JSON from stdin: {"continue":true,"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Session started. No context data received."}}');
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

    // If no stdin data arrives, proceed anyway
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

        // Map Claude Code context to PluginContext
        const context = {
          workingDirectory: claudeContext.cwd || process.cwd(),
          sessionId: claudeContext.session_id || 'unknown',
          config: {
            autoCapture: true,
            autoInject: true,
            generateFolderContext: true
          }
        };

        // Import and execute hook handler
        const modulePath = resolve(__dirname, '../dist/features/plugin/plugin-wrapper.js');
        const { onSessionStart } = await import(`file://${modulePath}`);

        await onSessionStart(context);

        // Return success with structured output
        const output = {
          continue: true,
          hookSpecificOutput: {
            hookEventName: "SessionStart",
            additionalContext: "Session memory initialized"
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
