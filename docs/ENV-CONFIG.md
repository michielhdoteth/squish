# Squish Configuration

Squish uses a **hybrid configuration system**: settings.json for preferences, environment variables for overrides and secrets.

## Configuration Priority

| Priority | Source | Use Case |
|----------|--------|----------|
| 1st | Environment Variables | Secrets, overrides, CI/CD |
| 2nd | `config/settings.json` | User preferences, defaults |
| 3rd | `config.ts` | Fallback defaults |

## Configuration Files

### 1. config/settings.json

Main configuration file with all available options:

```json
{
  "version": "1.2.0",

  "data": {
    "dir": ".squish"
  },

  "mcp": {
    "serverPort": 8767,
    "serverEnabled": true,
    "mode": "stdio"
  },

  "database": {
    "type": "sqlite",
    "url": ""
  },

  "embeddings": {
    "enabled": true,
    "provider": "local",
    "timeout": 30000,
    "models": {
      "openai": { "model": "" },
      "google": { "model": "", "location": "us-central1" },
      "ollama": { "url": "http://localhost:11434", "model": "" },
      "lmstudio": { "url": "http://localhost:1234", "model": "" },
      "transformers": { "model": "" }
    }
  },

  "api": {
    "openai": { "apiKey": null, "apiUrl": "https://api.openai.com/v1/embeddings" },
    "google": { "apiKey": null, "projectId": null, "location": "us-central1" },
    "ollama": { "url": "http://localhost:11434" },
    "lmstudio": { "url": "http://localhost:1234" }
  },

  "security": {
    "encryptionEnabled": false,
    "encryptionPassphrase": ""
  },

  "features": {
    "lifecycleEnabled": true,
    "summarizationEnabled": true,
    "agentIsolation": true,
    "governanceEnabled": true,
    "consolidationEnabled": false
  },

  "lifecycle": {
    "interval": 3600000,
    "decay": {
      "threshold": 0.1,
      "episodic": 30,
      "semantic": 90,
      "procedural": 180,
      "autobiographical": 365,
      "working": 7
    }
  },

  "scoring": {
    "weights": {
      "recency": 0.5,
      "relevance": 3,
      "importance": 2,
      "vectorSim": 3,
      "graphBoost": 1.5
    }
  },

  "scheduler": {
    "mode": "cron",
    "cronEnabled": true,
    "heartbeatInterval": 60000,
    "jobRetentionDays": 30
  },

  "supabase": {
    "url": "",
    "key": ""
  },

  "neon": {
    "projectId": "",
    "serviceKey": ""
  }
}
```

### 2. .env (Data Directory)

Encryption passphrase and secrets only. Located in the data directory (`.squish/.env`):

```bash
# Encryption passphrase (set manually in .squish/.env)
SQUISH_ENCRYPTION_PASSPHRASE=your-secure-passphrase
```

### 3. Environment Variables (Override)

Override settings.json via environment:

```bash
# Override embeddings provider
SQUISH_EMBEDDINGS_PROVIDER=ollama
SQUISH_OLLAMA_EMBEDDING_MODEL=<ollama-embedding-model>

# Override MCP port
SQUISH_MCP_PORT=9000

# Enable encryption passphrase
SQUISH_ENCRYPTION_PASSPHRASE=my-secret
```

## Quick Reference

### Embeddings Provider

| Provider | API Key | Description |
|----------|--------|------------|
| `local` | No | TF-IDF (default, free) |
| `openai` | Yes | Requires `SQUISH_OPENAI_EMBEDDING_MODEL` |
| `ollama` | No | Requires `SQUISH_OLLAMA_EMBEDDING_MODEL` |
| `google` | Yes | Requires `SQUISH_GOOGLE_EMBEDDING_MODEL` |
| `lmstudio` | No | Requires `SQUISH_LM_STUDIO_EMBEDDING_MODEL` |
| `transformers` | No | Requires `SQUISH_LOCAL_MODEL` |

### Database Mode

| Mode | Database | Use Case |
|------|----------|----------|
| `local` | SQLite | Single user, free |
| `team` | PostgreSQL | Team/self-hosted |
| `remote` | Supabase/Neon | Cloud backend |

## Example Configurations

### Local Mode (Default)

```json
{
  "mcp": { "serverPort": 8767 },
  "embeddings": { "provider": "local" },
  "features": { "lifecycleEnabled": true }
}
```

### Team Mode (PostgreSQL)

```json
{
  "database": { "type": "postgres", "url": "postgres://user:pass@host/db" },
  "embeddings": { "provider": "openai", "models": { "openai": { "model": "<openai-embedding-model>" } } },
  "api": { "openai": { "apiKey": "sk-..." } }
}
```

### Remote Mode (Supabase)

```json
{
  "remote": { "backend": "supabase" },
  "supabase": { "url": "https://xxx.supabase.co", "key": "xxx" },
  "embeddings": { "provider": "openai", "models": { "openai": { "model": "<openai-embedding-model>" } } }
}
```

## Security Note

The following are NOT available via MCP (must be configured manually):
- Encryption passphrase: Edit `.squish/.env` directly
- API keys: Use environment or settings.json

## Troubleshooting

```bash
# Check current config
squish context --json

# Health check
squish health

# MCP verification
squish-mcp --health
```
