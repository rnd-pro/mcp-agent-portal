---
name: symbiote-adapter-ant-design
description: >
  Adapt Ant Design or AntD enterprise UI patterns into native symbiote-ui
  components. Use for admin-console workflows, forms, tables, modals, drawers,
  notifications, steps, trees, transfer lists, upload flows, validation, empty
  states, and dense business UI behavior while translating CSS behavior into
  Symbiote cascade themes without copying Ant Design React code, token names,
  docs, icons, class names, or visual identity.
license: MIT
compatibility: Use with symbiote-library-adapter in the symbiote-ui repository.
---

# Symbiote Adapter: Ant Design

## Required Baseline

Before implementing any component adaptation using this skill:
1. Load and follow the core instructions in [skills/symbiote-library-adapter/SKILL.md](../symbiote-library-adapter/SKILL.md).
2. Create and fill `tmp/<source-library>-<component-or-cluster>-functional-comparison.md` from [skills/symbiote-library-adapter/references/functional-comparison-checklist.md](../symbiote-library-adapter/references/functional-comparison-checklist.md). Use this library slug for `<source-library>`: `ant-design`.
3. Complete the `Symbiote Instruction Sources` section in that checklist first.
4. Implementation must not start until the comparison is complete, verified, and every meaningful row has source evidence, local Symbiote reference, and verification method.
5. In case of conflicts, Symbiote/project rules always win.

Use Ant Design as an enterprise workflow reference: dense forms, tables,
feedback, navigation, and operational state.

## Best Reference Areas

- Admin and business UI composition.
- Form validation, field grouping, help text, required markers, and submit
  workflows.
- Table states: sorting, filtering, pagination, empty state, loading, row
  selection, expandable rows, and fixed columns.
- Feedback systems: alert, message, notification, modal, drawer, popconfirm,
  progress, result, and skeleton.
- Steps, tree, transfer, upload, tags, segmented controls, and cascader-like
  selection patterns.

## Preserve

- Dense, scannable workflows for repeated operational use.
- Clear feedback hierarchy and recoverable actions.
- Complete loading, empty, error, disabled, and validation states.
- Data-heavy interaction patterns that map to Symbiote workspaces.

## Do Not Copy

- Ant Design React code, stylesheet text, Less variables, token names, class
  names, icons, docs text, demo markup, or visual identity.
- One-to-one component APIs such as `Table` config objects when a smaller
  Symbiote contract is more durable.
- Product-specific enterprise assumptions inside reusable primitives.

## Symbiote Mapping

- Split large Ant-style components into Symbiote primitives when ownership is
  clearer: field, table, toolbar, filter controls, status, and action zones.
- Translate table/form/feedback CSS states into Symbiote density, outline,
  tone, and state tokens.
- Use intent events for sorting, filtering, pagination, upload, confirmation,
  and destructive actions.
- Keep data source, persistence, permissions, and irreversible operations in
  the host.
- Reuse existing `sn-data-table`, `sn-event-feed`, `sn-banner`,
  `sn-empty-state`, `panel-layout`, and list/tree components first.

## Verification

- Test loading, empty, error, disabled, and validation states.
- Test emitted intents for host-owned actions.
- Verify table and form APIs stay product-neutral and metadata-rich.
