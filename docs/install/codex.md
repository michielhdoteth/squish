# Installing Squish for Codex

Squish integrates with Codex CLI as an MCP (Model Context Protocol) server that provides persistent memory capabilities for your coding sessions.

## Prerequisites

- Codex CLI (OpenAI) latest version
- Node.js 18.0.0 or later
- Squish memory server (installed via npm)

## Installation Methods

### Method 1: squish install (Recommended)

```bash
# Install Squish globally
npm install -g squish-memory

# Install Squish MCP for Codex
squish install --clients=codex

# Or install for all detected clients
squish install --all
```

The installer will automatically detect your Codex CLI installation and configure Squish MCP.

### Method 2: Manual MCP Configuration

If you prefer manual setup, see the [MCP Configuration](#mcp-configuration) section below.

## What Gets Installed

The installer configures Codex to use Squish as an MCP server:
- Creates/updates Codex MCP configuration file
- Points Codex to the Squish MCP server executable
- Ensures Squish is available as a memory backend

## Features Enabled

Once installed, Squish provides:

### Persistent Memory Storage
- QMD fast file search for lightning-fast hybrid BM25 + vector search
- SQLite/PostgreSQL for durable storage with full-text search
- Memory Runtime with hot/cold lifecycle and automatic decay

### Standard MCP Memory Tools
- **squish_timeline**: 3-layer progressive disclosure search
- **squish_remember**: Store new memories
- **squish_recall**: Search memories by query
- **squish_forget**: Delete memories
- **squish_link**: Create associations between memories
- **squish_context**: Get project-relevant context
- **squish_health**: System health check
- **squish_stats**: Memory statistics
- **squish_inspect**: Inspect a specific memory
- **squish_pin**: Pin/unpin memories
- **squish_recent**: Get recent memories
- **squish_stale**: Find stale memories
- **squish_list_pinned**: List all pinned memories
- **squish_on_session_start**: Session lifecycle hook
- **squish_on_tool_use**: Tool use lifecycle hook
- **squish_on_session_end**: Session end lifecycle hook

## MCP Configuration

Codex uses a standard MCP configuration file. If you need to configure Squish manually, add the following to `~/.codex/mcp.json`:

```json
{
  "mcpServers": {
    "squish-memory": {
      "command": "squish-mcp",
      "args": ["--stdio"]
    }
  }
}
```

## Usage

Once installed, Squish works automatically with Codex:

1. Start or restart Codex CLI
2. Begin working - your interactions will be automatically remembered
3. Use Squish through Codex's AI interface:
   ```
   User: Remember that I prefer TypeScript for new projects
   Assistant: [Stores memory via Squish]
   
   User: What did I decide about project language preferences?
   Assistant: [Retrieves memory via Squish] You decided to prefer TypeScript for new projects.
   ```
4. Access advanced features via Squish CLI:
   ```bash
   squish remember "User prefers TypeScript for new projects"
   squish recall "TypeScript preferences"
   squish context
   squish health
   ```

## Configuration

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `SQUISH_DATA_DIR` | Data directory for Squish | `~/.squish/codex` |
| `SQUISH_COMMAND` | Command to start Squish MCP | `squish-mcp` |

### Configuration Options
The MCP server configuration supports:
- **command**: Path to Squish MCP executable
- **args**: Arguments (typically `--stdio` for standard I/O)
- **env**: Environment variables for the MCP server process

## Troubleshooting

### Server Not Starting
1. Verify installation: `squish install --clients=codex --verify`
2. Check that `~/.codex/mcp.json` contains valid JSON
3. Test Squish MCP directly: `squish-mcp --stdio`
4. Check Codex logs for MCP connection errors

### Memory Tools Not Available
1. Verify Squish MCP server is running and responsive
2. Check that the MCP configuration points to the correct squish-mcp binary
3. Restart Codex after installation
4. Test MCP connection manually: `npx @modelcontextprotocol/sdk inspector`

### Performance Issues
- Initial connection may take a moment while Squish initializes
- First search after startup may be slower while caches warm up
- Consider keeping Squish MCP server running persistently for best performance

## Uninstallation

To remove Squish from Codex:

```bash
# Remove MCP server config
rm ~/.codex/mcp.json

# Or use the uninstaller
npx squish-memory uninstall-plugin --client=codex
```

Your Squish data and memories in `~/.squish/` are preserved.

## Compatibility

- Codex CLI: Latest version
- Node.js: 18.0.0+
- Squish: v1.0.0+
- Operating System: Linux, macOS, Windows

## See Also
- [Universal Plugin Architecture](../PLUGIN-ARCHITECTURE.md)
- [Claude Code Installation](./claude-code.md)
- [OpenCode Installation](./opencode.md)
- [OpenClaw Installation](./openclaw.md)
- [Squish CLI Reference](../CLI.md)
