---
name: "Debug Protocol: Fix"
workflow: debug_protocol
tags:
  - debug
  - fix-step
group: fast-workers
description: "Apply the minimal fix addressing the root cause. No refactoring."
transitions:
  fixed:
    require_tags: [debug, verify-fix-step]
  abort:
    require_tags: [debug, abort]
---

# Step 5: Apply Fix

Hypothesis confirmed. Now apply the **minimal fix**.

## Task

1. Fix **only** the root cause.
2. Remove all temporary instrumentation (logs, debug breakpoints) from steps 2–4.

### Rules

- **MINIMAL** diff. Every changed line is a potential bug.
- Do **NOT refactor** surrounding code "while you're at it".
- Do **NOT add** features that were not requested.
- The fix must address the **root cause**, not mask the symptom.

## Response Options

- `fixed` — fix applied, proceed to verification
- `abort` — exit the protocol
