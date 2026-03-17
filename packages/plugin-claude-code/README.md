# Squish Memory for Claude Code

Claude Code plugin for automatic memory capture and context injection with Squish.

## Installation

```bash
npm install @squish/memory-claude-code
```

## Features

- **Automatic Memory Capture**: User prompts are automatically stored as memories
- **Context Injection**: Relevant past memories are injected into Claude's context
- **Session Summaries**: End-of-session summaries are stored for long-term retention
- **Debounced Capture**: 2-second debounce avoids noise

## Hooks

This plugin implements Claude Code plugin hooks:

- `SessionStart` - Initialize memory session
- `UserPromptSubmit` - Capture user input (2s debounced)
- `PostToolUse` - Capture tool usage observations
- `SessionEnd` - Generate and store session summary

## Setup

1. Ensure Squish MCP server is running:
   ```bash
   npx squish-memory install-plugin --client=claude-code
   ```

2. Claude Code will automatically load the plugin on next start if installed globally

3. Verify plugin is active:
   ```bash
   npx squish-memory install-plugin --client=claude-code --verify
   ```

## Configuration

Environment variables:

| Variable | Description |
|----------|-------------|
| `SQUISH_DATA_DIR` | Data directory (default: `~/.squish/claude`) |
| `SQUISH_COMMAND` | Command to start Squish MCP (default: `squish-mcp`) |

## How It Works

1. **Session Start**: Plugin connects to Squish MCP and creates a session
2. **User Input Capture**: Prompts are debounced (2s) then stored as `observation` type memories with tags `user-prompt`, `claude-code`
3. **Tool Use Capture**: (Planned) Tool calls and results stored as `observation`
4. **Session End**: Summary generated and stored, session statistics recorded

## Development

```bash
cd packages/plugin-claude-code
npm install
npm run build
```

## Compatibility

- Claude Code v0.62+
- Node.js 18+
- Squish v1.0.0+

## License

MIT
