# dashboard-state.js

## Notes
- Shared dashboard state store for projects, chats, events, open project tabs, and global CLI settings.
- Provides a browser `EventTarget` plus `emit()` for dashboard panel coordination.

## Follow-ups
- Add fields here only when multiple dashboard panels need the same state.

## Decisions
- Keeps dashboard state separate from project graph state in `web/state.js`.
- Uses simple mutable state plus custom events instead of a larger frontend store.
