# Environment Configuration Examples

Squish supports configuration via environment variables and a unified `config/settings.json` file. Environment variables take priority over settings.json.

## Unified Configuration (config/settings.json)

Create `config/settings.json` for persistent configuration:

```json
{
  "embeddings": {
    "provider": "local",
    "models": {
      "openai": {
        "model": "text-embedding-3-small"
      },
      "google": {
        "model": "gemini-embedding-001"
      },
      "ollama": {
        "model": "nomic-embed-text:v1.5"
      }
    }
  },
  "api": {
    "openai": {
      "apiKey": null,
      "apiUrl": "https://api.openai.com/v1/embeddings"
    },
    "google": {
      "apiKey": null,
      "projectId": null
    },
    "ollama": {
      "url": "http://localhost:11434"
    }
  },
  "mcp": {
    "serverPort": 8767,
    "serverEnabled": true
  }
}
```

## Local Development

```bash
# .env.local

# MCP Server
SQUISH_MCP_PORT=8767
SQUISH_MCP_SERVER_ENABLED=true

# Embeddings (local TF-IDF, no API needed)
SQUISH_EMBEDDINGS_PROVIDER=local

# QMD for markdown search
SQUISH_QMD_ENABLED=true
SQUISH_QMD_COLLECTIONS=/path/to/qmd-collections

# Session features
SQUISH_LIFECYCLE_ENABLED=true
SQUISH_SUMMARIZATION_ENABLED=true
```

## Google Embeddings

```bash
# .env.google

# Use Google embeddings
SQUISH_EMBEDDINGS_PROVIDER=google

# Google Cloud credentials
GOOGLE_CLOUD_PROJECT=my-project
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_CLOUD_API_KEY=your-api-key

# Optional: specify model (default: gemini-embedding-001)
SQUISH_GOOGLE_EMBEDDING_MODEL=gemini-embedding-001
# Alternative: gemini-embedding-2

# Or use service account
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

## OpenAI Embeddings

```bash
# .env.openai

# Use OpenAI embeddings
SQUISH_EMBEDDINGS_PROVIDER=openai

# OpenAI credentials
SQUISH_OPENAI_API_KEY=sk-xxx

# Optional: specify model (default: text-embedding-3-small)
SQUISH_OPENAI_EMBEDDING_MODEL=text-embedding-3-small
# Alternative: text-embedding-3-large
```

## Ollama Embeddings (Local)

```bash
# .env.ollama

# Use Ollama embeddings
SQUISH_EMBEDDINGS_PROVIDER=ollama
SQUISH_OLLAMA_URL=http://localhost:11434

# Optional: specify model (default: nomic-embed-text:v1.5)
SQUISH_OLLAMA_EMBEDDING_MODEL=nomic-embed-text:v1.5
# Alternative: mxbai-embed-large
```

## Auto Mode (Smart Fallback)

```bash
# .env.auto

# Auto mode tries cloud providers first if configured, falls back to local
SQUISH_EMBEDDINGS_PROVIDER=auto

# Configure cloud providers (auto will use if available)
SQUISH_OPENAI_API_KEY=sk-xxx
GOOGLE_CLOUD_API_KEY=xxx
GOOGLE_CLOUD_PROJECT=my-project
SQUISH_OLLAMA_URL=http://localhost:11434
```

## Production VPS

```bash
# .env.production

# MCP Server
SQUISH_MCP_PORT=8767
SQUISH_MCP_SERVER_ENABLED=true

# PostgreSQL for team mode
DATABASE_URL=postgresql://user:pass@localhost:5432/squish

# Redis for caching (optional)
REDIS_URL=redis://localhost:6379

# Embeddings - use Google with fallback to local
SQUISH_EMBEDDINGS_PROVIDER=google
SQUISH_GOOGLE_EMBEDDING_MODEL=gemini-embedding-001

# Google Cloud
GOOGLE_CLOUD_PROJECT=production-project
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=/etc/squish/gcloud-credentials.json

# QMD for local markdown
SQUISH_QMD_ENABLED=true
SQUISH_QMD_COLLECTIONS=/var/squish/qmd-collections

# Scheduler
SQUISH_SCHEDULER_MODE=cron
SQUISH_CRON_ENABLED=true

# Client-side encryption (v1.1.0-enhanced)
SQUISH_ENCRYPTION_PASSPHRASE=your-secure-passphrase
```

## Supabase Backend (v1.1.0-enhanced)

```bash
# .env.supabase

# Supabase PostgreSQL backend
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# Optional: encryption
SQUISH_ENCRYPTION_PASSPHRASE=your-secure-passphrase
```

## Neon Backend (v1.2.0)

```bash
# .env.neon

# Neon serverless PostgreSQL backend
NEON_PROJECT_ID=your-project-id
NEON_SERVICE_KEY=your-service-key

# Note: DATABASE_URL is also required for Neon connection
DATABASE_URL=postgresql://user:password@your-project-id.us-east-1.aws.neon.tech/squish?sslmode=require
```

## Team Mode (v1.2.0)

Team mode uses cloud backends for shared team access. Auto-detects based on env vars:

```bash
# .env.team

# Option 1: PostgreSQL (default "local cloud")
DATABASE_URL=postgresql://user:pass@localhost:5432/squish

# Option 2: Supabase as team backend
SQUISH_TEAM_BACKEND=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
DATABASE_URL=postgresql://...

