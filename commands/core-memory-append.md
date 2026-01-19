# Core Memory Append

Append text to a core memory section.

## Usage
```
/core-memory-append <section> <text>
```

## Sections
- `persona` - Agent's role and capabilities
- `user_info` - User preferences and context
- `project_context` - Current project state
- `working_notes` - Temporary session notes

## Example
```
/core-memory-append working_notes "Remember: API uses OAuth2 authentication"
```

Adds text to the end of the specified section.
