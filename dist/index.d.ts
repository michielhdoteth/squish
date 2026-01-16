#!/usr/bin/env node
/**
 * Squish v0.2.5 - Production-ready local-first persistent memory for Claude Code
 *
 * Features:
 * - 8 MCP tools (remember, recall, search, conversations, recent, observe, context, health)
 * - Local mode: SQLite with FTS5 + auto-capture + folder context
 * - Team mode: PostgreSQL + pgvector + Redis
 * - Plugin system: Hooks for auto-capture, context injection, privacy filtering, folder context generation
 * - Privacy-first: Secret detection, <private> tag filtering, async worker pipeline
 * - Pluggable embeddings: OpenAI, Ollama, or local TF-IDF
 *
 * Plugin hooks (registered in plugin.json):
 * - onInstall: Initialize database, create config files
 * - onSessionStart: Inject relevant context + generate folder context
 * - onUserPromptSubmit: Auto-capture user prompts with privacy filtering
 * - onPostToolUse: Auto-capture tool executions and observe patterns
 * - onSessionStop: Finalize observations, summarize via async worker
 *
 * See src/plugin/plugin-wrapper.ts for hook implementations
 */
import 'dotenv/config';
//# sourceMappingURL=index.d.ts.map