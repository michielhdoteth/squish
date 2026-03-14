# Environment Configuration Examples

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

## Google Multimodal (Recommended)

```bash
# .env.multimodal

# Use Google Multimodal embeddings
SQUISH_EMBEDDINGS_PROVIDER=google-multimodal
SQUISH_MULTIMODAL_EMBEDDINGS_ENABLED=true

# Google Cloud credentials
GOOGLE_CLOUD_PROJECT=my-project
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_CLOUD_API_KEY=your-api-key

# Or use service account
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

## Managed Mode (Coming Soon)

```bash
# .env.managed

# Enable managed cloud storage
SQUISH_MANAGED_MODE=true
SQUISH_MANAGED_API_URL=https://api.squish.dev
SQUISH_MANAGED_API_KEY=your-managed-api-key

# Use hybrid embeddings (cloud + local fallback)
SQUISH_EMBEDDINGS_PROVIDER=hybrid
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

# Embeddings
SQUISH_EMBEDDINGS_PROVIDER=hybrid
SQUISH_MULTIMODAL_EMBEDDINGS_ENABLED=true

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

# Embeddings
SQUISH_EMBEDDINGS_PROVIDER=hybrid
SQUISH_MULTIMODAL_EMBEDDINGS_ENABLED=true

# Google Cloud Multimodal
GOOGLE_CLOUD_PROJECT=my-project
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_CLOUD_API_KEY=xxx
# Or: GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# OpenAI (fallback)
SQUISH_OPENAI_API_KEY=sk-xxx
SQUISH_OPENAI_API_URL=https://api.openai.com/v1/embeddings
SQUISH_OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Ollama (local fallback)
SQUISH_OLLAMA_URL=http://localhost:11434
SQUISH_OLLAMA_EMBEDDING_MODEL=nomic-embed-text:v1.5

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
