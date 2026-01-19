# Changelog

All notable changes to the Squish plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.1] - 2026-01-19

### Added
- Advanced memory features: Temporal Parser, Entity Extractor, Hybrid Scorer, Bridge Discovery
- Performance optimizations: 30-100x faster coactivation tracking, LRU cache, parallel embeddings
- Composite database indexes for 10-100x query speedup
- Batch tier updates (100-300x faster lifecycle maintenance)
- Hooks support for SessionStart, UserPromptSubmit, PostToolUse, and SessionEnd
- Memory-guide skill for Claude Code to teach best practices for using Squish
- Formal MCP server configuration via .mcp.json
- Complete plugin publication readiness

### Fixed
- N+1 query performance issue in trackCoactivation()
- Memory leaks in unbounded cache
- Duplicate closeCache() function
- Plugin name inconsistency across configuration files

### Changed
- Updated to production-ready v0.4.1 with security hardening
- Improved memory merge feature with two-stage duplicate detection
- Enhanced package distribution to include all necessary files

### Security
- Security hardening and verification for production use

## [0.4.0] - 2026-01-15

### Added
- Two-tier persistent memory system (core memory + context paging)
- 17 MCP tools for memory management
- Web UI on port 37777
- Agent-aware memory isolation
- Memory lifecycle management (decay, eviction, governance)
- Duplicate detection and merge proposals
- Session summarization
- Privacy filtering for secrets

### Security
- Security hardening and verification for production use

## [0.3.0] - 2025-12-XX

### Added
- Initial plugin structure
- Core memory operations
- Database schemas (SQLite + PostgreSQL)
- Basic MCP server implementation

## [0.2.0] - 2025-11-XX

### Added
- Context paging system
- Embedding support (OpenAI, Ollama)
- Association graph

## [0.1.0] - 2025-10-XX

### Added
- Initial release
- Basic memory storage and retrieval
