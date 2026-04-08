---
description: Initialize Squish memory system for the current project
---

# Squish Initialization

Initializes the Squish memory system for your current project. This creates the necessary database structure and default settings.

## What it does:

- Creates the `.squish/` directory in your project
- Initializes the SQLite database
- Sets up core memory sections (persona, user_info, project_context, working_notes)
- Creates project and user records

## Usage:

Run this command once when starting to use Squish in a new project:

```
/squish:init
```

After initialization, Squish will automatically:
- Capture context during your session
- Store important information you share
- Enable memory search across conversations

## Requirements:

- Node.js 18+ installed
- Write access to current directory
- No additional setup needed

## Notes:

- Safe to run multiple times (checks if already initialized)
- All data stored locally in `.squish/` directory
- Can be deleted anytime to reset memory
