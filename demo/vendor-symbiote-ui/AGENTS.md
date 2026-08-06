# AGENTS.md — symbiote-ui

## Project Identity

- **Layer**: reusable browser/UI provider.
- **Dependency direction**: consumers use this package; this package must not depend on product shells.
- **Ownership**: Web Components, layouts, themes, tokens, manifests, and browser-facing UI contracts.

## Boundary Rules

- BLOCK: importing consumer product code.
- BLOCK: encoding product-specific domain meaning into generic components.
- REQUIRE: reusable components expose actions, events, settings, slots, parts,
  and WebMCP affordances through public metadata where agents need them.
- REQUIRE: Node-safe entrypoints stay free of browser-only globals.
