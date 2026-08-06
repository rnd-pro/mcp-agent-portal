# Theme Layers Reference

Detailed CSS custom property reference for each layer of the Symbiote UI
cascade theme system.

## Architecture

```
applyCascadeTheme(element, options)
       │
       ├── Layer 1: COLOR  →  --sn-sys-surface, --sn-sys-on-surface, --sn-hue-*, --sn-lit-*, ...
       ├── Layer 2: SKIN   →  --sn-theme-density, --sn-node-*, --sn-layout-*, ...
       └── Layer 3: MOTION →  --sn-transition-*, --sn-theme-motion-scale
```

All tokens are set as CSS custom properties on the target element's `style`.
They inherit to all descendants via the CSS cascade.

## Layer 1: Color Tokens

### Root Parameters

| Token | Example Value | Source |
|-------|---------------|--------|
| `--sn-theme-name` | `'cascade-theme'` | Always |
| `--sn-theme-hue` | `'218'` | `options.hue` |
| `--sn-theme-chroma` | `'89%'` | `options.chroma` |
| `--sn-theme-bg-lightness` | `'10.0%'` | Computed from `mode` + `brightness` |
| `--sn-theme-surface-lightness` | `'15.1%'` | Computed from `mode` + `contrast` |
| `--sn-theme-text-lightness` | `'98.0%'` | Computed from `mode` + `contrast` |
| `color-scheme` | `'dark'` or `'light'` | `options.mode` |

### Semantic Surfaces

| Token | Purpose |
|-------|---------|
| `--sn-sys-surface` | Page/app background |
| `--sn-sys-surface-panel` | Panel/card backgrounds |
| `--sn-sys-surface-sunken` | Layout container (inherits `--sn-sys-surface`) |
| `--sn-sys-surface-raised` | Graph node and generic raised surfaces |
| `--sn-sys-surface-overlay` | Context menu background |
| `--sn-sys-on-surface` | Primary text color |
| `--sn-sys-on-surface-dim` | Secondary/muted text |

### Semantic Hue Rotation

Derived from the base `hue` by fixed offsets:

| Token | Offset | Example |
|-------|--------|---------|
| `--sn-hue-accent` | `+0°` | Primary brand |
| `--sn-hue-success` | `-96°` | Green/positive |
| `--sn-hue-warning` | `+178°` | Orange/caution |
| `--sn-hue-danger` | `+146°` | Red/error |
| `--sn-hue-data` | `-30°` | Data/info |

### UI-Specific Colors

| Group | Tokens |
|-------|--------|
| **Buttons** | `--sn-button-primary-bg`, `--sn-button-primary-border`, `--sn-button-primary-color`, `--sn-button-success-*`, `--sn-button-danger-hover-*` |
| **Chat** | `--sn-chat-bg`, `--sn-chat-message-bg`, `--sn-chat-user-message-bg`, `--sn-chat-agent-message-bg` |
| **Composer** | `--sn-composer-bg`, `--sn-composer-action-bg`, `--sn-composer-send-hover-bg` |
| **Syntax** | `--sn-syntax-keyword`, `--sn-syntax-string`, `--sn-syntax-comment`, `--sn-syntax-function`, `--sn-syntax-property` |
| **Scrollbar** | `--sn-scrollbar-thumb`, `--sn-scrollbar-thumb-hover` |
| **Cell** | `--sn-cell-bg`, `--sn-cell-dot`, `--sn-cell-base-alpha`, `--sn-cell-glare`, `--sn-cell-noise` |

### Graph Node Type Colors

Computed from hue rotation + accent lightness:

| Token | Hue Offset | Purpose |
|-------|------------|---------|
| `--sn-type-action` | danger | Action nodes |
| `--sn-type-output` | success | Output nodes |
| `--sn-type-data` | accent | Data nodes |
| `--sn-type-config` | warning | Config nodes |
| `--sn-type-external` | data | External nodes |
| `--sn-type-style` | ~danger+315° | Style nodes |
| `--sn-type-docs` | neutral | Documentation nodes |
| `--sn-type-asset` | ~accent-40° | Asset nodes |
| `--sn-type-group` | ~warning+8° | Group nodes |

