# Plan: webUI Enhancement (Local/Free-tier Users)

## Current Architecture

- Single Express server (`server.ts`, 793 lines, port 37777)
- Inline HTML/JS served from `GET /` endpoint
- Tailwind CDN for styling, Material Symbols for icons
- 30-second polling for data refresh
- Existing core API imports: `getRecent`, `getObservations`, `getAllProjects`, `requireProject`, `checkDatabaseHealth`
- Existing API endpoints: `/api/health`, `/api/memories`, `/api/observations`, `/api/context`, `/api/projects`
- No SSE support, no WebSocket, no build step
- Version 1.2.0 (server version, despite Squish being at 1.5.0)

## Architecture Decisions

1. **No build step**: Keep vanilla HTML/JS. No React, no bundler.
2. **SSE over polling**: Replace 30s polling with SSE for live observation stream. Keep polling as fallback for memories list.
3. **New API routes in same file**: Add new endpoints to `server.ts` to leverage existing Express app and core imports.
4. **Modular inline JS**: Organize JS into named sections/closures within the HTML, with a global state manager object.
5. **Lazy-load new sections via CSS classes**: New panels (sessions, search, project profile, resource monitor) show/hide via navigation tabs and CSS display toggles.
6. **SSE endpoint at `/api/events`**: Standard SSE with `text/event-stream` content type, sends `observation` and `memory` events.
7. **Search as a separate section**: `/api/search` endpoint bridging to core `search()`, UI in a slide-over panel.

## Priority-Ordered Tasks

### TASK-001: Add stats aggregation API endpoint
- **File**: `C:\Users\michi\Desktop\Command Center\Projects OS\squish-memory\squish\webui\server.ts`
- **Changes**: Add `GET /api/stats` route
- **Core imports to use**: `getMemoryStats` (from `../core/memory/stats.js`), `getGraphStats` (from `../core/graph/index.js`), `getProjectSignalStats` (from `../core/session/working-set.js`)
- **Response shape**:
  ```json
  {
    "status": "ok",
    "data": {
      "totalMemories": 142,
      "byType": { "observation": 80, "fact": 30, "decision": 20, "preference": 12 },
      "totalObservations": 80,
      "observationsByType": { "success": 20, "failure": 15, "fix": 25, "insight": 20 },
      "totalLinks": 45,
      "graph": { "entityCount": 62, "relationCount": 38 },
      "signal": { "captured": 200, "suppressed": 30, "sessionOnly": 50, "durable": 150 }
    }
  }
  ```
- **Complexity**: S
- **Dependencies**: None

### TASK-002: Add search API endpoint
- **File**: `C:\Users\michi\Desktop\Command Center\Projects OS\squish-memory\squish\webui\server.ts`
- **Changes**: Add `POST /api/search` route accepting `{ query, type?, tags?, limit?, projectPath? }`
- **Core imports**: `search` from `../core/memory/memories.js`
- **Response shape**:
  ```json
  {
    "status": "ok",
    "data": [{ "id": "...", "type": "observation", "content": "...", "tags": [...], "createdAt": "...", "similarity": 0.92 }],
    "count": 5
  }
  ```
- **Validation**: `query` min 2 chars, `limit` between 1-100
- **Complexity**: S
- **Dependencies**: None

### TASK-003: Add sessions API endpoint
- **File**: `C:\Users\michi\Desktop\Command Center\Projects OS\squish-memory\squish\webui\server.ts`
- **Changes**: Add `GET /api/sessions` route with optional `?projectPath=` and `?limit=` params
- **Core imports**: Direct DB query on `context_sessions` table via `getDbClient`, `deserializeMetadata`
- **Response shape**:
  ```json
  {
    "status": "ok",
    "data": [
      {
        "sessionId": "sess_abc123",
        "activeFiles": ["server.ts", "memories.ts"],
        "signalStats": { "captured": 45, "durable": 30 },
        "createdAt": "2026-05-21T10:00:00Z",
        "updatedAt": "2026-05-21T12:30:00Z"
      }
    ],
    "count": 10
  }
  ```
- **Session status**: Active = updatedAt within last 5 min, Completed = older
- **Complexity**: S
- **Dependencies**: None

