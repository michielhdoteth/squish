# Installing Squish for OpenCode

Squish integrates with OpenCode as an MCP (Model Context Protocol) server that provides persistent memory capabilities.

## Prerequisites

- OpenCode v0.1.0 or later
- Node.js 18.0.0 or later
- Squish memory server (installed via npm)

## Installation Methods

### Method 1: Universal Plugin Installer (Recommended)
```bash
# Install Squish if not already installed
npm install -g squish-memory

# Install the OpenCode plugin
npx squish-memory install-plugin --client=opencode

# Verify installation
npx squish-memory install-plugin --client=opencode --verify
```

## What Gets Installed

The installer configures OpenCode to use Squish as an MCP server:
- Creates/updates OpenCode's MCP configuration file
- Points OpenCode to Squish's MCP server executable
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

## Usage

Once installed, Squish works automatically with OpenCode:
1. Start or restart OpenCode
2. Begin working - you can now use Squish's memory capabilities
3. Use Squish through OpenCode's AI interface:
   ```
   User: Remember that I prefer TypeScript for new projects
   Assistant: [Stores memory via Squish]
   
   User: What did I decide about project language preferences?
   Assistant: [Retrieves memory via Squish] You decided to prefer TypeScript for new projects.
   ```
4. Access advanced features via Squish CLI:
   ```bash
   squish remember "Important architectural decision"
   squish recall "architecture decisions"
   squish context
   ```

## Configuration

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `SQUISH_DATA_DIR` | Data directory for Squish | `~/.squish/opencode` |
| `SQUISH_COMMAND` | Command to start Squish MCP | `squish-mcp` |

### OpenCode MCP Configuration
Configuration is stored in OpenCode's MCP config file (typically `~/.config/opencode/mcp-servers.json`):

```jsonc
{
  "mcpServers": {
    "squish-memory": {
      "command": "squish-mcp",
      "args": ["--stdio"],
      "env": {
        "SQUISH_MODE": "local",
        "SQUISH_DATA_DIR": "~/.squish/opencode"
      }
    }
  }
}
```

### Configuration Options
The MCP server configuration supports:
- **command**: Path to Squish MCP executable
- **args**: Arguments (typically `--stdio` for standard I/O)
- **env**: Environment variables for the MCP server process

## Troubleshooting

### Server Not Starting
1. Verify installation: `npx squish-memory install-plugin --client=opencode --verify`
2. Check that `~/.config/opencode/mcp-servers.json` contains valid JSON
3. Test Squish MCP directly: `squish-mcp --stdio`
4. Check OpenCode logs for MCP connection errors

### Memory Tools Not Available
1. Verify Squish MCP server is running and responsive
2. Check that the MCP configuration points to the correct squish-mcp binary
3. Restart OpenCode after installation
4. Test MCP connection manually: `npx @modelcontextprotocol/sdk inspector`

### Performance Issues
- Initial connection may take moment while Squish initializes
- First search after startup may be slower while caches warm up
- Consider keeping Squish MCP server running persistently for best performance

## Uninstallation

```bash
npx squish-memory uninstall-plugin --client=opencode
```

This removes the Squish entry from OpenCode's MCP configuration but preserves your Squish data and memories.

## Auto-Capture

Session lifecycle hooks (session start, tool use, session end) are automatically wired when the MCP server initializes. No manual configuration is needed.

### What Gets Captured

When auto-capture is enabled:
- File modifications (Write, Edit tools)
- Command executions
- Session context and active files
- Failed attempts and hypotheses
- Key decisions and observations

### Places System

Memories are automatically organized into places:
- **inbox**: New observations
- **wip**: Work in progress
- **ref**: Reference materials and research
- **board**: Plans and decisions
- **sandbox**: Experimental code and tests
- **sparks**: Ideas and future possibilities

## Compatibility

- OpenCode: v0.1.0+
- Node.js: 18.0.0+
- Squish: v1.0.0+
- Operating System: Linux, macOS, Windows

## See Also
- [Universal Plugin Architecture](../PLUGIN-ARCHITECTURE.md)
- [Claude Code Installation](./claude-code.md)
- [OpenClaw Installation](./openclaw.md)
- [Squish CLI Reference](../CLI.md)
