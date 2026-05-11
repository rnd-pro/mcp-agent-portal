# health-panel.js

## Notes
- Project health summary panel.
- Loads cached analysis summary and skeleton metrics through `app.api()`.
- Displays health score, code counts, issue counts, and cache performance.

## Follow-ups
- Guard cache hit-rate display if hits plus misses is zero.

## Decisions
- Health analysis is loaded once per panel lifecycle.
- Score color thresholds are local UI policy: good >= 80, warning >= 50, critical below 50.
