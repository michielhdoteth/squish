# Squish vs AgentMemory: A Fair Comparison

## Overview

Both Squish and AgentMemory solve a real problem: AI agents forget context between sessions. However, they target different use cases and make different architectural tradeoffs. This document provides a factual comparison to help developers choose the right tool for their needs.

---

## AgentMemory Strengths

AgentMemory is a well-designed plugin that addresses a clear pain point: Claude Code forgetting context between coding sessions.

- **Clear pain, clear solution**: AgentMemory directly solves the "Claude Code forgets" problem with a focused approach. Users install it and immediately see improved session continuity.
- **Easy install**: Plugin installation within the Claude Code / agent ecosystem is straightforward. No configuration or API setup needed.
- **Broad agent support**: Works with Claude Code, Codex, Cursor, Windsurf, and other agents, making it accessible to a wide range of developers.
- **LLM-powered extraction**: Uses a second LLM to extract and summarize memories, which can capture nuanced context that deterministic methods might miss.
- **Growing ecosystem**: Rapidly adding features and integrations, with a community-driven development approach.

## Squish Differentiators

Squish takes a different architectural approach, targeting production-grade memory infrastructure rather than coding-session-only recall.

- **No memory LLM required**: Squish uses local-first embeddings for memory retrieval. Signal extraction, belief derivation, and context restoration work without a secondary language model, eliminating per-token costs and reducing latency.
- **Production agent focus**: Built for autonomous agents, multi-agent systems, scheduled tasks, embedded devices, and team workflows -- not just interactive coding sessions.
- **Geometry-aware consolidation**: Score-based decay system with spatial segmentation (Places), graph enrichment, and contradiction handling keeps memory size manageable without LLM-driven summarization.
- **LOCOMO-verified recall**: Benchmarked at 65% on the academic LoCoMo memory benchmark (1540 questions) using deterministic retrieval methods. Results are reproducible and verifiable.
- **Multiple integration surfaces**: CLI for scripts and automation, MCP server for agent integration, Web UI for inspection, and SDK for custom integrations.
- **Local-first by default**: Runs entirely on-device with SQLite. Optional PostgreSQL backend for team mode. No data leaves your machine unless you configure cloud sync.

## Architecture Differences

| Aspect | AgentMemory | Squish |
|--------|-------------|--------|
| Memory extraction | LLM-powered (second LLM required) | Signal engine with local embeddings (no LLM required) |
| Storage | Managed by the plugin | SQLite local / PostgreSQL team mode |
| Retrieval | LLM-context injection | Hybrid search (semantic + keyword BM25 + RRF) |
| Consolidation | LLM-driven summarization | Geometry-aware tiers, Places, graph enrichment |
| Lifecycle | Recent/archived | Score-based decay with expiration |
| Encryption | Not specified | AES-256-GCM client-side encryption |
| Session continuity | Context injection | Compacted working set + durable memory restore |

## Cost Comparison

| Scenario | AgentMemory Cost | Squish Cost |
|----------|-----------------|-------------|
| Default path | LLM API costs per memory operation | $0 (local embeddings) |
| With optional LLM | LLM API costs (required) | LLM API costs only if configured |
| Team deployment | N/A | PostgreSQL hosting costs |
| Per-operation latency | 500-5000ms (LLM call) | 1-20ms (local processing) |

## When to Use Each

### Choose AgentMemory when:
- You primarily use Claude Code for interactive coding sessions
- You want a plugin that works within your existing agent ecosystem
- You prefer LLM-driven extraction that can capture nuanced context
- Agent session memory is your primary concern, not production infrastructure

### Choose Squish when:
- You are building production agents that need durable memory as a runtime primitive
- You want to eliminate LLM costs and latency from memory operations
- You need memory for autonomous agents, multi-agent systems, or scheduled tasks
- You want verifiable benchmark results for memory recall quality
- You need multiple integration surfaces (CLI, MCP, SDK, Web UI)
- You prefer local-first architecture with optional cloud sync
- You need team/shared memory across multiple agent instances

## Summary

Both tools address the real pain of agents forgetting context. AgentMemory solves it for coding sessions with an LLM-powered plugin approach. Squish solves it for production agents with a local-first memory runtime that eliminates the need for a second LLM.

The right choice depends on your use case: coding session continuity, or production agent memory infrastructure.