### TASK-004: Add SSE endpoint for live observation stream
- **File**: `C:\Users\michi\Desktop\Command Center\Projects OS\squish-memory\squish\webui\server.ts`
- **Changes**: Add `GET /api/events` SSE endpoint
- **Design**: 
  - Requires `?projectPath=` query param
  - Sets headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
  - Polls `getRecent()` and `getObservations()` every 5 seconds internally
  - Sends `data:` events for new items (compares IDs against a cached set per connection)
  - Event types: `memory` (new memory), `observation` (new observation), `heartbeat` (every 30s)
  - Cleans up interval on `req.close`
- **Complexity**: M
- **Dependencies**: TASK-001 (stats endpoint not needed, but understanding the data model)

### TASK-005: Add project profile API endpoint
- **File**: `C:\Users\michi\Desktop\Command Center\Projects OS\squish-memory\squish\webui\server.ts`
- **Changes**: Add `GET /api/project-profile` route with `?projectPath=` param
- **Data source**: Query memories for top concepts (frequent content patterns/tags), top files (from metadata or session working sets -> activeFiles), conventions (repeated patterns in reasoning/exceptions fields)
- **Core imports**: `getAllProjects`, `getRecent`, `getDbClient`
- **Response shape**:
  ```json
  {
    "status": "ok",
    "data": {
      "topConcepts": [
        { "concept": "authentication", "count": 12 },
        { "concept": "database", "count": 8 }
      ],
      "topFiles": [
        { "file": "server.ts", "count": 10 },
        { "file": "memories.ts", "count": 7 }
      ],
      "conventions": [
        "Uses `async/await` consistently",
        "Prefer environment variables over hardcoded config"
      ]
    }
  }
  ```
- **Implementation**: Extract from session working sets' `activeFiles`, memory tags, and memory `metadata.reasoning/exceptions` fields
- **Complexity**: M
- **Dependencies**: None

### TASK-006: Refactor inline HTML into structured layout with tab navigation
- **File**: `C:\Users\michi\Desktop\Command Center\Projects OS\squish-memory\squish\webui\server.ts`
- **Changes**: 
  1. Wrap new feature sections in a tabbed navigation system
  2. Tabs: Dashboard (current view), Sessions, Search, Profile, Monitor
  3. Create a `window.SquishApp` global state manager object
  4. Keep existing Dashboard tab content unchanged
- **No visual redesign** -- keep same colors, fonts, dark theme
- **Tab implementation**: Simple button group in header area, `display: none/block` toggling for tab content divs
- **Complexity**: S
- **Dependencies**: TASK-001 through TASK-005 (needs endpoints to exist before wiring)

### TASK-007: Add Sessions panel to frontend
- **File**: `C:\Users\michi\Desktop\Command Center\Projects OS\squish-memory\squish\webui\server.ts`
- **Changes**: Add HTML section for sessions view (hidden by default, shown when Sessions tab active)
- **Functionality**:
  - `renderSessions(sessions)` - renders session list cards
  - Each session card shows: sessionId (truncated), status (Active/Completed badge), memory count, file count, last activity time
  - `loadSessions()` - fetches `/api/sessions` and calls render
  - Click on session expands to show detail: activeFiles, recentCommands, recentEvents
- **Refresh**: Polls every 15s when tab is active
- **Complexity**: M
- **Dependencies**: TASK-003, TASK-006

### TASK-008: Add Search panel to frontend
- **File**: `C:\Users\michi\Desktop\Command Center\Projects OS\squish-memory\squish\webui\server.ts`
- **Changes**: Add HTML section for search view
- **Functionality**:
  - Search input with debounce (300ms)
  - Type filter dropdown (all, observation, fact, decision, preference, note)
  - Results displayed as cards similar to existing memories list
  - Shows similarity score as a colored badge
  - `performSearch(query, type)` - POST to `/api/search`
- **Complexity**: M
- **Dependencies**: TASK-002, TASK-006

### TASK-009: Add Project Profile panel to frontend
- **File**: `C:\Users\michi\Desktop\Command Center\Projects OS\squish-memory\squish\webui\server.ts`
- **Changes**: Add HTML section for project profile view
- **Functionality**:
  - `loadProjectProfile()` - fetches `/api/project-profile`
  - Top concepts section: rendered as tag cloud (larger count = larger font)
  - Top files section: rendered as horizontal bar chart (using div widths, no charting library)
  - Conventions section: rendered as checklist items
  - Auto-refreshes on project change
- **Complexity**: M
- **Dependencies**: TASK-005, TASK-006

