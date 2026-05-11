# quick-open.js

## Notes
- Global file search overlay opened with Cmd/Ctrl+K.
- Builds a file list from the loaded skeleton and ranks matches with a local fuzzy score.
- Emits `file-selected` and updates explorer hash when a result is chosen.

## Follow-ups
- Keep skeleton file extraction compatible with compact project-graph skeleton fields.

## Decisions
- Search runs entirely client-side over the current skeleton.
- Result count is capped to keep keyboard navigation fast.