## Layer 2: Skin Tokens

### Scale Parameters

| Token | Description |
|-------|-------------|
| `--sn-theme-density` | Global density scale (`0.75` – `1.40`) |
| `--sn-theme-spacing-scale` | Mirrors density for spacing |
| `--sn-theme-type-scale` | Typography scale (`0.80` – `1.30`) |
| `--sn-theme-heading-scale` | Heading type scale (`0.80` – `1.40`) |

### Density Tokens (selected)

All density tokens use `calc(Npx * var(--sn-theme-density))`:

| Token | Base (px) | Purpose |
|-------|-----------|---------|
| `--sn-node-header-padding` | varies | Graph node header padding |
| `--sn-node-body-padding` | varies | Graph node body padding |
| `--sn-port-padding` | varies | Port hit area |
| `--sn-layout-header-padding` | varies | Layout header chrome |
| `--sn-layout-header-min-height` | varies | Min header height |
| `--sn-chat-gap` | varies | Chat message spacing |
| `--sn-chat-message-padding` | varies | Chat message padding |
| `--sn-composer-padding` | varies | Composer area padding |
| `--sn-cell-size` | varies | Grid cell size |

### Typography Tokens (selected)

All type tokens use `calc(Npx * var(--sn-theme-type-scale))`:

| Token | Base (px) | Purpose |
|-------|-----------|---------|
| `--sn-node-font-size` | varies | Graph node body text |
| `--sn-node-label-size` | varies | Graph node labels |
| `--sn-chat-message-font-size` | varies | Chat message text |
| `--sn-code-font-size` | varies | Code block text |
| `--sn-composer-input-size` | varies | Composer input text |

### Outline Tokens

| Token | Purpose |
|-------|---------|
| `--sn-outline-color` | Primary outline/border |
| `--sn-outline-color-soft` | Soft outline for subtle separation |
| `--sn-node-border-width` | Graph node border |
| `--sn-shape-stroke-width` | SVG shape stroke |
| `--sn-conn-width` | Connection line width |
| `--sn-conn-hover-width` | Connection hover width |
| `--sn-effect-focus-ring` | Focus ring width |
| `--sn-layout-border` | Layout panel border |

## Layer 3: Motion Tokens

| Token | Formula | Purpose |
|-------|---------|---------|
| `--sn-theme-motion-scale` | `options.motion / 100` | Global multiplier |
| `--sn-transition-fast` | `120ms × scale` | Micro-interactions (hover, focus) |
| `--sn-transition-normal` | `240ms × scale` | Standard transitions |
| `--sn-transition-slow` | `400ms × scale` | Complex animations |

### Motion Presets (from Motion.js)

| Preset | Scale | Fast | Normal | Slow | Easing |
|--------|-------|------|--------|------|--------|
| `DEFAULT_MOTION` | 1.00 | 120ms | 240ms | 400ms | default |
| `SMOOTH_MOTION` | 1.20 | 150ms | 300ms | 500ms | `cubic-bezier(0.25, 1, 0.5, 1)` |
| `FAST_MOTION` | 0.60 | 70ms | 140ms | 240ms | default |
| `DISABLED_MOTION` | 0.00 | 0ms | 0ms | 0ms | — |

Apply standalone motion presets:

```javascript
import { applyMotion, SMOOTH_MOTION } from 'symbiote-ui/themes/Motion';

applyMotion(panelElement, SMOOTH_MOTION);
```

## Token Count Summary

| Group | Token Count |
|-------|-------------|
| Color | ~60 tokens |
| Outline | ~14 tokens |
| Typography | ~60 tokens |
| Density | ~130 tokens |
| Motion | 4 tokens |
| **Total** | **~268 tokens** |
