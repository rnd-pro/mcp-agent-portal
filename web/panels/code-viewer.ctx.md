# code-viewer.js

## Notes
- Main file display panel for source, markdown, image, binary, and directory selections.
- Loads compact/raw file data through `app.api()`.
- JS files support source/compact or source/expanded modes depending on whether `.ctx` docs exist.
- Markdown opens rendered by default with a source toggle.

## Follow-ups
- Keep extension-to-language mapping aligned with CodeBlock rendering support.
- Recheck transformed mode whenever project-graph compact/expand contracts change.

## Decisions
- File loading stays in CodeViewer; rendering stays in CodeBlock.
- `Show in Graph` navigates to `#graph` with `focus` while preserving the active route query, including `project`.
