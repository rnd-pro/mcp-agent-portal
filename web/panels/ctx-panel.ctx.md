# ctx-panel.js

## Notes
- Documentation side panel for selected files.
- Loads `.ctx` documentation through `/api/docs`.
- Builds an exports outline from the current skeleton when available.
- Formats compact context lines into simple HTML blocks.

## Follow-ups
- Keep formatting rules compatible with generated `.ctx.md` dialect.

## Decisions
- Missing docs render as empty-state messages rather than errors.
- Outline data comes from skeleton export maps, not from parsed source at display time.
