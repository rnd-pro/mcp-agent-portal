# chat-ws-server.js

## Notes
- WebSocket handler for interactive chat traffic.
- Accepts `chat.send`, `chat.resume`, and `chat.cancel` messages from the browser.
- Creates chats/projects in StateGraph when CLI-originated requests do not have an existing chat.
- Delegates work to `agent-pool` and subscribes the client to task notifications.

## Follow-ups
- Keep delegated argument names aligned with agent-pool `delegate_task`.

## Decisions
- Chat creation is server-side so CLI and browser flows share StateGraph history.
- Task streaming is routed through `TaskRouter`; this class owns chat/task subscription maps.
