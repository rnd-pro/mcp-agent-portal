---
name: "Debug Protocol: Verify Hypothesis"
workflow: debug_protocol
tags:
  - debug
  - verify-hypothesis-step
group: fast-workers
description: "Test the hypothesis with minimal intervention. Confirm or deny."
transitions:
  confirmed:
    require_tags: [debug, fix-step]
  denied:
    require_tags: [debug, localize-step]
  abort:
    require_tags: [debug, abort]
---

# Step 4: Verify Hypothesis

You have a hypothesis. Now **test it with minimal intervention**.

## Task

1. Add a **targeted** log, conditional check, or small code change.
2. Run the test / reproduce the error.
3. Compare the result with the expected outcome.

### Rules

- Do **NOT fix** the bug at this step — only verify the hypothesis.
- If the hypothesis is denied — return to localization with new information.
- Maximum 3 verification attempts. If not confirmed after 3 — stop and report.

## Response Options

- `confirmed` — hypothesis confirmed, proceed to fix
- `denied` — hypothesis denied, need to return to localization
- `abort` — exit the protocol
