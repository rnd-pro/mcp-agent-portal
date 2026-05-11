# highlight.js

## Notes
- Syntax highlighting helper used by code display surfaces.
- Maps lightweight language identifiers to rendered HTML styles for source previews.

## Follow-ups
- Keep language mapping aligned with `code-viewer` language detection.

## Decisions
- Highlighting stays browser-local; file loading and transformations stay behind `app.api()`.
