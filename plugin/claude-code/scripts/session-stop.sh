#!/bin/bash
# Stop hook - per-turn checkpoint with REAL content.
# Receives JSON on stdin: { session_id, transcript_path, cwd, ... }
#
# Extracts the last user message + final assistant text from the session
# transcript (JSONL) and stores a 2KB excerpt via `squish remember`.
# If no real content can be extracted, nothing is stored.

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-${PWD}}"

command -v python3 >/dev/null 2>&1 || exit 0

EXCERPT=$(python3 - "$PROJECT_DIR" <<'PYEOF'
import json
import os
import sys

MAX_EXCERPT = 2048
project_dir = sys.argv[1]

payload = {}
try:
    raw = sys.stdin.read() or ""
    payload = json.loads(raw)
except Exception:
    pass

transcript = payload.get("transcript_path") or os.environ.get("CLAUDE_TRANSCRIPT_PATH")
if not transcript or not os.path.isfile(transcript):
    sys.exit(0)

def text_of(message):
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    parts = []
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                t = block.get("text")
                if isinstance(t, str):
                    parts.append(t)
    return "\n".join(parts).strip()

last_user = ""
last_assistant = ""
try:
    with open(transcript, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()
    for line in reversed(lines):
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except Exception:
            continue
        etype = entry.get("type")
        if etype == "user" and not last_user:
            candidate = text_of(entry.get("message"))
            if candidate and "tool_use_id" not in line[:400]:
                last_user = candidate
        elif etype == "assistant" and not last_assistant:
            candidate = text_of(entry.get("message"))
            if candidate:
                last_assistant = candidate
        if last_user and last_assistant:
            break
except Exception:
    sys.exit(0)

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
