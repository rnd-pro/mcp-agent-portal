# dashboard.js

## Notes
- Legacy context placeholder for the home dashboard surface.
- Current dashboard composition lives in `router-registry.js` and panel modules under `web/panels/`.

## Follow-ups
- Remove or regenerate if no `web/dashboard.js` module is restored.

## Decisions
- Dashboard panels are registered through the router layout registry, not a standalone dashboard module.
