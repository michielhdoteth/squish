# Interactive Plugin Installer

Squish provides an **interactive terminal-based installer** for easy plugin selection and installation.

## Quick Start

```bash
# Run interactive installer (works across platforms)
bun run install:interactive
# OR
npx squish-memory install-interactive
```

## Features

- **Multi-select interface** - Press SPACE to toggle multiple plugins
- **Visual navigation** - Arrow keys (↑↓) or vim-style (j/k)
- **Auto-detection** - Shows which clients are already installed
- **Source verification** - Indicates which plugins have source code available
- **Instant feedback** - Real-time installation status with colors

## Menu Controls

| Key | Action |
|------|---------|
| `SPACE` | Toggle selection on current item |
| `↑` / `↓` | Navigate up/down |
| `j` / `k` | Vim-style navigation |
| `Ctrl+A` | Toggle all selections |
| `ENTER` | Confirm and install selected plugins |
| `ESC` | Cancel installation |

## Menu Display

```
╔════════════════════════════════════════════╗
║  Squish Plugin Installer - Interactive Mode         ║
╚════════════════════════════════════════════╝

▶ [x] Claude Code Plugin             ✓ installed  📦 source available
    Session hooks for automatic memory capture

▶ [ ] OpenClaw Plugin                 ○ not installed  📦 source available
    Memory slot via MCP bridge

▶ [x] OpenCode Plugin                  ✓ installed  📦 source available
    MCP server configuration - OpenCode

────────────────────────────────────────────────────
Selected: 2 / 3 available plugins
────────────────────────────────────────────────────

[SPACE] Toggle selection  [↑↓] Navigate  [ENTER] Install  [ESC] Cancel
```

## Installation Flow

### 1. Dependency Check
Automatically checks and installs required dependencies:
- mcporter (v1.2.0)
- qmd (v0.15.1)

### 2. Plugin Installation
Installs each selected plugin based on manifest configuration:
- Copies configuration files to appropriate directories
- Runs installation scripts
- Verifies setup

### 3. Post-Installation
Provides next steps:
- Restart AI assistant(s)
- Tools appear automatically
- Health check verification

## Platform Support

### Linux/macOS
- Full support with all features
- Terminal colors enabled
- Full keyboard handling

### Windows (PowerShell/CMD)
- Partial support (no raw mode)
- Still functional for selection and installation
- Colors may not display properly

## Troubleshooting

### Menu doesn't display correctly
- Ensure terminal supports ANSI colors
- Try running in standard terminal (not IDE terminal)
- Windows: Use Windows Terminal or PowerShell 7+

### Installation fails
- Check manifest exists: `config/plugin-manifest.json`
- Verify dependencies: `bun run deps:check`
- Check file permissions in target directories

### Keys not working
- Ensure terminal sends proper key codes
- Try different terminal emulator
- Windows: Ensure keyboard layout is US/English

## Examples

### Install Single Plugin (Interactive)
```
1. Run: bun run install:interactive
2. Navigate to Claude Code Plugin
3. Press SPACE to select
4. Press ENTER to install
```

### Install Multiple Plugins (Interactive)
```
1. Run: bun run install:interactive
2. Navigate to Claude Code Plugin, press SPACE
3. Navigate to OpenClaw Plugin, press SPACE
4. Press ENTER to install both
```

### Install All Available Plugins (Interactive)
```
1. Run: bun run install:interactive
2. Press Ctrl+A to select all
3. Press ENTER to install
```

### Non-Interactive: Install All
```bash
# For CI/automation or AI agents
bun run install:interactive --auto

# Environment variable approach
CI=true bun run install:interactive
```

### Non-Interactive: Specific Plugins
```bash
# Install specific plugins (no menu)
bun run install:interactive --select=claude-code,openclaw

# Environment variable approach
CI=true bun run install:interactive --select=claude-code,openclaw
```

### List Available Plugins
```bash
bun run install:interactive --list
# Shows all plugins with installation status
```

### Dry-Run Preview
```bash
# Test what would be installed without making changes
bun run install:interactive --select=claude-code,openclaw --dry-run

# Auto mode with dry-run
bun run install:interactive --all --dry-run
```

### Verbose Mode
```bash
# Detailed output for debugging
bun run install:interactive --select=claude-code --verbose --dry-run
```

### Environment Variables (Auto-Detection)

```bash
# Force non-interactive mode (useful for CI/CD)
CI=true bun run install:interactive
NON_INTERACTIVE=1 bun run install:interactive
AUTOMATION=true bun run install:interactive
```

### Full Auto-Install (All Flags)
```bash
# List plugins
bun run install:interactive --list --verbose

# Install all with dry-run preview
bun run install:interactive --all --dry-run --verbose
```

## Comparison: Interactive vs CLI

| Feature | Interactive (`install:interactive`) | CLI (`install:plugin`) |
|---------|-----------------------------------|---------------------------|
| Plugin selection | Visual checkbox menu | `--client=claude-code,openclaw` |
| Discovery required | No (menu shows all) | Yes (need to know client names) |
| Multi-select | Yes (SPACE to toggle) | Yes (comma-separated) |
| Dry-run | Not supported | `--dry-run` flag |
| Auto-detection | Yes (shows installed status) | No |
| Best for | New users, manual setup | Automation, CI/CD, power users |

## Development

### Adding New Plugins to Menu
Plugins are auto-detected from `config/plugin-manifest.json`:
1. Add target to `targets` in manifest
2. Specify `name`, `description`, `type`
3. Re-run interactive installer

### Customizing Menu
Edit `scripts/install-interactive.mjs`:
- Modify `CLIENT_DIRS` for custom paths
- Adjust `Menu` class for different layout
- Change colors in `colors` object

---

**Related Documentation:**
- [Plugin Architecture](./PLUGIN-ARCHITECTURE.md)
- [Manifest Schema](../config/plugin-manifest.schema.json)
- [Installation Guide](./INSTALL-QUICKSTART.md)
