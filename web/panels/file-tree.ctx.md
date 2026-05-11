# file-tree.js

## Notes
- Project file tree built from the compact skeleton.
- Tracks expanded directories in localStorage.
- Emits `file-selected` for files and directory paths.
- Supports filtering, collapse-all, drag payloads, and active item highlighting.

## Follow-ups
- Keep skeleton field handling compatible with project-graph output.

## Decisions
- Tree rendering is lazy for collapsed directory children.
- Directory selections use trailing slash in emitted paths.
