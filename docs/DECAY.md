# Memory Decay System

The Squish memory decay system automatically manages memory lifecycle by reducing the importance score of memories over time, promoting/demoting them between tiers, and eventually expiring old or low-value memories.

## How It Works

### Decay Formula

```
newScore = importanceScore * (1 - decayRate/100)^(days / sectorInterval)
```

Where:
- **importanceScore**: Current importance/relevance score (0-100)
- **decayRate**: Per-memory decay rate stored as integer percentage (e.g., 30 = 30%)
- **days**: Days since last decay calculation
- **sectorInterval**: Days between decay checks for the memory's sector

### Per-Memory Decay Rate

Each memory has a `decayRate` column (integer, default varies by type):
- `observation`: 5%
- `fact`: 3%
- `decision`: 2%
- `context`: 4%
- `preference`: 3%
- `note`: 5%
- `reflection`: 2%

The decay rate can be set per-memory or defaults to the type-based rate.

### Sector Intervals

Memories are grouped by sector, which determines how often they're evaluated for decay:

| Sector | Interval (days) | Use Case |
|--------|-----------------|----------|
| episodic | 30 | Event-based memories |
| semantic | 90 | Factual knowledge |
| procedural | 180 | Process/method knowledge |
| autobiographical | 365 | Self-knowledge |
| working | 7 | Short-term working memory |

## Tier System

Memories are classified into three tiers based on recency, coactivation, and salience:

| Tier | Recency | Coactivation | Salience |
|------|---------|--------------|----------|
| hot | <= 7 days | >= 10 | >= 70 |
| warm | <= 30 days | >= 5 | >= 50 |
| cold | > 30 days | < 5 | < 50 |

### Tier Transitions

- **Promotion**: When a memory meets higher tier criteria, it moves up (cold -> warm -> hot)
- **Demotion**: When a memory's score drops below threshold, it moves down
- **Expiration**: Cold memories with score below threshold get `status = 'expired'`

## Expiration

When a cold-tier memory's importance score drops below the decay threshold (default: 0.1 * 100 = 10), its status is set to `expired`.

Expired memories:
- Are excluded from search results by default
- Can be cleaned up by the eviction process
- Are protected from accidental deletion until explicitly purged

## Configuration

### Environment Variables

```bash
# Enable/disable lifecycle management
SQUISH_LIFECYCLE_ENABLED=true

# Interval between lifecycle runs (ms, default: 1 hour)
SQUISH_LIFECYCLE_INTERVAL=3600000

# Score threshold for expiration (0-1, default: 0.1)
SQUISH_DECAY_THRESHOLD=0.1

# Cron schedule for decay job (default: hourly)
SQUISH_LIFECYCLE_DECAY_CRON="0 * * * *"
```

### Protecting Memories

Memories can be protected from decay and eviction:

```typescript
// Via MCP tool
squish_pin <memoryId>

// Or via API
await pinMemory(memoryId);
```

Protected memories have `is_pinned = true` and are skipped during decay and eviction.

## Implementation

### Files

- `core/lifecycle.ts` - Main decay and tier management logic
- `core/worker.ts` - Background worker that runs lifecycle maintenance
- `core/scheduler/cron-scheduler.ts` - Cron-based job scheduling

### Flow

1. **Cron Scheduler** triggers `decay_maintenance` job hourly
2. **Worker** calls `runLifecycleMaintenance()`
3. **applyDecay()** calculates new scores using the decay formula
4. **updateTiers()** reclassifies memories into hot/warm/cold
5. **evictOldMemories()** removes very old cold memories with low relevance

### Metrics

The lifecycle maintenance returns stats:

```typescript
{
  decayed: number,    // Memories that had score reduced
  expired: number,    // Memories that became 'expired'
  evicted: number,    // Memories hard-deleted
  tierChanges: { hot: number, warm: number, cold: number }
}
```

## Migration Notes

### Upgrading from v1.0.x

If you're upgrading from an older version:

1. The `status` column will be added automatically via migration
2. Existing memories will have `status = 'active'` set
3. The new per-memory decay formula replaces the old hardcoded 10% decay

### Schema Changes

| Column | Type | Description |
|--------|------|-------------|
| `decay_rate` | INTEGER | Per-memory decay percentage (e.g., 30 = 30%) |
| `last_decay_at` | TIMESTAMP | Last time decay was applied |
| `importance_score` | INTEGER | Current importance score (0-100) |
| `tier` | TEXT | hot/warm/cold classification |
| `status` | TEXT | active/expired |

## Troubleshooting

### Decay Not Running

Check that:
1. `SQUISH_LIFECYCLE_ENABLED=true` (default: true)
2. Worker is starting - look for "Background worker started" in logs
3. Cron scheduler is initialized - look for "Cron scheduler initialized"

### Memories Expiring Too Fast

- Lower the decay threshold: `SQUISH_DECAY_THRESHOLD=0.05`
- Increase sector interval in `core/lifecycle.ts`
- Pin important memories to prevent expiration

### Memories Never Expiring

- Check that `last_decay_at` is being updated
- Verify sector intervals haven't passed
- Ensure memories are not protected (`is_pinned` or `is_protected`)