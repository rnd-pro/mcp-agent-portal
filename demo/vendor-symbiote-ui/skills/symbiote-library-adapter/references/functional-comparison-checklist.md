# Functional Comparison Checklist

Use this reference before adapting any external UI component or component
cluster into `symbiote-ui`.

Copy this file into:

```text
tmp/<source-library>-<component-or-cluster>-functional-comparison.md
```

Fill the copy before implementation. Mark every item with a result, source evidence (official docs/source CSS/source tests), local Symbiote reference (components/tokens/manifests), and verification method. This file is the global reference; filled copies are scratch artifacts and should stay in gitignored `tmp/`.

## Source Package

| Item | Result |
| --- | --- |
| Source library and version |  |
| Source component or cluster |  |
| Official docs inspected |  |
| Source CSS/theme files inspected |  |
| Source behavior/tests inspected |  |
| Closest existing Symbiote component |  |
| Target Symbiote component or cluster |  |
| Explicit non-goals |  |

## Symbiote Instruction Sources

Fill this section before source-library comparison. If a source is missing,
record why and use the next available project instruction. Symbiote/project
rules override external-library conventions when they conflict.

| Source | Checked | Notes |
| --- | --- | --- |
| Active project instructions or AGENTS.md-equivalent |  |  |
| `skills/symbiote-ui/SKILL.md` |  |  |
| `skills/symbiote-ui-theming/SKILL.md` |  |  |
| Relevant library-specific adapter skill |  |  |
| `node cli.js discover` output |  |  |
| `custom-elements.json` |  |  |
| Relevant `manifest/` entries |  |  |
| Relevant `tokens/` entries |  |  |
| Relevant `rules/` entries |  |  |
| Closest existing component implementation |  |  |
| Existing tests for closest component family |  |  |
| Project context/workspace notes, if available |  |  |
| Conflicts between source library and Symbiote rules |  |  |

## Public Contract

| Check | Result (keep/adapt/drop/n/a) | Source Evidence (Docs/CSS/Tests) | Local Symbiote Reference | Verification Method |
| --- | --- | --- | --- | --- |
| Element/component names and responsibility |  |  |  |  |
| Attributes and reflected boolean attributes |  |  |  |  |
| Properties and default values |  |  |  |  |
| Public methods |  |  |  |  |
| Custom events and cancelable events |  |  |  |  |
| Event payload shape and timing |  |  |  |  |
| Slots, default content, and fallback content |  |  |  |  |
| Parts or styling hooks, if applicable |  |  |  |  |
| Controlled vs uncontrolled state |  |  |  |  |
| Form participation and value semantics |  |  |  |  |
| Validation, required, invalid, and help text |  |  |  |  |
| Localization, direction, and formatting |  |  |  |  |
| Loading, pending, async, and optimistic states |  |  |  |  |

## Behavior

| Check | Result (keep/adapt/drop/n/a) | Source Evidence (Docs/CSS/Tests) | Local Symbiote Reference | Verification Method |
| --- | --- | --- | --- | --- |
| State machine and transition rules |  |  |  |  |
| Open/close, expand/collapse, show/hide |  |  |  |  |
| Selection, checked, pressed, active, current |  |  |  |  |
| Single vs multiple selection |  |  |  |  |
| Disabled item behavior |  |  |  |  |
| Readonly behavior |  |  |  |  |
| Error and recovery behavior |  |  |  |  |
| Empty state behavior |  |  |  |  |
| Pagination, sorting, filtering, or search |  |  |  |  |
| Drag, resize, reorder, or gesture behavior |  |  |  |  |
| Overlay dismissal and outside interaction |  |  |  |  |
| Nested overlay/layer behavior |  |  |  |  |
| Scroll, overflow, and virtualized content behavior |  |  |  |  |
| Lifecycle and cleanup behavior |  |  |  |  |

## Keyboard And Focus

