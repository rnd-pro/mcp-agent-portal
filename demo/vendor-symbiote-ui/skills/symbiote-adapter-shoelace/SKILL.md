---
name: symbiote-adapter-shoelace
description: >
  Adapt Shoelace or Web Awesome component behavior into native symbiote-ui
  components. Use when translating Web Component anatomy, reflected attributes,
  slots, custom events, form-control behavior, overlays, menus, tabs, trees, or
  split panels from Shoelace/Web Awesome while translating CSS behavior into
  Symbiote cascade themes and avoiding copied code, docs, tag names, themes,
  and brand identity.
license: MIT
compatibility: Use with symbiote-library-adapter in the symbiote-ui repository.
---

# Symbiote Adapter: Shoelace and Web Awesome

## Required Baseline

Before implementing any component adaptation using this skill:
1. Load and follow the core instructions in [skills/symbiote-library-adapter/SKILL.md](../symbiote-library-adapter/SKILL.md).
2. Create and fill `tmp/<source-library>-<component-or-cluster>-functional-comparison.md` from [skills/symbiote-library-adapter/references/functional-comparison-checklist.md](../symbiote-library-adapter/references/functional-comparison-checklist.md). Use this library slug for `<source-library>`: `shoelace`.
3. Complete the `Symbiote Instruction Sources` section in that checklist first.
4. Implementation must not start until the comparison is complete, verified, and every meaningful row has source evidence, local Symbiote reference, and verification method.
5. In case of conflicts, Symbiote/project rules always win.

Use Shoelace/Web Awesome as a Web Components contract reference, not as a
dependency or source template.

## Best Reference Areas

- Custom Element anatomy and HTML ergonomics.
- Reflected attributes, boolean states, methods, and custom events.
- Slot patterns for icons, labels, prefixes, suffixes, menu triggers, and
  structured child items.
- Form-associated controls, validation states, disabled states, and help text.
- Overlay primitives: dialog, drawer, dropdown, tooltip, popup, and split panel.
- Localization and formatting utilities when a Symbiote component needs the
  same kind of host-neutral capability.

## Preserve

- Clear HTML authoring model.
- State coverage for `disabled`, `checked`, `selected`, `open`, `invalid`,
  `loading`, `placement`, and comparable generic states when relevant.
- Keyboard behavior for disclosure, menus, tabs, tree items, and form controls.
- Event semantics that separate before/after transitions when useful.
- Slot-driven composition where the host should own content.

## Do Not Copy

- `sl-*` or `wa-*` tag names as public Symbiote API.
- Shoelace/Web Awesome source, stylesheet text, token names, animation names,
  docs text, or demo markup.
- Autoloader behavior, CDN assumptions, icon registry behavior, or theme file
  structure.
- Web Awesome Pro-only patterns or components without explicit license review.

## Symbiote Mapping

- Map source custom events to Symbiote intent events only when the host needs to
  react. Keep internal lifecycle events private.
- Map external CSS variables to existing `--sn-*` cascade tokens or introduce
  generic Symbiote tokens.
- Translate source CSS selectors and state styling into Symbiote-owned
  `rootStyles`; preserve functional state coverage, not visual identity.
- Keep slots only when they are stable authoring surfaces. Prefer properties for
  component-owned primitive values.
- Use existing Symbiote components first: `sn-button`, `sn-field`,
  `sn-list-item`, `sn-tree-view`, `sn-card`, `sn-badge`, `context-menu`,
  `panel-layout`, and related families.

## Verification

- Render basic HTML usage without framework glue.
- Test reflected attributes, boolean states, slots, event dispatch, disabled
  behavior, and keyboard interaction.
- Verify metadata describes slots, attrs, events, and intended workspace role.
