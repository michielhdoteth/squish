# Core Memory Edit

Replace entire content of a core memory section.

## Usage
```
/core-memory-edit <section> <content>
```

## Sections
- `persona` - Agent's role and capabilities
- `user_info` - User preferences and context
- `project_context` - Current project state
- `working_notes` - Temporary session notes

## Limits
- Each section: 1KB max
- Total core memory: 2KB max

## Example
```
/core-memory-edit persona "I am a senior software engineer focused on TypeScript and React development"
```
