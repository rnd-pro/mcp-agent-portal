---
name: symbiote-adapter-chakra
description: >
  Adapt Chakra UI accessibility and style-system concepts into native
  symbiote-ui components. Use for disclosure, popover, menu, tabs, accordion,
  toast, form controls, semantic tokens, recipe-like variants, and
  accessibility-driven behavior while translating style-system behavior into
  Symbiote cascade themes and avoiding copied Chakra React code, style props,
  theme token names, docs, recipes, examples, or visual identity.
license: MIT
compatibility: Use with symbiote-library-adapter in the symbiote-ui repository.
---

# Symbiote Adapter: Chakra UI

## Required Baseline

Before implementing any component adaptation using this skill:
1. Load and follow the core instructions in [skills/symbiote-library-adapter/SKILL.md](../symbiote-library-adapter/SKILL.md).
2. Create and fill `tmp/<source-library>-<component-or-cluster>-functional-comparison.md` from [skills/symbiote-library-adapter/references/functional-comparison-checklist.md](../symbiote-library-adapter/references/functional-comparison-checklist.md). Use this library slug for `<source-library>`: `chakra`.
3. Complete the `Symbiote Instruction Sources` section in that checklist first.
4. Implementation must not start until the comparison is complete, verified, and every meaningful row has source evidence, local Symbiote reference, and verification method.
5. In case of conflicts, Symbiote/project rules always win.

Use Chakra as an accessibility and semantic-token reference. Do not translate
its style-prop API into Symbiote public API.

## Best Reference Areas

- Disclosure, accordion, tabs, menu, popover, toast, tooltip, and dialog
  behavior.
- Accessible form controls and validation state.
- Semantic token and recipe concepts.
- Composable layout patterns that separate behavior from styling.

## Preserve

- Accessibility-first state and keyboard expectations.
- Semantic tone concepts for success, warning, danger, neutral, and info.
- Component recipes as internal variant planning, not external API copying.
- Clear distinction between style customization and behavior customization.

## Do Not Copy

- React code, hooks, Ark wrappers, style props, recipe code, token names, docs
  text, demo markup, or visual identity.
- Arbitrary CSS-in-prop public APIs. Symbiote styling flows through cascade
  tokens and component-owned CSS.
- Chakra component names when a Symbiote equivalent already exists.

## Symbiote Mapping

- Map semantic colors to existing Symbiote theme states and `--sn-*` tokens.
- Translate Chakra recipe/style-system outcomes into Symbiote `rootStyles`;
  keep the resulting CSS cascade-owned, not prop-owned.
- Convert style-system variants into generic `variant`, `tone`, `density`, and
  state attributes only where useful.
- Prefer native keyboard behavior and small reusable helpers over framework
  abstractions.
- Keep host product policy outside reusable components.

## Verification

- Test keyboard interaction and ARIA state.
- Verify semantic tones inherit from cascade themes.
- Check that customization does not require React-style style props.