# Option 3: Neon as team backend
SQUISH_TEAM_BACKEND=neon
NEON_PROJECT_ID=your-project-id
NEON_SERVICE_KEY=your-service-key
DATABASE_URL=postgresql://...
```

## Remote Mode (v1.2.0)

Remote mode connects to user's own cloud databases (Supabase/Neon):

```bash
# .env.remote

# Option 1: Supabase
SQUISH_REMOTE_BACKEND=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
DATABASE_URL=postgresql://...

# Option 2: Neon
SQUISH_REMOTE_BACKEND=neon
NEON_PROJECT_ID=your-project-id
NEON_SERVICE_KEY=your-service-key
DATABASE_URL=postgresql://...
```

## Encryption & Graph Boost (v1.1.0-enhanced)

```bash
# Client-side encryption
SQUISH_ENCRYPTION_PASSPHRASE=your-secure-passphrase

# Graph-boosted retrieval weight (default: 1.5)
SQUISH_WEIGHT_GRAPH_BOOST=1.5

# Memory lifecycle decay
SQUISH_LIFECYCLE_INTERVAL=3600000
SQUISH_DECAY_THRESHOLD=0.1
SQUISH_LIFECYCLE_DECAY_CRON="0 * * * *"
```

## OpenClaw Agent

```bash
# .env.openclaw

# MCP Server for OpenClaw
SQUISH_MCP_PORT=8767

# Local-first for privacy
SQUISH_EMBEDDINGS_PROVIDER=local
SQUISH_QMD_ENABLED=true

# Agent-aware memory
SQUISH_AGENT_ISOLATION_ENABLED=true
SQUISH_DEFAULT_VISIBILITY=private

# Governance
SQUISH_GOVERNANCE_ENABLED=true
```

## Full Configuration

```bash
# .env.complete

# MCP Server
SQUISH_MCP_PORT=8767
SQUISH_MCP_SERVER_ENABLED=true

# Embeddings Provider: local | openai | ollama | google | none | auto
SQUISH_EMBEDDINGS_PROVIDER=google

# Model Selection
SQUISH_OPENAI_EMBEDDING_MODEL=text-embedding-3-small
SQUISH_GOOGLE_EMBEDDING_MODEL=gemini-embedding-001
SQUISH_OLLAMA_EMBEDDING_MODEL=nomic-embed-text:v1.5

# Google Cloud
GOOGLE_CLOUD_PROJECT=my-project
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_CLOUD_API_KEY=xxx
# Or: GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# OpenAI (for openai provider or auto mode)
SQUISH_OPENAI_API_KEY=sk-xxx
SQUISH_OPENAI_API_URL=https://api.openai.com/v1/embeddings

# Ollama (for ollama provider or auto mode)
SQUISH_OLLAMA_URL=http://localhost:11434

# QMD Integration
SQUISH_QMD_ENABLED=true
SQUISH_QMD_COLLECTIONS=/path/to/collections
SQUISH_QMD_FALLBACK=hybrid
SQUISH_QMD_COLLECTION_MAPPING={"observation":"squish-obs","fact":"squish-facts"}

# Managed Mode
SQUISH_MANAGED_MODE=false
SQUISH_MANAGED_API_URL=https://api.squish.dev
SQUISH_MANAGED_API_KEY=xxx

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/squish
# Or for local: SQLITE_PATH=/path/to/squish.db

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Lifecycle Management
SQUISH_LIFECYCLE_ENABLED=true
SQUISH_LIFECYCLE_INTERVAL=3600000

# Summarization
SQUISH_SUMMARIZATION_ENABLED=true
SQUISH_INCREMENTAL_THRESHOLD=10
SQUISH_ROLLING_WINDOW_SIZE=50

# Agent Memory
SQUISH_AGENT_ISOLATION_ENABLED=true
SQUISH_DEFAULT_VISIBILITY=private

# Governance
SQUISH_GOVERNANCE_ENABLED=true

# Consolidation (opt-in)
SQUISH_CONSOLIDATION_ENABLED=false
SQUISH_CONSOLIDATION_THRESHOLD=0.8

# Session Auto-Load
SQUISH_SESSION_AUTO_LOAD=true
SQUISH_SESSION_AUTO_LOAD_RECENT_COUNT=5
SQUISH_SESSION_AUTO_LOAD_IMPORTANCE_THRESHOLD=70

# Query Rewriting
SQUISH_QUERY_REWRITING=true
SQUISH_QUERY_REWRITING_CONTEXT_MESSAGES=5
SQUISH_QUERY_REWRITING_FALLBACK=true

# Feedback Tracking
SQUISH_FEEDBACK_TRACKING=true
SQUISH_FEEDBACK_ECHO_BONUS=10
SQUISH_FEEDBACK_FIZZLE_PENALTY=5

# Scheduler
SQUISH_SCHEDULER_MODE=cron
SQUISH_CRON_ENABLED=true
SQUISH_HEARTBEAT_INTERVAL=60000
SQUISH_JOB_RETENTION_DAYS=30
```

## Configuration Priority

1. **Environment Variables** (highest priority)
2. **config/settings.json** (persistent config)
3. **Built-in defaults** (lowest priority)

## Embedding Providers

| Provider | Description | Models Available |
|----------|-------------|------------------|
| `local` | TF-IDF offline, no API needed | Built-in (768 dims) |
| `openai` | OpenAI API | text-embedding-3-small, text-embedding-3-large |
| `google` | Google Cloud | gemini-embedding-001, gemini-embedding-2 |
| `ollama` | Local Ollama | nomic-embed-text:v1.5, mxbai-embed-large |
| `none` | Disable embeddings | - |
| `auto` | Smart fallback | Uses configured providers in order |
