---
name: symbiote-adapter-mui
description: >
  Adapt Material UI (MUI) behavior and component taxonomy into native
  symbiote-ui components. Use for React Material component parity research,
  variant/state matrices, slot-style customization ideas, form/control behavior,
  table and data display patterns, and Material design comparison while
  translating style behavior into Symbiote cascade themes without copying React
  code, Emotion styles, MUI classes, docs, theme object shape, or paid MUI X
  features.
license: MIT
compatibility: Use with symbiote-library-adapter in the symbiote-ui repository.
---

# Symbiote Adapter: MUI

## Required Baseline

Before implementing any component adaptation using this skill:
1. Load and follow the core instructions in [skills/symbiote-library-adapter/SKILL.md](../symbiote-library-adapter/SKILL.md).
2. Create and fill `tmp/<source-library>-<component-or-cluster>-functional-comparison.md` from [skills/symbiote-library-adapter/references/functional-comparison-checklist.md](../symbiote-library-adapter/references/functional-comparison-checklist.md). Use this library slug for `<source-library>`: `mui`.
3. Complete the `Symbiote Instruction Sources` section in that checklist first.
4. Implementation must not start until the comparison is complete, verified, and every meaningful row has source evidence, local Symbiote reference, and verification method.
5. In case of conflicts, Symbiote/project rules always win.

Use MUI as a popular React component taxonomy and behavior reference. Do not use
it as a technical architecture reference for Symbiote.

## Best Reference Areas

- Component coverage and naming taxonomy.
- Variant and state matrices for common controls.
- Form controls, validation, helper text, labels, adornments, and disabled
  states.
- Data display patterns: tables, lists, cards, badges, alerts, progress, and
  skeletons.
- Customization concepts such as slots and variants, translated into Symbiote
  slots and tokens.

## Preserve

- Common user expectations for Material-like controls.
- Clear state coverage across size, color intent, disabled, loading, selected,
  expanded, invalid, and error states.
- A distinction between component-owned state and host-owned controlled state.
- Useful API ergonomics only when they remain generic.

## Do Not Copy

- React component code, hooks, Emotion/styled implementation, stylesheet text,
  CSS class names, theme object structure, docs text, demo markup, or Material
  visual details.
- MUI X paid/pro features, Data Grid internals, or proprietary examples without
  explicit license review.
- One-to-one React prop parity when it conflicts with Custom Elements or
  Symbiote runtime contracts.

## Symbiote Mapping

- Convert React props into reflected attributes, properties, slots, and intent
  events.
- Convert `slotProps` ideas into stable slots, parts, or documented attributes.
- Use Symbiote cascade tokens for color, density, outline, type, and motion.
- Translate MUI style states into native `rootStyles`; do not reproduce class
  contracts or theme object structure.
- Keep complex product workflows out of reusable UI components.

## Verification

- Test native element usage without React.
- Test controlled and uncontrolled state boundaries where applicable.
- Verify metadata explains how agents should choose the Symbiote component over
  a product-local fork.
