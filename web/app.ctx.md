# app.js

## Notes
- Main browser entrypoint for Agent Portal.
- Registers panels, sections, global routing params, quick-open, project tabs, and dashboard/project scoped layouts.
- Provides `api()` as the browser-side endpoint adapter to server and MCP-backed actions.
- Resolves relative paths against the active dashboard project before calling project-graph tools.

## Follow-ups
- Keep endpoint mapping in sync with project-graph tool contracts.

## Decisions
- Browser panels call `api(endpoint, params)` instead of calling MCP tools directly.
- Layout and UI preferences persist through `common/ui-state.js`.
