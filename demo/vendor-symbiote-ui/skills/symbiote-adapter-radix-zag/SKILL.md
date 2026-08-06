---
name: symbiote-adapter-radix-zag
description: >
  Adapt headless behavior patterns from Radix Primitives and Zag.js into native
  symbiote-ui components. Use for focus management, roving tabindex, typeahead,
  controlled/uncontrolled state, dismissable layers, collision-aware overlays,
  menus, dialogs, popovers, tabs, accordions, sliders, and state machines
  without copying React APIs, machine code, data attributes, docs, or examples.
license: MIT
compatibility: Use with symbiote-library-adapter in the symbiote-ui repository.
---

# Symbiote Adapter: Radix and Zag

## Required Baseline

Before implementing any component adaptation using this skill:
1. Load and follow the core instructions in [skills/symbiote-library-adapter/SKILL.md](../symbiote-library-adapter/SKILL.md).
2. Create and fill `tmp/<source-library>-<component-or-cluster>-functional-comparison.md` from [skills/symbiote-library-adapter/references/functional-comparison-checklist.md](../symbiote-library-adapter/references/functional-comparison-checklist.md). Use this library slug for `<source-library>`: `radix-zag`.
3. Complete the `Symbiote Instruction Sources` section in that checklist first.
4. Implementation must not start until the comparison is complete, verified, and every meaningful row has source evidence, local Symbiote reference, and verification method.
5. In case of conflicts, Symbiote/project rules always win.

Use Radix and Zag as behavior references for hard interaction problems. They are
not visual references and should not shape Symbiote styling.

## Best Reference Areas

- Focus management, focus restore, focus trap, and dismissable layers.
- Roving tabindex, typeahead, orientation, RTL-aware keyboard behavior, and
  disabled item handling.
- Controlled and uncontrolled state contracts.
- Overlay positioning, collision behavior, escape/outside-click dismissal, and
  nested layers.
- Menu, dropdown, popover, dialog, tooltip, tabs, accordion, switch, radio
  group, toggle group, select, combobox, slider, and tree behavior.

## Preserve

- Interaction completeness.
- Explicit state transitions.
- Keyboard and assistive technology semantics.
- Host-controllable state where product policy owns the outcome.
- Event timing that lets hosts prevent or react to transitions when needed.

## Do Not Copy

- React component APIs, hooks, context models, state machine code, generated
  data attributes, docs text, demo markup, or examples.
- Headless part names as mandatory Symbiote public API.
- Styling assumptions from downstream libraries that use Radix or Zag.

## Symbiote Mapping

- Convert behavior machines into small native DOM controllers only when the
  behavior is shared across Symbiote components.
- Keep controller APIs internal unless multiple components need a stable
  exported primitive.
- Expose public state through attributes, properties, slots, methods, and
  intent events.
- Document keyboard behavior in provider metadata when agents need to choose or
  control the component.

## Verification

- Write interaction tests before broadening the component API.
- Test focus entry, focus restore, Escape, outside click, arrow keys, Home/End,
  typeahead, disabled items, nested layers, and controlled state where relevant.
- Verify no framework API leaked into Custom Elements metadata.