### TASK-010: Add Resource Monitor panel to frontend
- **File**: `C:\Users\michi\Desktop\Command Center\Projects OS\squish-memory\squish\webui\server.ts`
- **Changes**: Add HTML section for resource monitoring
- **Functionality**:
  - `loadStats()` - fetches `/api/stats`
  - Memory stats: total, by type (bar chart using divs)
  - Observation stats: total, by type
  - Signal stats: captured vs suppressed (visual gauge)
  - Graph stats: entities, relations
  - Trend indicator: compare current values with previous snapshot (store in memory)
  - No charting libraries -- pure CSS bar visualization
- **Complexity**: M
- **Dependencies**: TASK-001, TASK-006

### TASK-011: Implement SSE client for live observation feed
- **File**: `C:\Users\michi\Desktop\Command Center\Projects OS\squish-memory\squish\webui\server.ts`
- **Changes**: Add EventSource connection in frontend JS
- **Functionality**:
  - On page load, connect to `/api/events?projectPath=...`
  - On receiving `memory` event: prepend to memories list, update counters
  - On receiving `observation` event: prepend to observations list, update counters
  - On receiving `heartbeat`: update connection status indicator
  - Reconnect on disconnect with exponential backoff (1s, 2s, 4s, max 30s)
  - When paused (pause button), buffer events and bulk-add on resume
  - Replace the 30s polling interval with SSE, keep polling as fallback if SSE fails
- **Complexity**: L
- **Dependencies**: TASK-004, TASK-006

### TASK-012: Version update and documentation
- **Files**: `C:\Users\michi\Desktop\Command Center\Projects OS\squish-memory\squish\webui\server.ts`
- **Changes**: 
  1. Bump server version from `1.2.0` to `1.3.0`
  2. Update the Docs modal to include new API endpoints
  3. Add inline comment headers for each new section
- **Complexity**: S
- **Dependencies**: TASK-011

## Dependency Graph

```
TASK-001 (stats API)        TASK-002 (search API)    TASK-003 (sessions API)
    |                            |                         |
    v                            v                         v
TASK-004 (SSE endpoint)     TASK-005 (profile API)    TASK-006 (tab layout)
    |                            |                         |
    v                            v                         v
TASK-011 (SSE client)       TASK-009 (profile panel)  TASK-007 (sessions panel)
    |                                                    |
    +--- TASK-008 (search panel) -------------------------+
    |
    +--- TASK-010 (monitor panel) ------------------------+
    |
    +--- TASK-012 (version bump + docs) ------------------+
```

## Execution Order (Recommended)

1. **Phase 1 (Backend APIs)**: TASK-001, TASK-002, TASK-003, TASK-005 (can be parallel)
2. **Phase 2 (SSE + Layout)**: TASK-004, TASK-006 (sequential: SSE endpoint, then tab layout)
3. **Phase 3 (Frontend Panels)**: TASK-007, TASK-008, TASK-009, TASK-010 (can be parallel after TASK-006)
4. **Phase 4 (Live Stream)**: TASK-011 (SSE client integration, depends on all panels)
5. **Phase 5 (Polish)**: TASK-012

## Total Estimated Effort: 10-14 days

| Task | Complexity | Est. Days | Priority |
|------|-----------|-----------|----------|
| TASK-001 | S | 0.5 | P0 |
| TASK-002 | S | 0.5 | P0 |
| TASK-003 | S | 0.5 | P0 |
| TASK-004 | M | 1.5 | P1 |
| TASK-005 | M | 1.0 | P1 |
| TASK-006 | S | 1.0 | P0 |
| TASK-007 | M | 1.5 | P1 |
| TASK-008 | M | 1.0 | P1 |
| TASK-009 | M | 1.0 | P2 |
| TASK-010 | M | 1.0 | P2 |
| TASK-011 | L | 2.0 | P1 |
| TASK-012 | S | 0.5 | P3 |

## Key Arch Decisions

1. **SSE vs WebSocket**: SSE is simpler for this use case (unidirectional server-to-client). The client only needs to receive updates, not send them (search/sessions use REST).
2. **No state management library**: The app is small enough that a simple `window.SquishApp` object with state properties suffices.
3. **No chart library**: All visualizations (bar charts, gauges) use pure CSS divs. Keeps the bundle zero-overhead.
4. **Inline HTML growth**: The inline HTML will grow from ~560 lines to ~1200 lines. If it becomes unwieldy, the next refactor would extract HTML into a separate template file.
5. **Backward compatibility**: All existing endpoints and the Dashboard tab remain unchanged. New features are additive.
6. **SSE fallback**: The SSE connection has a fallback to the existing 30s polling mechanism. If EventSource fails to connect, polling continues with a console warning.
