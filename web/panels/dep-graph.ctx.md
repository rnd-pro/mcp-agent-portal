# dep-graph.js

## Notes
- Visual dependency graph panel for the active project.
- Supports structured and flat graph modes, hash focus, drill-down, path style switching, directory frames, and force-layout for large graphs.
- Uses helper modules for graph build/cache, layout, routing, UI decisions, and focus behavior.

## Follow-ups
- Keep browser smoke coverage around hash focus and path-style switching after graph changes.
- Continue extracting pure helpers before changing layout behavior.

## Decisions
- Large flat graphs start force layout before DOM-size pass so users get live feedback.
- Graph cache is keyed by structured vs flat mode.
