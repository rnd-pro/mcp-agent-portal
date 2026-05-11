# tool-index.js

## Notes
- Cached registry of tools exposed by all child MCP servers.
- Rebuilds by calling `tools/list` on each child server.
- Supports search by keyword, tag, or server name.

## Follow-ups
- Rebuild after child server topology changes.

## Decisions
- Stores summary entries only: tool object plus originating server.
- User-defined tag maps are injected from configuration rather than inferred.
