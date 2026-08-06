# State-to-Cascade CSS Induction Reference

Documentation for the pattern where backend engine state is reflected directly
as CSS visual effects through HTML attribute selectors.

## Concept

Symbiote UI uses `data-engine-state` attributes as a CSS induction bridge:

1. **Backend sets state** → JS updates the attribute.
2. **CSS detects attribute** → Attribute selectors activate themed styles.
3. **No JS animation logic** → Pure CSS transitions/animations handle visuals.

This eliminates JavaScript-driven animation loops and keeps state visualization
declarative and themeable.

## Setting Engine State

From JavaScript:

```javascript
import { applyRuntimeUiState } from 'symbiote-ui/runtime';

applyRuntimeUiState(panelElement, {
  attrs: { 'data-engine-state': 'running' }
});
```

Or via WebSocket:

```json
{
  "method": "update",
  "params": {
    "id": "monitor-panel",
    "state": {
      "attrs": { "data-engine-state": "error" }
    }
  }
}
```

Or via Agent Intent:

```json
{
  "type": "state",
  "params": {
    "id": "monitor-panel",
    "state": {
      "attrs": { "data-engine-state": "success" }
    }
  }
}
```

## CSS Selectors

The theme provider CSS (`default-provider.css`) contains rules like:

```css
/* Idle — neutral, no special styling */
[data-engine-state="idle"] {
  /* inherits default theme tokens */
}

/* Running — animated pulse on accent */
[data-engine-state="running"] {
  background: color-mix(in oklch, var(--sn-sys-surface) 92%, oklch(0.7 0.15 var(--sn-theme-hue)));
  animation: sn-engine-pulse 2s ease-in-out infinite;
}

@keyframes sn-engine-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.85; }
}

/* Success — green tint */
[data-engine-state="success"] {
  background: color-mix(in oklch, var(--sn-sys-surface) 90%, oklch(0.65 0.18 var(--sn-hue-success)));
}

/* Error — red/danger tint */
[data-engine-state="error"] {
  background: color-mix(in oklch, var(--sn-sys-surface) 88%, oklch(0.55 0.22 var(--sn-hue-danger)));
}

/* Paused — dimmed */
[data-engine-state="paused"] {
  opacity: 0.7;
  filter: saturate(0.6);
}
```

## color-mix() Approach

The `color-mix()` function blends the theme background with semantic status
colors, ensuring:

- **Theme awareness** — the blend adapts to any color preset.
- **Subtlety** — 88-92% of the original background is preserved.
- **Consistency** — uses the same hue rotation tokens (`--sn-hue-success`, `--sn-hue-danger`).

## State Lifecycle

```
idle ──→ running ──→ success
                 └──→ error
                 └──→ paused ──→ running
```

Agents should always set state via `applyRuntimeUiState` or via the WebSocket
protocol. Direct DOM manipulation (`element.setAttribute`) works but bypasses
intent tracking.

## Composition with Themes

State CSS is **additive** — it layers on top of whatever cascade theme is applied:

```javascript
// 1. Apply theme
applyThemePresets(panel, { color: 'pcb', skin: 'compact' });

// 2. Set state — the green PCB theme gets a subtle status overlay
applyRuntimeUiState(panel, { attrs: { 'data-engine-state': 'running' } });
```

The `color-mix()` blends use `var(--sn-sys-surface)` which already holds the themed
background, so the state overlay respects the current theme automatically.

## Integration with Intent Orchestrator

State changes via the intent orchestrator support automatic rollback:

```json
{
  "version": "agent-intent-v1",
  "intentId": "activate-monitor",
  "operations": [
    {
      "type": "state",
      "params": {
        "id": "monitor-panel",
        "state": { "attrs": { "data-engine-state": "running" } }
      }
    }
  ]
}
```

If the intent fails at a later operation, the state attribute is restored
to its original value (e.g., `idle`).

## Custom States

You can define your own `data-engine-state` values and add CSS rules:

```css
[data-engine-state="syncing"] {
  background: color-mix(in oklch, var(--sn-sys-surface) 90%, oklch(0.6 0.12 var(--sn-hue-data)));
  animation: sn-engine-pulse 1.5s ease-in-out infinite;
}

[data-engine-state="warning"] {
  background: color-mix(in oklch, var(--sn-sys-surface) 88%, oklch(0.7 0.18 var(--sn-hue-warning)));
}
```

The `sn-engine-pulse` keyframe animation is shared and can be reused for any
pulsing state.