| Check | Result (keep/adapt/drop/n/a) | Source Evidence (Docs/CSS/Tests) | Local Symbiote Reference | Verification Method |
| --- | --- | --- | --- | --- |
| Tab order |  |  |  |  |
| Initial focus |  |  |  |  |
| Focus restore |  |  |  |  |
| Focus trap or focus containment |  |  |  |  |
| Roving tabindex |  |  |  |  |
| Arrow key behavior |  |  |  |  |
| Home/End/PageUp/PageDown behavior |  |  |  |  |
| Enter/Space behavior |  |  |  |  |
| Escape behavior |  |  |  |  |
| Typeahead behavior |  |  |  |  |
| Disabled focus behavior |  |  |  |  |
| Pointer and keyboard parity |  |  |  |  |

## Accessibility

| Check | Result (keep/adapt/drop/n/a) | Source Evidence (Docs/CSS/Tests) | Local Symbiote Reference | Verification Method |
| --- | --- | --- | --- | --- |
| Native semantic element choice |  |  |  |  |
| ARIA role |  |  |  |  |
| ARIA states and properties |  |  |  |  |
| Accessible name and description |  |  |  |  |
| Label, help text, and error text relationship |  |  |  |  |
| Live region or status announcement |  |  |  |  |
| High contrast and forced-colors behavior |  |  |  |  |
| Reduced motion behavior |  |  |  |  |
| Screen reader interaction notes |  |  |  |  |
| Touch target and pointer accessibility |  |  |  |  |

## CSS And Theme Translation

| Check | Result (keep/adapt/drop/n/a) | Source Evidence (Docs/CSS/Tests) | Local Symbiote Reference | Verification Method |
| --- | --- | --- | --- | --- |
| Layout model and display type |  |  |  |  |
| Box sizing, padding, gap, and density |  |  |  |  |
| Width, height, min/max sizing, and aspect ratio |  |  |  |  |
| Typography scale and line height |  |  |  |  |
| Icon, prefix, suffix, and adornment alignment |  |  |  |  |
| Border, outline, radius, and divider behavior |  |  |  |  |
| Background, foreground, and surface layering |  |  |  |  |
| Elevation, shadow, and overlay stacking |  |  |  |  |
| Focus ring and focus-visible styling |  |  |  |  |
| Hover, active, pressed, selected, checked states |  |  |  |  |
| Disabled, invalid, warning, success states |  |  |  |  |
| Loading, skeleton, progress, and pending visuals |  |  |  |  |
| Motion duration, easing, transform, and keyframes |  |  |  |  |
| Responsive layout and container behavior |  |  |  |  |
| Dark, light, high contrast, and forced-colors modes |  |  |  |  |
| External CSS variables mapped to `--sn-*` tokens |  |  |  |  |
| External classes/parts/keyframes replaced with Symbiote names |  |  |  |  |
| Brand-specific color, radius, type, or motion removed |  |  |  |  |

## Symbiote Mapping

| Check | Result (keep/adapt/drop/n/a) | Source Evidence (Docs/CSS/Tests) | Local Symbiote Reference | Verification Method |
| --- | --- | --- | --- | --- |
| Existing Symbiote component extended instead of forked |  |  |  |  |
| Browser code kept out of Node-safe entrypoints |  |  |  |  |
| Light DOM and `rootStyles` used by default |  |  |  |  |
| Public API uses Symbiote names and conventions |  |  |  |  |
| Host-owned behavior emits intent events |  |  |  |  |
| Product policy kept out of reusable component |  |  |  |  |
| Theme uses cascade tokens instead of hardcoded values |  |  |  |  |
| Metadata updated for manifest/discover/custom-elements |  |  |  |  |
| Tests placed in repository test layout |  |  |  |  |
| Docs updated only for current behavior |  |  |  |  |

## No-Copy Audit

| Check | Result (pass/fail) | Source/Reference Evidence | Verification Method |
| --- | --- | --- | --- |
| No source code pasted or mechanically renamed |  |  |  |
| No stylesheet text pasted or mechanically renamed |  |  |  |
| No external docs text copied into project docs/comments |  |  |  |
| No external class, token, keyframe, or tag contract copied |  |  |  |
| No brand identity copied into default Symbiote look |  |  |  |
| Paid/proprietary features excluded or explicitly approved |  |  |  |
| License and attribution risk reviewed |  |  |  |

## Required Output

- Functional comparison file in `tmp/`.
- Explicit list of kept behaviors.
- Explicit list of adapted behaviors and Symbiote mapping.
- Explicit list of dropped behaviors with reason.
- Test plan tied to the rows above.
