# SettingsPanel.js

## Notes
- Home settings and server control panel.
- Reads project/server information, instances, model settings, Telegram settings, and server status.
- Can save settings and request stop/restart endpoints.
- Polls `/api/server-status` while mounted and clears polling on disconnect.
- Shows local-network access settings; enabling LAN bind requires backend restart.
- Shows pending LAN browser approval requests from `/api/network-auth/pending`.

## Follow-ups
- Keep provider model controls aligned with `/api/settings/models`.
- Treat stop/restart controls as high-impact UI actions.

## Decisions
- Server lifecycle controls require explicit confirmation for stop.
- Settings save tells the user to restart when changes need reload.
