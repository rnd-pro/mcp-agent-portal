# state.js

## Notes
- Lightweight browser state and monitor WebSocket client.
- Exposes `subscribe`, `onEvent`, `call`, `connect`, and `disconnect` for panels.
- Routes JSON-RPC tool calls through `/ws/monitor` and applies snapshot/patch/event messages into shared state.

## Follow-ups
- Keep timeout and reconnect behavior aligned with proxy monitor expectations.

## Decisions
- Uses a single shared WebSocket and in-memory pending call map.
- Emits both exact-path and top-level subscriptions after state patches.
