# Squish MCP Tools - Slash Commands Reference

Squish is an **MCP (Model Context Protocol) server** that provides 14 tools accessible as slash commands in Claude Code.

## 🎯 Quick Start

Once installed, all Squish tools are available via slash commands with the format:
```
/mcp__squish__tool_name
```

Type `/mcp__squish__` in Claude Code to see all available commands.

---

## 🧠 Core Memory Tools (Tier 1 - Always-In-Context)

### `/mcp__squish__core_memory_view`
**View all core memory sections**
```bash
> /mcp__squish__core_memory_view
```
Displays:
- `persona` - Agent's role and capabilities
- `user_info` - User preferences and context
- `project_context` - Current project state
- `working_notes` - Temporary session notes
- Usage statistics (bytes used/available)

---

### `/mcp__squish__core_memory_edit`
**Replace entire content of a core memory section**
```bash
> /mcp__squish__core_memory_edit persona "I am a senior TypeScript developer focused on React and Node.js"
```
**Limits:**
- Each section: 1KB max
- Total core memory: 2KB max

---

### `/mcp__squish__core_memory_append`
**Append text to a core memory section**
```bash
> /mcp__squish__core_memory_append working_notes "Remember: API uses OAuth2 with PKCE"
```
Adds text to the end of the specified section.

---

## 📚 Context Paging Tools (Tier 2 - Working Set)

### `/mcp__squish__load_to_context`
**Load a memory into your working set**
```bash
> /mcp__squish__load_to_context mem_abc123
```
Tracks what memories you're actively using. Claude manages actual context intelligently.

---

### `/mcp__squish__evict_from_context`
**Remove a memory from your working set**
```bash
> /mcp__squish__evict_from_context mem_abc123
```

---

### `/mcp__squish__view_loaded_memories`
**View all memories in your current working set**
```bash
> /mcp__squish__view_loaded_memories
```
Shows:
- Memory IDs and types
- Content previews
- When each was loaded

---

### `/mcp__squish__context_status`
**View comprehensive memory system status**
```bash
> /mcp__squish__context_status
```
Shows:
- Core memory usage (bytes and percentage)
- Working set: loaded memory count
- Available: total memories in database

---

## 💾 Memory Management Tools

### `/mcp__squish__remember`
**Store a new memory**
```bash
> /mcp__squish__remember "User prefers TypeScript strict mode enabled"
```
With options:
```bash
> /mcp__squish__remember "Bug in login flow" type=fact tags=["bug","auth"]
```

---

### `/mcp__squish__recall`
**Retrieve a memory by ID**
```bash
> /mcp__squish__recall mem_abc123
```

---

### `/mcp__squish__search`
**Semantic search across memories**
```bash
> /mcp__squish__search "authentication setup"
```
With scope:
```bash
> /mcp__squish__search "react components" scope=memories
> /mcp__squish__search "last week's discussion" scope=conversations
```

---

### `/mcp__squish__observe`
**Capture tool/action observations**
```bash
> /mcp__squish__observe type=file_edit action=create summary="Created API endpoint"
```

---

## 🔧 Advanced Tools

### `/mcp__squish__merge`
**Merge duplicate memories**
```bash
> /mcp__squish__merge mem_abc123 mem_def456
```

---

### `/mcp__squish__health`
**Check system health**
```bash
> /mcp__squish__health
```
Shows database status, memory counts, and system health.

---

### `/mcp__squish__context`
**View context window information**
```bash
> /mcp__squish__context
```

---

## 🚀 How It Works

1. **Installation**: Install Squish as a Claude Code plugin
2. **Auto-initialization**: Core memory and session tracking initialize automatically
3. **Use Commands**: Type `/mcp__squish__` to access all 14 tools
4. **Native Integration**: Works seamlessly with Claude's context management

## 📖 Documentation

- **Official Docs**: https://github.com/michielhdoteth/squish
- **MCP Protocol**: https://modelcontextprotocol.io
- **Claude Code Docs**: https://code.claude.com/docs/en/mcp

---

**Note**: Commands follow the MCP naming convention: `/mcp__servername__toolname`. All Squish tools are prefixed with `/mcp__squish__`.
