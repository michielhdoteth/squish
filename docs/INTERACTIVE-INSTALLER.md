# Interactive Plugin Installer

Squish provides a **beautiful interactive terminal-based installer** using [Enquirer](https://github.com/enquirer/enquirer) for a professional user experience.

## Quick Start

```bash
# Run interactive installer (beautiful UI)
bun run install:interactive
# OR
npx squish-memory install-interactive
```

## Features

- 🎨 **Beautiful UI** - Box-style layout with icons and colors
- ✅ **Checkbox selection** - SPACE to toggle plugins
- 🔍 **Auto-detection** - Shows installation status (✓ installed / ● not installed)
- 📦 **Source indicator** - Shows which plugins have source code available
- 🤖 **AI-safe** - Auto-detects non-interactive environments (CI, automation)

## Interactive Menu

When you run without flags, you'll see a beautiful checkbox menu:

```
╔══════════════════════════════════════════════════╗
║  🐙 Squish Plugin Installer                        ║
║  Universal memory system for AI agents           ║
╚══════════════════════════════════════════════════╝

Select plugins to install:
(SPACE to toggle, ENTER to install)

 ❯◉ Claude Code
   Session hooks for auto-memory ✓ installed 📦

  ◯ OpenClaw
   Memory slot via MCP bridge ✓ installed 📦

  ◯ OpenCode
   MCP server configuration ✓ installed

  ◯ Codex
   MCP server configuration ✓ installed

 [Install] [Cancel]
```

## Menu Controls

| Key | Action |
|------|---------|
| `SPACE` | Toggle selection on current item |
| `↑` / `↓` | Navigate up/down |
| `a` | Toggle all selections |
| `ENTER` | Confirm and install |
| `ESC` | Cancel installation |

## Installation Flow

### 1. Dependency Check
```
● Installing dependencies...
✓ Dependencies installed
```

### 2. Plugin Installation
```
Installing plugins:
────────────────────────────────────────────────────
  1. Claude Code
  2. OpenClaw

● Installing plugins...
```

### 3. Success
```
╔══════════════════════════════════════════╗
║  ✓ Installation Complete!                ║
╚══════════════════════════════════════════╝

Next steps:
  → Restart your AI assistant(s)
  → Tools will appear automatically
```

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| macOS | ✅ Full | Terminal colors supported |
| Linux | ✅ Full | All features working |
| Windows | ✅ Full | Windows Terminal recommended |

## Non-Interactive Mode (For AI Agents)

### Auto-Install All
```bash
# Install all available plugins (no menu)
bun run install:interactive --auto
# OR
bun run install:interactive --all

# Environment variable approach
CI=true bun run install:interactive
```

### Install Specific Plugins
```bash
# Install specific plugins (no menu)
bun run install:interactive --select=claude-code,openclaw

# Multiple plugins
bun run install:interactive --select=claude-code,openclaw,opencode
```

### List Available Plugins
```bash
bun run install:interactive --list
```

Output:
```
╔══════════════════════════════════════════════════╗
║  🐙 Squish Plugin Installer                        ║
║  Universal memory system for AI agents           ║
╚══════════════════════════════════════════════════╝

Available Plugins:
────────────────────────────────────────────────────

  1. Claude Code
     Type: hooks
     ✓ installed  📦 source

  2. OpenClaw
     Type: plugin-slot
     ✓ installed  📦 source

  ...

────────────────────────────────────────────────────
Total: 7 plugins available
```

### Dry-Run Preview
```bash
# Test without installing
bun run install:interactive --select=claude-code,openclaw --dry-run

# Verbose mode for debugging
bun run install:interactive --all --dry-run --verbose
```

## Environment Variables

Set these to force non-interactive mode:

```bash
CI=true                    # CI/CD environments
NON_INTERACTIVE=1          # Force CLI mode
AUTOMATION=true            # Automation scripts
```

## Troubleshooting

### Menu doesn't display correctly
- **Windows**: Use Windows Terminal instead of CMD
- **Linux/macOS**: Ensure terminal supports UTF-8
- Try: `export LANG=en_US.UTF-8`

### Installation fails
```bash
# Check manifest exists
ls config/plugin-manifest.json

# Verify dependencies
bun run deps:check

# Test with verbose mode
bun run install:interactive --select=claude-code --verbose --dry-run
```

### Non-interactive mode not working
- Check if `CI` or `NON_INTERACTIVE` env vars are set
- Use `--auto` or `--select` flags explicitly
- For AI agents: Always use flags, never rely on interactive mode

## Comparison: Interactive vs CLI

| Feature | Interactive | CLI (`install:plugin`) |
|---------|-------------|------------------------|
| UI | Beautiful checkbox menu | Command-line flags |
| Selection | SPACE to toggle | `--client=name` |
| Multi-select | Yes (SPACE) | Comma-separated |
| Visual feedback | Real-time status | Text output |
| Best for | Humans, first-time users | Scripts, CI/CD, automation |
| AI-safe | With flags | Yes |

## Icons Reference

| Icon | Meaning |
|------|---------|
| 🐙 | Squish logo |
| ✓ | Installed / Success |
| ✗ | Not installed / Error |
| ● | Not installed indicator |
| ○ | Available |
| 📦 | Source code available |
| → | Action arrow |

## Development

### Testing
```bash
# Run test suite
bun run test:interactive

# Manual testing
node scripts/install-interactive.mjs --help
node scripts/install-interactive.mjs --list
node scripts/install-interactive.mjs --select=claude-code --dry-run
```

### Adding New Plugins
Plugins auto-detect from `config/plugin-manifest.json`:
1. Add target under `targets`
2. Specify `name`, `type`, optional `description`
3. Re-run installer

### Customization
Edit `scripts/install-interactive.mjs`:
- `colors` - ANSI color codes
- `icons` - Unicode symbols
- `CLIENT_DIRS` - Installation paths

---

**Related Documentation:**
- [Plugin Architecture](./PLUGIN-ARCHITECTURE.md)
- [Manifest Schema](../config/plugin-manifest.schema.json)
- [Enquirer Documentation](https://github.com/enquirer/enquirer)

**Powered by:** [Enquirer](https://github.com/enquirer/enquirer) - Stylish CLI prompts
