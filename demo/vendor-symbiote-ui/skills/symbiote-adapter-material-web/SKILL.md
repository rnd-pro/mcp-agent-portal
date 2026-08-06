---
name: symbiote-adapter-material-web
description: >
  Adapt Google Material Web and Material Design web component behavior into
  native symbiote-ui components. Use for Google Material-style buttons, icon buttons, chips, dialogs,
  lists, menus, progress indicators, radio groups, sliders, switches, tabs, and
  text fields while translating Material CSS behavior into Symbiote cascade
  themes and avoiding copied Material Web source, docs, md-* tags, token names,
  ripple code, or Google/Material visual identity.
license: MIT
compatibility: Use with symbiote-library-adapter in the symbiote-ui repository.
---

# Symbiote Adapter: Material Web

## Required Baseline

Before implementing any component adaptation using this skill:
1. Load and follow the core instructions in [skills/symbiote-library-adapter/SKILL.md](../symbiote-library-adapter/SKILL.md).
2. Create and fill `tmp/<source-library>-<component-or-cluster>-functional-comparison.md` from [skills/symbiote-library-adapter/references/functional-comparison-checklist.md](../symbiote-library-adapter/references/functional-comparison-checklist.md). Use this library slug for `<source-library>`: `material-web`.
3. Complete the `Symbiote Instruction Sources` section in that checklist first.
4. Implementation must not start until the comparison is complete, verified, and every meaningful row has source evidence, local Symbiote reference, and verification method.
5. In case of conflicts, Symbiote/project rules always win.

Use Material Web for Material 3 behavior and control taxonomy, not as the visual
identity for Symbiote UI.

## Best Reference Areas

- Common control states for buttons, icon buttons, chips, switches, radio
  groups, sliders, tabs, text fields, menus, dialogs, and lists.
- Clear shape, tone, prominence, and interaction-state distinctions.
- Accessibility expectations for form controls and dialogs.
- Touch-friendly target sizing when Symbiote needs mobile or tablet support.

## Preserve

- Semantic variants such as filled, outlined, text, tonal, elevated, and danger
  only when they map to generic Symbiote intent.
- Disabled, focused, pressed, selected, checked, expanded, loading, and invalid
  behavior.
- Label/supporting/error text relationships for fields.
- Dialog and menu focus management expectations.

## Do Not Copy

- `md-*` tags, Material token names, exact shape system, stylesheet text,
  source code, documentation text, ripple implementation, or generated examples.
- Google brand assumptions or Material as the default Symbiote look.
- Internal framework assumptions from Material Web or related Google projects.

## Symbiote Mapping

- Map Material emphasis levels to Symbiote variants and cascade tokens.
- Translate Material CSS state layers, focus rings, shape, and density into
  Symbiote-owned tokens rather than Material variables.
- Replace ripple with Symbiote motion/state feedback unless ripple is explicitly
  required and implemented natively.
- Prefer generic names such as `variant`, `tone`, `size`, `selected`, `checked`,
  `invalid`, and `loading` when they match existing Symbiote conventions.
- Re-check current Material Web project status before treating it as a durable
  roadmap source.

## Verification

- Test form state semantics, keyboard interaction, focus restore, and label
  relationships.
- Verify theme output through Symbiote cascade tokens, not Material variables.
