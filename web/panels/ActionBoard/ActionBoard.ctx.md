# ActionBoard.js

## Notes
- Dashboard activity panel.
- Shows recent tool events from `dashboard-state.events`.
- Loads flywheel aggregate stats from `/api/flywheel/stats`.

## Follow-ups
- Keep flywheel stat keys aligned with server response.

## Decisions
- Event list renders newest-first by reversing dashboard state events.
