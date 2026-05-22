#!/bin/bash
# PreCompact hook - saves current context before session compaction
# Receives JSON on stdin from Codex hooks system

PROJECT_DIR="${CODEX_PROJECT_DIR:-${PWD}}"

# Save context snapshot before compaction
squish context --json --project "$PROJECT_DIR" 2>/dev/null | \
  python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    memories = data.get('durableMemories', [])
    if memories:
        summary = ' | '.join([m.get('content', '')[:100] for m in memories[:10]])
        print(f'Pre-compact snapshot: {len(memories)} memories')
        with open('/dev/null', 'w') as f: pass
except:
    pass
" 2>/dev/null

squish remember "Session compacted" --type context --place archive --project "$PROJECT_DIR" 2>/dev/null

exit 0
