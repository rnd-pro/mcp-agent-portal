# task-router.js

## Notes
- Routes agent-pool task notifications into StateGraph and chat WebSocket clients.
- Caches early task events briefly until a browser client subscribes.
- Persists compact event summaries for recovery and delta sync.
- Fetches final task results after terminal task states.

## Follow-ups
- Keep cached event shape small enough for long-running chat histories.

## Decisions
- Broadcasts lightweight `chat.meta` deltas during streaming rather than raw task event payloads.
- Final result persistence is asynchronous after terminal notification.
