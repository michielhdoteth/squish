#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

(async () => {
  try {
    // Read context from stdin
    let inputData = '';
    for await (const chunk of process.stdin) {
      inputData += chunk;
    }

    const claudeContext = JSON.parse(inputData);

    // Map Claude Code context to PluginContext
    const context = {
      workingDirectory: claudeContext.cwd,
      sessionId: claudeContext.session_id,
      config: {
        autoCapture: true,
        autoInject: true,
        generateFolderContext: true
      }
    };

    const modulePath = join(__dirname, '../dist/features/plugin/plugin-wrapper.js');
    const { onSessionStart } = await import(pathToFileURL(modulePath).href);
    await onSessionStart(context);
    process.exit(0);
  } catch (error) {
    console.error('Hook error:', error);
    process.exit(1);
  }
})();
