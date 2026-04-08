# Squish Context - squish

<squish-context>

**Project**: C:\Users\michi\Desktop\squish-memory\squish
**Last Updated**: 2026-03-27T13:40:00.000Z

## Previous Context
*(Managed by Squish - do not edit this section)*

</squish-context>

## ⚠️ CRITICAL RULES - READ BEFORE ANY CHANGES

### Database Schema Changes
**ALWAYS update `db/bootstrap.ts` when:**
- Adding new tables (add to `sqliteSchemaSql` AND `postgresStatements`)
- Adding new columns (add to `memoriesMigrations` or appropriate migration array)
- Modifying indexes
- **This ensures existing users don't break on update**

### Pre-Commit Checklist
**NEVER commit without:**
1. ✅ Build passes: `bun run build` (0 errors)
2. ✅ All CLI commands work:
   - `squish` (interactive menu)
   - `squish --help`
   - `squish run web`
   - `squish run mcp`  
   - `squish health`
   - `squish stats`
   - `squish remember "test"`
   - `squish search "test"`
   - `squish today` / `squish yesterday` / `squish thisweek`
   - `squish stale`
   - `squish tag add test --search "query" --confirm`
   - `squish delete --older-than "30 days" --confirm`
   - `squish config set project ~/.opencode`
   - `squish recall "test"`
   - `squish memory list` / `squish memory view` / `squish memory consolidate`
3. ✅ Test with existing database (simulate old user upgrade)
4. ✅ Test fresh install (simulate new user)

### Version Bumping
- Update `VERSION` in `index.ts`
- Update `version` in `package.json`
- Update `CLAUDE.md` if exists
- **Keep in sync across all files**

### Breaking Changes
- If removing commands/features, add deprecation warning first
- Always provide migration path for existing users
- Document in commit message with "BREAKING:" prefix

### Memory Management
**ALWAYS check and update memory when:**
- Starting a new coding session
- Making significant changes (new features, fixes, refactors)
- After completing any task
- Before ending a session
- Use `squish memory` or directly edit `.opencode/memory/` files

## v1.1.5 Features

### New in This Release
- **Client-side encryption**: AES-256-GCM with PBKDF2 key derivation
- **Graph-boosted retrieval**: Associations boost search results via coactivation
- **Memory lifecycle**: Tier system (hot/warm/cold) with automatic decay
- **Supabase backend**: PostgreSQL support via Supabase
- **Encryption CLI tools**: `squish_set_passphrase`, `squish_rotate_key`

### Key Files
- `core/security/encrypt.ts` - Encryption/decryption utilities
- `core/search/graph-boost.ts` - Graph boost computation
- `core/memory/memory-lifecycle.ts` - Tier promotion/demotion helpers
- `src/scheduler/decay.ts` - Decay scheduler
- `db/supabase.ts` - Supabase client wrapper
- `config.ts` - New config: `clientEncryptionEnabled`, `scoringWeights.graphBoost`, `decayJobCron`

### New Environment Variables
- `SQUISH_ENCRYPTION_PASSPHRASE` - Encryption passphrase
- `SQUISH_WEIGHT_GRAPH_BOOST` - Graph boost weight (default: 1.5)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service key
- `SQUISH_DECAY_THRESHOLD` - Decay threshold (default: 0.1)
- `SQUISH_LIFECYCLE_DECAY_CRON` - Decay cron schedule

### Schema Changes
New columns added to `memories` table (auto-migrated via bootstrap.ts):
- `status` - Memory status (active/expired)
- `encrypted_content` - Encrypted content
- `encryption_nonce` - Encryption nonce
- `is_encrypted` - Encryption flag

<!-- You can add custom notes and project context here -->
