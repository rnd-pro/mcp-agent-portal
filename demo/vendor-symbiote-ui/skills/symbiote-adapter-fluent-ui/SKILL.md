---
name: symbiote-adapter-fluent-ui
description: >
  Adapt Microsoft Fluent UI, Fluent Web Components, or FAST behavior into
  native symbiote-ui components. Use for enterprise desktop UX, command bars, menus,
  nav, trees, dialogs, high-contrast support, keyboard behavior, focus
  management, and status patterns while translating Fluent/FAST CSS behavior
  into Symbiote cascade themes without copying Fluent React/FAST code, token
  names, docs, icons, class names, or Microsoft visual identity.
license: MIT
compatibility: Use with symbiote-library-adapter in the symbiote-ui repository.
---

# Symbiote Adapter: Fluent UI

## Required Baseline

Before implementing any component adaptation using this skill:
1. Load and follow the core instructions in [skills/symbiote-library-adapter/SKILL.md](../symbiote-library-adapter/SKILL.md).
2. Create and fill `tmp/<source-library>-<component-or-cluster>-functional-comparison.md` from [skills/symbiote-library-adapter/references/functional-comparison-checklist.md](../symbiote-library-adapter/references/functional-comparison-checklist.md). Use this library slug for `<source-library>`: `fluent-ui`.
3. Complete the `Symbiote Instruction Sources` section in that checklist first.
4. Implementation must not start until the comparison is complete, verified, and every meaningful row has source evidence, local Symbiote reference, and verification method.
5. In case of conflicts, Symbiote/project rules always win.

Use Fluent as an enterprise desktop and productivity-app reference, especially
for command surfaces, navigation, accessibility, and high-contrast behavior.

## Best Reference Areas

- Command bars, toolbars, menus, split buttons, overflow menus, and app-like
  navigation.
- Tree, list, tabs, dialog, drawer, tooltip, toast, badge, persona/avatar, and
  data display patterns.
- Keyboard navigation, focus rings, focus trapping, and typeahead.
- High contrast, forced colors, density, and enterprise accessibility support.

## Preserve

- Desktop-grade keyboard and focus behavior.
- Dense command surfaces and overflow handling.
- High-contrast and forced-colors compatibility where applicable.
- Clear separation between navigation, command, selection, and status.

## Do Not Copy

- Fluent React code, FAST code, stylesheet text, token names, class names, docs
  text, icons, demo markup, or Microsoft visual identity.
- Fluent design language as the default Symbiote theme.
- Product-specific Microsoft app assumptions.

## Symbiote Mapping

- Convert command patterns into Symbiote toolbar/menu/action-zone primitives and
  host-owned intents.
- Map forced-colors and contrast behavior into generic CSS and theme
  adaptation.
- Translate Fluent CSS state, density, focus, and high-contrast behavior into
  Symbiote-owned `rootStyles` and cascade tokens.
- Use existing layout/sidebar/project-tabs/menu components before adding new
  primitives.
- Keep reusable command metadata clear enough for agents to discover actions.

## Verification

- Test keyboard navigation, focus visibility, disabled state, and overflow
  behavior.
- Check forced-colors/high-contrast CSS where the component owns visuals.
- Verify agent-facing metadata describes command roles and host-owned actions.
