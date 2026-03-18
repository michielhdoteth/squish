# Squish Context - squish

<squish-context>

**Project**: C:\Users\michi\Desktop\Command Center\Projects\squish-cc\squish
**Last Updated**: 2026-01-31T00:00:29.954Z

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
3. ✅ Test with existing database (simulate old user upgrade)
4. ✅ Test fresh install (simulate new user)

### Version Bumping
- Update `VERSION` in `index.ts`
- Update `version` in `package.json`
- Update `docs/CLAUDE.md` if exists
- **Keep in sync across all files**

### Breaking Changes
- If removing commands/features, add deprecation warning first
- Always provide migration path for existing users
- Document in commit message with "BREAKING:" prefix

<!-- You can add custom notes and project context here -->
