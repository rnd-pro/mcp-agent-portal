# ProjectList.js

## Notes
- Dashboard sidebar list of registered/running projects.
- Mirrors `dashboard-state.projects` and updates on `projects-updated`.
- Renders `ProjectItem` children and hides the empty state when projects exist.

## Follow-ups
- Keep project item data shape aligned with `/api/instances`.

## Decisions
- Project collection state lives in `dashboard-state.js`; this panel only renders it.
