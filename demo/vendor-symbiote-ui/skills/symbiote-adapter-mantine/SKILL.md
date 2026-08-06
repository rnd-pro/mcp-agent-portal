---
name: symbiote-adapter-mantine
description: >
  Adapt Mantine component ergonomics into native symbiote-ui components. Use for
  modern React component coverage, controlled/uncontrolled state patterns,
  composable overlays, command palettes, notifications, form controls, dates,
  hooks-as-behavior research, and clear prop ergonomics while translating style
  behavior into Symbiote cascade themes without copying Mantine React code,
  hooks, Styles API, docs, examples, token names, or visual identity.
license: MIT
compatibility: Use with symbiote-library-adapter in the symbiote-ui repository.
---

# Symbiote Adapter: Mantine

## Required Baseline

Before implementing any component adaptation using this skill:
1. Load and follow the core instructions in [skills/symbiote-library-adapter/SKILL.md](../symbiote-library-adapter/SKILL.md).
2. Create and fill `tmp/<source-library>-<component-or-cluster>-functional-comparison.md` from [skills/symbiote-library-adapter/references/functional-comparison-checklist.md](../symbiote-library-adapter/references/functional-comparison-checklist.md). Use this library slug for `<source-library>`: `mantine`.
3. Complete the `Symbiote Instruction Sources` section in that checklist first.
4. Implementation must not start until the comparison is complete, verified, and every meaningful row has source evidence, local Symbiote reference, and verification method.
5. In case of conflicts, Symbiote/project rules always win.

Use Mantine as a broad modern React ergonomics reference. Translate concepts
into Custom Elements, not hooks or React component APIs.

## Best Reference Areas

- Controlled and uncontrolled component behavior.
- Overlay, modal, drawer, popover, tooltip, menu, combobox, and command palette
  ergonomics.
- Form inputs, validation, number/date/time controls, segmented controls, tabs,
  accordion, and notifications.
- Practical defaults for sizes, variants, disabled/loading states, and
  data-heavy admin components.

## Preserve

- Simple authoring ergonomics.
- Clear separation between value, default value, and host-owned changes.
- Useful state coverage for loading, disabled, invalid, required, selected,
  expanded, and checked.
- Compact variants suitable for tool UI.

## Do Not Copy

- React hooks, component code, Styles API, stylesheet text, CSS modules, token
  names, docs text, example markup, or visual identity.
- Hook-level behavior as public Symbiote API.
- Mantine prop names when they do not fit Custom Elements.

## Symbiote Mapping

- Convert controlled/uncontrolled behavior into properties, reflected attrs,
  and value-change intent events.
- Convert hook behavior into internal helpers only when reusable and
  product-neutral.
- Map sizes and variants through `--sn-*` density, type, outline, and color
  tokens.
- Translate Mantine style behavior into native `rootStyles`, not a Styles API
  clone.
- Prefer existing overlay, toolbar, field, list, and display components.

## Verification

- Test value/default-value boundaries where applicable.
- Test overlay lifecycle, focus, dismissal, and event payloads.
- Verify no React-only concept leaks into public metadata.
