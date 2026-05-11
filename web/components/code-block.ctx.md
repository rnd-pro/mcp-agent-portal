# code-block.js

## Notes
- Reusable code and markdown display component.
- Supports source rendering, markdown rendering, images, binary placeholders, and line navigation.

## Follow-ups
- Verify new file modes against `code-viewer` before adding renderer branches.

## Decisions
- CodeViewer owns file loading and mode selection; CodeBlock owns display behavior.
