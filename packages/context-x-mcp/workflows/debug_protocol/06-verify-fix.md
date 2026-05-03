---
name: "Debug Protocol: Verify Fix"
workflow: debug_protocol
tags:
  - debug
  - verify-fix-step
group: fast-workers
description: "Final verification: bug is fixed, no regressions introduced."
transitions:
  all_pass:
    require_tags: [debug, complete]
  regression:
    require_tags: [debug, fix-step]
  abort:
    require_tags: [debug, abort]
---

# Step 6: Verify Fix

Fix applied. Now **confirm** everything works.

## Checklist

- [ ] **Original error gone?** Run the same scenario that reproduced the bug.
- [ ] **Tests pass?** Run `npm test` / test suite. If tests fail and you didn't touch them — this is a REGRESSION.
- [ ] **Related features work?** Check functionality that uses the same module / component.
- [ ] **No debris?** Make sure all `console.log`, debug `if`s and comments are removed.

## Response Options

- `all_pass` — all checks passed, bug is fixed
- `regression` — regression detected, need to return to fix
- `abort` — exit the protocol
