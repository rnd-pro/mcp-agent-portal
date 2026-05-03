---
name: "Debug Protocol: Localize"
workflow: debug_protocol
tags:
  - debug
  - localize-step
group: fast-workers
description: "Narrow down the search area. Trace data flow from symptom to source."
transitions:
  hypothesis_ready:
    require_tags: [debug, hypothesize-step]
  need_instrumentation:
    require_tags: [debug, localize-step]
  abort:
    require_tags: [debug, abort]
---

# Step 2: Localize

The error is reproduced. Now **narrow down the search area**.

## Task

1. Read the stack trace bottom-to-top (specific → general).
2. Trace the data flow — where does the incorrect value come from?
3. Check recent changes: `git diff`, `git log -5`.
4. If still unclear — add **temporary instrumentation** (console.log / debug breakpoints) at suspect locations.

## Response Options

- `hypothesis_ready` — found a suspicious area, ready to formulate a hypothesis
- `need_instrumentation` — need more logging, repeating this step
- `abort` — problem is not in the code (infrastructure, data, configuration)
