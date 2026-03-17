# Interactive Plugin Installer

Squish provides a **beautiful multi-step wizard installer** using [Clack](https://github.com/natemoo-re/clack) for a professional installation experience.

## Quick Start

```bash
# Run interactive wizard
bun run install:interactive
```

## Installation Wizard Flow

The installer guides you through 5 simple steps:

### Step 1: Component Selection
```
◆  What would you like to install?
│  ◻ ⌨️ CLI - Command line interface
│  ◻ 🔌 MCP Server - Model Context Protocol
│  ◻ 🔧 AI Agent Plugins
└
```

**Components:**
- **CLI** (`⌨️`) - Command line interface (`squish` command)
- **MCP Server** (`🔌`) - For remote access and AI integrations
- **AI Agent Plugins** (`🔧`) - Claude Code, OpenClaw, Cursor, etc.

### Step 2: Plugin Selection (if chosen)
```
◆  Which AI agents do you want to integrate with?
│  ◻ Claude Code ✓ 📦
│  ◻ OpenClaw ✓ 📦 (Memory slot via MCP bridge)
│  ◻ OpenCode ✓
│  ◻ Codex ✓
│  ◻ Cursor ✓
│  ◻ VS Code
│  ◻ Windsurf ✓
└
```

### Step 3: Configuration
```
◆  Select operation mode:
│  ● 🏠 Local Mode - Everything runs locally (default, recommended)
│  ○ ☁️ Remote Mode - Connect to remote Squish server
└

◆  Select embeddings provider:
│  ● 🧠 Local Embeddings - Uses local CPU (default, free, private)
│  ○ ☁️ OpenAI Embeddings - Requires OPENAI_API_KEY (better quality)
│  ○ ☁️ Cohere Embeddings - Requires COHERE_API_KEY
└
```

### Step 4: Review Summary
```
┌──────────────────────────────────────────────────┐
│  Installation Summary:                           │
│                                                  │
│  Components:                                     │
│    ✓ CLI                                         │
│    ✓ MCP Server                                  │
│    ✓ AI Agent Plugins                            │
│                                                  │
│  Plugins:                                        │
│    ✓ claude-code                                 │
│    ✓ openclaw                                    │
│    ✓ opencode                                    │
│                                                  │
│  Configuration:                                  │
│    ⚙️ Mode: local                                │
│    🧠 Embeddings: local                          │
└──────────────────────────────────────────────────┘

◆  Proceed with installation?
│  ● Yes / ○ No
└
```

### Step 5: Installation
```
◒  Installing dependencies...
✓  Dependencies installed

◒  Setting up CLI...
✓  CLI ready

◒  Configuring MCP Server...
✓  MCP Server configured

◒  Installing 3 plugin(s)...
✓  Plugins installed

◒  Saving configuration...
✓  Configuration saved

┌──────────────────────────────────────────────────┐
│  ✓ Installation Complete!                        │
└──────────────────────────────────────────────────┘

What's next?
  → Restart your AI assistant(s)
  → Try: squish health
  → Try: squish remember "Your first memory"
```

## Non-Interactive Mode (For AI Agents/Scripts)

### Quick Install (CLI + All Plugins)
```bash
bun run install:interactive --quick
# OR
bun run install:interactive -q
```
Installs CLI and all available plugins with default configuration.

### Install All Components
```bash
bun run install:interactive --all
```
Installs CLI, MCP Server, and all plugins.

### Install Specific Plugins
```bash
bun run install:interactive --select=claude-code,openclaw
```

### List Available Plugins
```bash
bun run install:interactive --list
```

### Dry-Run (Preview)
```bash
bun run install:interactive --all --dry-run
```

## Available Plugins

| Plugin | Type | Description |
|--------|------|-------------|
| **Claude Code** | hooks | Session hooks for automatic memory capture |
| **OpenClaw** | plugin-slot | Memory slot via MCP bridge |
| **OpenCode** | mcp | MCP server configuration |
| **Codex** | mcp | MCP server configuration |
| **Cursor** | mcp | MCP server configuration |
| **VS Code** | mcp | MCP server configuration |
| **Windsurf** | mcp | MCP server configuration |

## Icons Reference

| Icon | Meaning |
|------|---------|
| 🐙 | Squish logo |
| ⌨️ | CLI component |
| 🔌 | MCP Server |
| 🔧 | AI Agent Plugins |
| ⚙️ | Configuration |
| 🏠 | Local mode |
| ☁️ | Remote/Cloud mode |
| 🧠 | Local embeddings |
| ✓ | Selected/Installed |
| ✗ | Not installed/Error |
| ● | Selected option |
| ○ | Unselected option |
| ◻ | Checkbox unchecked |
| 📦 | Source code available |

## Configuration

The installer saves your configuration to `~/.squish/config.json`:

```json
{
  "mode": "local",
  "embeddingsProvider": "local",
  "installedAt": "2026-03-17T10:30:00.000Z",
  "version": "1.0.0"
}
```

## Environment Variables

Force non-interactive mode:
```bash
CI=true                    # CI/CD environments
NON_INTERACTIVE=1          # Force CLI mode
AUTOMATION=true            # Automation scripts
```

## Command Reference

```bash
# Interactive wizard (default)
bun run install:interactive

# Quick install (CLI + all plugins)
bun run install:interactive --quick

# Install all components
bun run install:interactive --all

# Install specific plugins
bun run install:interactive --select=plugin1,plugin2

# List plugins
bun run install:interactive --list

# Dry-run preview
bun run install:interactive --all --dry-run

# Verbose output
bun run install:interactive --all --verbose

# Show help
bun run install:interactive --help
```

## Flags Reference

| Flag | Alias | Description |
|------|-------|-------------|
| `--auto` | `-a` | Skip menu, use defaults |
| `--quick` | `-q` | Quick install (CLI + all plugins) |
| `--all` | | Install all components |
| `--select=<list>` | | Install specific plugins |
| `--list` | `-l` | List plugins and exit |
| `--dry-run` | `-n` | Preview without installing |
| `--verbose` | `-v` | Detailed output |
| `--help` | `-h` | Show help |

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| macOS | ✅ Full | All features working |
| Linux | ✅ Full | All features working |
| Windows | ✅ Full | Windows Terminal recommended |

## Troubleshooting

### Installation hangs
- Check if terminal supports interactive prompts
- Try running in a standard terminal (not IDE console)
- Use non-interactive flags: `--quick` or `--select`

### Permission errors
```bash
# On macOS/Linux, you may need:
sudo bun run install:interactive
```

### Configuration not saved
- Check if `~/.squish` directory exists and is writable
- Try: `mkdir -p ~/.squish`

### Plugins not detected
- Ensure `config/plugin-manifest.json` exists
- Run: `bun run install:interactive --list` to verify

## Development

### Testing
```bash
# Test wizard flow
bun run install:interactive

# Test list
bun run install:interactive --list

# Test quick install (dry-run)
bun run install:interactive --quick --dry-run

# Test specific plugins
bun run install:interactive --select=claude-code --dry-run
```

### Adding New Plugins
Edit `config/plugin-manifest.json`:
```json
{
  "targets": {
    "new-agent": {
      "type": "mcp",
      "tools": ["tool1", "tool2"],
      "install": {
        "copy": [
          { "from": "path/to/config", "to": "~/.new-agent/config" }
        ]
      }
    }
  }
}
```

---

**Powered by:** [Clack](https://github.com/natemoo-re/clack) - Modern CLI prompts

**Related:**
- [Plugin Architecture](./PLUGIN-ARCHITECTURE.md)
- [Manifest Schema](../config/plugin-manifest.schema.json)
