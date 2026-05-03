---
name: "Debug Protocol: Hypothesize"
workflow: debug_protocol
tags:
  - debug
  - hypothesize-step
group: heavy-thinkers
description: "Formulate a single, concrete, falsifiable hypothesis about the root cause."
transitions:
  verify:
    require_tags: [debug, verify-hypothesis-step]
  need_more_data:
    require_tags: [debug, localize-step]
  abort:
    require_tags: [debug, abort]
---

# Step 3: Formulate Hypothesis

You have narrowed down the search area. Now formulate **one concrete hypothesis**.

## Task

State your hypothesis in the format:

> **The problem is [X] because [evidence Y].**

### Rules

- ONE hypothesis at a time. Do not list 5 alternatives.
- The hypothesis MUST be falsifiable — you must be able to test it.
- If you cannot formulate a hypothesis — you need more data, go back to localization.

## Response Options

- `verify` — hypothesis formulated, ready to test it
- `need_more_data` — insufficient data, need to return to localization
- `abort` — exit the protocol
