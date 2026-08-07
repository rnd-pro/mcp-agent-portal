# AGENTS.md — symbiote-engine

## Project Identity

- **Layer**: backend/runtime execution library.
- **Dependency direction**: consumers use engine capabilities; engine must not depend on product shells or UI components.
- **Ownership**: graphs, executors, registries, handlers, packs, caches, persistence primitives, and server factories.

## Boundary Rules

- BLOCK: importing `symbiote-ui` browser components.
- BLOCK: importing `symbiote-workspace`.
- BLOCK: importing consumer product code.
- BLOCK: storing auth credentials, user identity, private endpoints, or secrets in graph/workflow data.
- REQUIRE: browser-safe exports stay free of `node:*` modules.
- REQUIRE: packs register through public registry APIs and remain standalone.
