#!/bin/bash
# Stop hook - per-turn checkpoint with REAL content (Codex).
# Receives JSON on stdin from the Codex hooks system.
#
# The stdin payload schema is not fully documented, so this script:
#   1. Tries any transcript/rollout path fields in the stdin JSON.
#   2. Falls back to the most recently modified rollout under
#      ~/.codex/sessions (within the last 6 hours) whose content mentions
#      the current project directory when possible.
# It then stores the last user message + final assistant text as a 2KB
# excerpt via `squish remember`. No real content -> nothing stored.

PROJECT_DIR="${CODEX_PROJECT_DIR:-${PWD}}"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"

command -v python3 >/dev/null 2>&1 || exit 0

EXCERPT=$(python3 - "$PROJECT_DIR" "$CODEX_HOME" <<'PYEOF'
import json
import os
import sys
import time

MAX_EXCERPT = 2048
project_dir = sys.argv[1]
codex_home = sys.argv[2]

payload = {}
try:
    raw = sys.stdin.read() or ""
    payload = json.loads(raw)
except Exception:
    pass


def find_rollout_path():
    for key in ("transcript_path", "rollout_path", "conversation_path", "session_file"):
        candidate = payload.get(key)
        if isinstance(candidate, str) and os.path.isfile(candidate):
            return candidate
    sessions_root = os.path.join(codex_home, "sessions")
    if not os.path.isdir(sessions_root):
        return None
    cutoff = time.time() - 6 * 3600
    candidates = []
    for root, _dirs, files in os.walk(sessions_root):
        for name in files:
            if not name.startswith("rollout-") or not name.endswith(".json"):
                continue
            full = os.path.join(root, name)
            try:
                mtime = os.path.getmtime(full)
            except OSError:
                continue
            if mtime >= cutoff:
                candidates.append((mtime, full))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


def text_of(item):
    if not isinstance(item, dict):
        return ""
    content = item.get("content")
    if isinstance(content, str):
        return content.strip()
    parts = []
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict):
                btype = block.get("type")
                text = block.get("text")
                if btype in ("input_text", "output_text", "text") and isinstance(text, str):
                    parts.append(text)
    return "\n".join(parts).strip()


path = find_rollout_path()
if not path:
    sys.exit(0)

try:
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        doc = json.load(f)
except Exception:
    sys.exit(0)

items = []
if isinstance(doc, dict):
    items = doc.get("items") or []
elif isinstance(doc, list):
    items = doc

last_user = ""
last_assistant = ""
for item in reversed(items):
    role = item.get("role") if isinstance(item, dict) else None
    text = text_of(item)
    if not text:
        continue
    if role == "assistant" and not last_assistant:
        last_assistant = text
    elif role == "user" and not last_user:
        last_user = text
    if last_user and last_assistant:
        break

sections = []
if last_user:
    sections.append("User: " + last_user[:900])
if last_assistant:
    sections.append("Assistant: " + last_assistant[:1400])
excerpt = "\n\n".join(sections)
if len(excerpt.encode("utf-8")) > MAX_EXCERPT:
    excerpt = excerpt.encode("utf-8")[:MAX_EXCERPT].decode("utf-8", "ignore")
print(excerpt.strip())
PYEOF
)

if [ -n "$EXCERPT" ]; then
  squish remember "$EXCERPT" --type context --place inbox --project "$PROJECT_DIR" >/dev/null 2>&1
fi

exit 0
