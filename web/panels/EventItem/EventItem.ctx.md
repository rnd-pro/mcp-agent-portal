# EventItem.js

## Notes
- Render component for dashboard tool/crash/result events.
- Formats timestamps, status icon/class, duration, and JSON argument details.
- Expands on click when details or result keys exist.

## Follow-ups
- Keep event type handling aligned with flywheel/global-tool-event payloads.

## Decisions
- Event detail JSON is generated in the component from `args`.
- Visual state is derived from event `type` and `success`.
