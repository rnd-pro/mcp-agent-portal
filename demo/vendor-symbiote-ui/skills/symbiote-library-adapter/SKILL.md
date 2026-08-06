---
name: symbiote-library-adapter
description: >
  Adapt external UI component libraries into native symbiote-ui components
  without copying source, docs, brand identity, or public APIs wholesale.
  Use for library-to-Symbiote translation, CSS-to-cascade-theme adaptation,
  component parity audits, behavior matrices, provider metadata, manifest
  updates, and no-copy verification.
license: MIT
compatibility: symbiote-ui repository skills; requires local Symbiote UI project context.
---

# Symbiote Library Adapter

Use this skill with the relevant library-specific adapter skill when translating
an external component library into `symbiote-ui`.

## Core Rule

External libraries are functional references, not implementation sources.
Preserve useful behavior, accessibility, state coverage, and ergonomics through
native Symbiote components and provider metadata. Read source CSS when needed
to understand layout, state selectors, focus rings, density, motion, contrast,
and theme hooks, then rewrite it as Symbiote `rootStyles` using cascade tokens.
Do not paste source, docs, generated examples, brand identity, exact DOM
structure, or public API names unless the name is a generic web platform term.

## Required Context

Before adding or changing a component:

1. Run or inspect `node cli.js discover`.
2. Inspect `custom-elements.json`, relevant `manifest/`, `tokens/`, `rules/`,
   and the closest existing component directory.
3. Read `skills/symbiote-ui/SKILL.md` and `skills/symbiote-ui-theming/SKILL.md`.
4. Use the library-specific adapter skill only for source-library heuristics.
5. Complete a Symbiote feature pass: identify which current Symbiote templates,
   bindings, Light DOM slots, `rootStyles`, lifecycle hooks, state handling,
   intent events, cascade tokens, metadata, and discover contracts apply before
   writing manual DOM or CSS infrastructure.

## Mandatory Functional Comparison

Before implementation, create a scratch comparison file from
`references/functional-comparison-checklist.md`:

```text
tmp/<source-library>-<component-or-cluster>-functional-comparison.md
```

Fill the checklist from official source docs, source CSS, and the closest
existing Symbiote component. Every row must be marked `keep`, `adapt`, `drop`,
or `n/a` with a short reason. Every meaningful row must include source
evidence, local Symbiote reference, and verification method fields.
Implementation must not start while important rows or evidence fields are
blank. Fill the `Symbiote Instruction Sources` section first,
including `skills/symbiote-ui/SKILL.md`,
`skills/symbiote-ui-theming/SKILL.md`, active project instructions,
`node cli.js discover`, and relevant provider metadata.
When the source library conflicts with Symbiote rules, the stricter Symbiote or
project instruction wins. Keep filled comparison files in gitignored `tmp/` or
delete them after the stage; do not commit routine comparison scratch notes.

## Adaptation Matrix

Create a short matrix before implementation. Keep it in scratch notes or the
goal checklist unless it is durable product documentation.

| Source behavior | Symbiote contract | Verification |
| --- | --- | --- |
| Variants and states | Attribute/property names, CSS vars, state attrs | Unit tests and demo state |
| Slots and parts | Light DOM slots, `rootStyles`, optional parts | Render and slot tests |
| Events and methods | Intent events, public methods, WebMCP metadata | Event tests |
| Keyboard and focus | Native DOM behavior, roving focus, focus trap | Interaction tests |
| A11y semantics | ARIA, labels, disabled/invalid state | DOM assertions |
| Source CSS | Native `rootStyles`, generic selectors, cascade tokens | Visual/state tests |
| Theme hooks | `--sn-*` cascade tokens | Token inheritance tests |

## CSS Translation Rule

CSS is part of the component contract. Inspect it and preserve its functional
intent, but translate it instead of cloning it.

- Keep functional requirements: layout, sizing, overflow, focus visibility,
  forced-colors/high-contrast behavior, reduced motion, state selectors,
  disabled/invalid/loading visuals, overlay stacking, and responsive behavior.
- Rewrite declarations around existing Symbiote cascade variables such as
  color, density, outline, type, motion, radius, shadow, and state tokens.
- Replace external class names, part names, keyframe names, CSS variable names,
  and selector anatomy with Symbiote-owned names.
- Keep brand color, typography, radius, elevation, and animation identity out
  unless the user explicitly asks for a themed preset and the license allows it.
- If a licensed snippet is truly necessary, isolate it, preserve attribution,
  and get explicit approval before committing it. The default is a native
  rewrite.

## Symbiote Mapping Rules

- Prefer existing component families and tag conventions.
- Put browser Web Components under the appropriate browser-owned package
  folder, usually `control/`, `display/`, `layout/`, `menu/`, `toolbar/`,
  `list/`, `tree/`, `chat/`, `canvas/`, or `themes/`.
- Keep `symbiote-ui`, `symbiote-ui/core`, `symbiote-ui/runtime`, and
  `symbiote-ui/layout` Node-safe or SSR-safe according to their current rules.
- Use Light DOM, Symbiote `html` templates, declarative bindings, and
  `rootStyles` by default.
- Use CSS custom properties and existing `--sn-*` tokens before adding tokens.
- Emit explicit, schema-backed intent events for host-owned behavior.
- Add or update provider metadata, `custom-elements.json`, manifests, and
  discover output when the component contract changes.
- Functional parity beats API parity. Rename props or split responsibilities
  when the source API conflicts with Symbiote boundaries.

## No-Copy Gates

Block the implementation when any of these are true:

- Source code or stylesheet text was copied and then mechanically renamed.
- External docs text became project docs or comments.
- Branded names, visual identity, or exact token names became Symbiote public
  API without a generic reason.
- Product-specific behavior entered a reusable component.
- Browser-only imports leaked into Node-safe entrypoints.
- A paid/proprietary component, pattern, or asset shaped public code without
  explicit license review.

## Verification

For code changes, run the smallest useful set:

- `npm test`
- direct Node import checks for Node-safe entrypoints touched
- DOM tests for attributes, slots, events, keyboard, focus, and disabled states
- discover/custom-elements/manifest checks after public contract changes
- package hygiene checks before commit or publication

For documentation-only skill changes, verify file inventory, YAML frontmatter,
trigger descriptions, and public-repo hygiene.
