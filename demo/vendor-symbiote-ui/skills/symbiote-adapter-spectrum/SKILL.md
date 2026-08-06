---
name: symbiote-adapter-spectrum
description: >
  Adapt Adobe Spectrum Web Components patterns into native symbiote-ui
  components. Use for professional tool UI density, accessibility behavior,
  field/help/error anatomy, overlays, action groups, status lights, side nav,
  split view, color controls, and desktop-grade component polish by translating
  Spectrum CSS behavior into Symbiote cascade themes without copying Spectrum
  source, docs, token names, tags, or Adobe visual identity.
license: MIT
compatibility: Use with symbiote-library-adapter in the symbiote-ui repository.
---

# Symbiote Adapter: Spectrum Web Components

## Required Baseline

Before implementing any component adaptation using this skill:
1. Load and follow the core instructions in [skills/symbiote-library-adapter/SKILL.md](../symbiote-library-adapter/SKILL.md).
2. Create and fill `tmp/<source-library>-<component-or-cluster>-functional-comparison.md` from [skills/symbiote-library-adapter/references/functional-comparison-checklist.md](../symbiote-library-adapter/references/functional-comparison-checklist.md). Use this library slug for `<source-library>`: `spectrum`.
3. Complete the `Symbiote Instruction Sources` section in that checklist first.
4. Implementation must not start until the comparison is complete, verified, and every meaningful row has source evidence, local Symbiote reference, and verification method.
5. In case of conflicts, Symbiote/project rules always win.

Use Spectrum as a professional application UX reference. It is especially
useful when the target Symbiote component belongs in dense workspaces, editors,
inspectors, media tools, or operational panels.

## Best Reference Areas

- Accessible field anatomy: label, help text, invalid state, quiet state, and
  required state.
- Action button/action group/action menu behavior for compact toolbars.
- Overlay, dialog, popover, tray, tooltip, and contextual help behavior.
- Status light, progress, meter, tags, swatches, color controls, and picker
  patterns.
- Side navigation, tabs, split view, table, and workflow-oriented layout.

## Preserve

- Professional density and repeated-use ergonomics.
- Strong keyboard and screen-reader defaults.
- Clear separation between action, selection, navigation, and status.
- Compact variants and low-noise visual hierarchy.
- Error, warning, informational, and success semantics.

## Do Not Copy

- `sp-*` tag names, Spectrum token names, stylesheet text, Lit implementation,
  docs text, or exact component anatomy.
- Adobe brand language, icons, colors, naming, or visual identity.
- Shadow DOM usage as a default assumption. Symbiote prefers Light DOM unless
  isolation is necessary.

## Symbiote Mapping

- Translate Spectrum density into Symbiote skin presets and `--sn-*` spacing,
  outline, type, and motion tokens.
- Translate Spectrum CSS behavior into Symbiote `rootStyles`, keeping focus,
  contrast, density, and validation affordances.
- Convert field anatomy into reusable Symbiote slots or properties that match
  existing `sn-field` behavior.
- Use intent events for actions that the host owns.
- Keep status and validation as generic states, not Spectrum-specific variants.

## Verification

- Test keyboard navigation, labels, invalid/help text, disabled state, and
  status semantics.
- Verify compact and regular density through cascade theme presets.
- Check that the component still reads as Symbiote, not Spectrum.
