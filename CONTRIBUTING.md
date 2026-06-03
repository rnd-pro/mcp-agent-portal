# Contributing

`mcp-agent-portal` is an MCP control plane for tool aggregation, project tabs, agent chat, workflows, and browser-based operations.

Keep changes close to the owning area:

- MCP startup and package entrypoints: `index.js`, `bin/`, and `src/node/server/`
- Dashboard UI and browser behavior: `src/`, `demo/`, and `scripts/build-web.js`
- Reusable packages inside the workspace: `packages/`
- Public docs: `README.md` and `ARCHITECTURE.md`

Before opening a change, run the relevant checks:

```sh
npm test
```

Do not commit private coordination files, local gateway state, credentials, local paths, session logs, generated package tarballs, or temporary audits.
