---
name: "Debug Protocol: Reproduce"
workflow: debug_protocol
tags:
  - debug
  - workflow-entry
  - first-step
group: fast-workers
description: "Entry point for the debug protocol. Attempt to reproduce the reported error."
transitions:
  reproduced:
    require_tags: [debug, localize-step]
  cannot_reproduce:
    require_tags: [debug, ask-user]
  abort:
    require_tags: [debug, abort]
---

# Step 1: Reproduce the Error

You are starting the debug protocol. Follow this step strictly.

## Task

Attempt to **reproduce** the described error.

1. Read the stack trace (if available) — extract: file, line number, error type, values.
2. Run the code or test to observe the error firsthand.
3. If `{{ error_context }}` is available — use it as a starting point.

## Response Options

- `reproduced` — error successfully reproduced, proceed to localization
- `cannot_reproduce` — unable to reproduce, need clarification from user
- `abort` — this is not a bug (feature, question, false alarm)
