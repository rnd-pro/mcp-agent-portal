---
name: "Meta: Skill Reflection"
workflow: meta
tags:
  - orchestrator
  - post-workflow
  - skill-reflect
description: "Orchestrator-level step. After any workflow completes, evaluate if the experience should be saved as a skill."
transitions: {}
---

# Step 8: Skill Reflection 🧠

The debug protocol is complete. Before closing, **reflect** on whether the knowledge gained is worth persisting.

## Evaluation Criteria

Answer these questions:

1. **Was this non-trivial?** Did you use 5+ tool calls, hit dead ends, or discover something unexpected?
2. **Is this reusable?** Would the same pattern apply to future bugs in this codebase or similar projects?
3. **Did the user correct you?** If so, the correction is high-value knowledge.

## Decision Matrix

| Condition | Action |
|---|---|
| Bug was trivial (typo, missing import) | **Skip** — not worth a skill |
| Found a non-obvious root cause pattern | **Create** a new skill documenting the pattern |
| An existing skill covers this area but missed this case | **Update** the existing skill with the new edge case |
| The user taught you a better approach | **Create or update** with the user's approach |

## If Creating / Updating

Use `save_skill` with:
- **filename**: `skills/<category>/<descriptive-name>.md`
- **content**: Follow the SKILL.md format:

```markdown
---
name: <skill-name>
description: <one-line summary>
tags: [<relevant>, <tags>]
---

# <Skill Title>

## When to Use
<trigger conditions>

## Procedure
1. <step>
2. <step>

## Pitfalls
- <known failure modes>

## Verification
<how to confirm it worked>
```

## Response

1. **Decide:** Describe your decision (`skip`, `created <skill-name>`, `updated <skill-name>`).
2. **Execute:** If creating or updating, call the `save_skill` tool.
3. **Log Feedback:** Finally, YOU MUST call the `log_feedback` tool to save this trajectory to the ML Flywheel.
   - `outcome`: `success`, `partial`, or `failed`
   - `skill_created`: The name of the skill, or `null` if you skipped.
