---
description: Manage core memory (view, edit, or append to always-in-context sections)
---

# Core Memory Management

Manage always-in-context core memory sections: view all sections, edit a specific section, or append text to a section.

## Actions

### view
View all core memory sections and statistics.
- Displays all 4 sections: persona, user_info, project_context, working_notes
- Shows section sizes and modification timestamps
- No additional parameters required

### edit
Replace the entire content of a core memory section.
- Completely replaces the section content
- Use when you want to rewrite an entire section
- Includes before/after comparison in response

### append
Append text to an existing core memory section.
- Adds text to the end of a section
- Useful for incremental updates
- Preserves existing content

## Usage Examples

View all core memory:
```
/core-memory action=view projectId=my-project
```

Edit the persona section:
```
/core-memory action=edit projectId=my-project section=persona content="I am an expert developer who specializes in TypeScript and React..."
```

Append to project context:
```
/core-memory action=append projectId=my-project section=project_context text="New framework: Next.js 14 with App Router"
```

Append working notes:
```
/core-memory action=append projectId=my-project section=working_notes text="TODO: Implement authentication system"
```

## Core Memory Sections

- **persona**: Your personality, communication style, and preferences
- **user_info**: Information about you (name, experience, goals)
- **project_context**: Project structure, tech stack, and conventions
- **working_notes**: Current thoughts, TODOs, and active work items
