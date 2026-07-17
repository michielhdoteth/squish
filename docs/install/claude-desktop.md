# Installing Squish for Claude Desktop

Squish integrates with Claude Desktop as an MCP (Model Context Protocol) server that provides persistent memory capabilities for your coding sessions.

## Prerequisites

- Claude Desktop latest version
- Node.js 18.0.0 or later
- Squish memory server (installed via npm)

## Installation

Claude Desktop uses MCP-only integration. You need to manually configure the MCP server.

### Step 1: Install Squish Globally

```bash
npm install -g squish-memory
```

### Step 2: Configure MCP in Claude Desktop

Add the following configuration to your Claude Desktop MCP config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%/Claude/claude_desktop_config.json`

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

### Step 3: Restart Claude Desktop

After adding the configuration, restart Claude Desktop to load the MCP server.

## What Gets Installed

The MCP configuration tells Claude Desktop to use Squish as a memory server:
- Creates/updates Claude Desktop MCP configuration file
- Points Claude Desktop to the Squish MCP server executable
- Ensures Squish is available as a memory backend

## Features Enabled

Once installed, Squish provides:

### Persistent Memory Storage
- QMD fast file search for lightning-fast hybrid BM25 + vector search
- SQLite/PostgreSQL for durable storage with full-text search
- Memory Runtime with hot/cold lifecycle and automatic decay

### Standard MCP Memory Tools
- **squish_remember**: Store new memories (auto-detects type)
- **squish_recall**: Search memories by query or retrieve by ID
- **squish_forget**: Delete memories by ID or search
- **squish_link**: Create or find associations between memories
- **squish_context**: Get project-relevant context
- **squish_stats**: Memory statistics and system health
- **squish_inspect**: Inspect why a memory was retained

## MCP Configuration

Claude Desktop uses `claude_desktop_config.json` for MCP server configuration:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%/Claude/claude_desktop_config.json`

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

Once installed, Squish works automatically with Claude Desktop:

1. Start or restart Claude Desktop
2. Begin working - your interactions will be automatically remembered
3. Use Squish through Claude Desktop's AI interface:
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
| `SQUISH_DATA_DIR` | Data directory for Squish | `~/.squish/claude-desktop` |
| `SQUISH_COMMAND` | Command to start Squish MCP | `squish-mcp` |

### Configuration Options
The MCP server configuration supports:
- **command**: Path to Squish MCP executable
- **args**: Arguments (typically `--stdio` for standard I/O)
- **env**: Environment variables for the MCP server process

## Troubleshooting

### Server Not Starting
1. Verify `claude_desktop_config.json` contains valid JSON
2. Test Squish MCP directly: `squish-mcp --stdio`
3. Check Claude Desktop logs for MCP connection errors
4. Ensure Squish is installed: `which squish-mcp`

### Memory Tools Not Available
1. Verify Squish MCP server is running and responsive
2. Check that the MCP configuration points to the correct squish-mcp binary
3. Restart Claude Desktop after configuration
4. Test MCP connection manually: `npx @modelcontextprotocol/sdk inspector`

### Performance Issues
- Initial connection may take a moment while Squish initializes
- First search after startup may be slower while caches warm up
- Consider keeping Squish MCP server running persistently for best performance

## Uninstallation

To remove Squish from Claude Desktop:

```bash
# Remove MCP server config
# macOS:
rm ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Windows:
# Delete %APPDATA%/Claude/claude_desktop_config.json
```

Your Squish data and memories in `~/.squish/` are preserved.

## Compatibility

- Claude Desktop: Latest version
- Node.js: 18.0.0+
- Squish: v1.0.0+
- Operating System: Linux, macOS, Windows

## See Also
- [Universal Plugin Architecture](../PLUGIN-ARCHITECTURE.md)
- [Claude Code Installation](./claude-code.md)
- [OpenCode Installation](./opencode.md)
- [OpenClaw Installation](./openclaw.md)
- [Codex Installation](./codex.md)
- [Cursor Installation](./cursor.md)
- [Gemini CLI Installation](./gemini-cli.md)
- [Squish CLI Reference](../CLI.md)
