---
name: symbiote-ui-theming
description: >
  Compose and apply cascading themes to Symbiote UI interfaces using a 3-layer
  system: Colors (hue/chroma/contrast via oklch), Skins (density/outline/typography),
  and Motion (transition speed/easing presets). Includes ThemeFactory for
  runtime preset composition, State-to-Cascade CSS induction for live backend
  status visualization, and A11y auto-adaptation via media queries. Use when
  theming agent-built panels, adapting UI density, or reflecting engine state
  as visual indicators.
license: MIT
compatibility: Requires a browser or DOM-compatible environment with CSS custom properties support.
metadata:
  author: rnd-pro
  version: "1.0"
---

# Symbiote UI Theming — Agent Skill

Symbiote UI themes are **cascade-composable runtime tokens** — not static CSS files.
Agents set theme parameters per container, and the theme resolves to CSS custom
properties that inherit down the DOM tree.

## Quick Start

```javascript
import { applyCascadeTheme } from 'symbiote-ui/themes/Theme';
import { applyThemePresets, resolveThemePresetsForTask } from 'symbiote-ui/themes/ThemeFactory';

// Apply preset theme to a panel
applyThemePresets(panelElement, {
  color: 'carbon',   // dark monochrome
  skin: 'compact',   // high density
  motion: 'fast'     // quick transitions
});

// Or use task-specific defaults
let presets = resolveThemePresetsForTask('monitor');
// → { color: 'pcb', skin: 'compact', motion: 'fast' }
applyThemePresets(panelElement, presets);

// Or apply raw parameters
applyCascadeTheme(panelElement, {
  mode: 'dark',
  hue: 148,
  chroma: 70,
  brightness: 2,
  contrast: 60,
  density: 80,
  outline: 50,
  motion: 60,
});
```

## Three-Layer Architecture

Symbiote UI themes separate concerns into three independent layers:

### Layer 1: Colors

Controls palette via `oklch` color space parameters.

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `mode` | `string` | `'dark' \| 'light'` | `'dark'` | Base lightness direction |
| `hue` | `number` | `0–360` | `218` | Color wheel angle |
| `chroma` | `number` | `0–100` | `89` | Color saturation intensity |
| `brightness` | `number` | `0–20` | `0` | Base lightness offset |
| `contrast` | `number` | `0–100` | `100` | Foreground/background separation |

### Layer 2: Skins

Controls density, geometry, and typography scale.

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `density` | `number` | `60–140` | `100` | Padding/gap scale (% of base) |
| `outline` | `number` | `0–100` | `38` | Border/outline thickness scale |
| `type` | `number` | `70–130` | `100` | Font size scale |
| `heading` | `number` | `70–130` | `100` | Heading size scale |

### Layer 3: Motion

Controls transition timing.

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `motion` | `number` | `0–200` | `100` | Global motion scale (0 = disabled) |

## ThemeFactory Presets

### Color Presets

| Preset | Mode | Hue | Chroma | Brightness | Contrast | Character |
|--------|------|-----|--------|------------|----------|-----------|
| `carbon` | dark | 218 | 0 | 0 | 58 | Neutral monochrome |
| `neon` | dark | 280 | 80 | 5 | 65 | Vibrant purple |
| `pcb` | dark | 148 | 70 | 2 | 60 | Matrix/circuit green |
| `ebook` | light | 35 | 12 | 0 | 55 | Warm parchment |
| `dark` | dark | 218 | 89 | 0 | 100 | Standard dark blue |
| `light` | light | 218 | 89 | 0 | 100 | Standard light blue |

### Skin Presets

| Preset | Density | Outline | Type | Heading | Character |
|--------|---------|---------|------|---------|-----------|
| `modern` | 100 | 38 | 100 | 100 | Standard spacing |
| `compact` | 80 | 50 | 90 | 90 | Dense IDE-like |
| `rounded` | 120 | 30 | 110 | 110 | Spacious with large radii |

### Motion Presets

| Preset | Motion Scale | Fast | Normal | Slow | Character |
|--------|-------------|------|--------|------|-----------|
| `default` | 1.00 | 120ms | 240ms | 400ms | Balanced |
| `smooth` | 1.20 | 150ms | 300ms | 500ms | Elegant, eased |
| `fast` | 0.60 | 70ms | 140ms | 240ms | Snappy utility |
| `disabled` | 0.00 | 0ms | 0ms | 0ms | No animation |

### Panel/Task Presets

Semantic theme combinations for common panel types:

| Task | Color | Skin | Motion |
|------|-------|------|--------|
| `chat` | `dark` | `modern` | `smooth` |
| `editor` | `carbon` | `compact` | `fast` |
| `monitor` | `pcb` | `compact` | `fast` |
| `terminal` | `carbon` | `compact` | `disabled` |

## State-to-Cascade CSS Induction

Backend engine state is reflected directly in CSS via `data-engine-state` attributes:

```html
<sym-panel data-engine-state="running">
  <!-- Panel visually pulses to show activity -->
</sym-panel>
```

### Supported States

| State | Visual Effect |
|-------|---------------|
| `idle` | Neutral background |
| `running` | Animated pulse glow on accent color |
| `success` | Green tint via `color-mix()` |
| `error` | Red/danger tint via `color-mix()` |
| `paused` | Dimmed opacity |

Set via JavaScript:

```javascript
import { applyRuntimeUiState } from 'symbiote-ui/runtime';

applyRuntimeUiState(panelElement, {
  attrs: { 'data-engine-state': 'running' }
});
```

## Cascade Isolation Rules

1. **Apply themes to containers, never `:root`** — each panel can have its own theme.
2. CSS custom properties (`--sn-*`) inherit down the subtree automatically.
3. A child container can override tokens by applying its own theme.
4. Shadow DOM boundaries block inheritance — use `::part()` or CSS `@property` for piercing.

```javascript
// Panel 1: PCB monitor theme
applyThemePresets(panel1, { color: 'pcb', skin: 'compact' });

// Panel 2: Ebook reader theme (in the same layout)
applyThemePresets(panel2, { color: 'ebook', skin: 'rounded' });
```

## A11y Auto-Adaptation

Symbiote UI themes respect user preferences:

```css
/* Automatically adapts when user prefers reduced motion */
@media (prefers-reduced-motion: reduce) {
  :host { --sn-theme-motion-scale: 0 !important; }
}

/* High contrast mode */
@media (prefers-contrast: more) {
  :host { --sn-theme-contrast: 80 !important; }
}
```

## CSS-Native Bridge (Tailwind v4)

If the host application uses Tailwind CSS v4, theme tokens can inherit:

```css
/* Map Tailwind v4 design tokens to Symbiote UI tokens */
:root {
  --sn-theme-hue: var(--color-primary-h, 218);
  --sn-theme-chroma: var(--color-primary-c, 89);
}
```

This allows Symbiote UI panels to adopt the host's brand colors automatically.

## Common Mistakes

- **Never hardcode colors in component styles** — always use `--sn-*` tokens.
- **Never set `motion: 0` without checking `prefers-reduced-motion`** — use the `disabled` preset which handles this.
- **Don't apply themes to individual elements** — apply to the nearest container and let CSS cascade handle children.
- **Don't mix `applyCascadeTheme()` and `applyThemePresets()`** on the same element — presets call `applyCascadeTheme` internally.

## References

For detailed documentation, see:
- [Theme Layers Reference](references/theme-layers.md) — Full CSS custom property lists per layer.
- [Theme Presets Reference](references/theme-presets.md) — Complete preset catalog with usage.
- [State Cascade Reference](references/state-cascade.md) — State-to-CSS induction patterns.
