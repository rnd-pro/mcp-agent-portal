# ProjectItem.js

## Notes
- Single dashboard project row.
- Links to the project route prefix and can remove a project through `/api/remove-project`.
- Confirms destructive removal through `uiConfirm`.

## Follow-ups
- Preserve route prefix compatibility with router project tabs.

## Decisions
- Removal is optimistic in the UI after the API call completes.
