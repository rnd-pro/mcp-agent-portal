# Theme Presets Reference

Complete catalog of all built-in presets from `ThemeFactory.js`.

## Color Presets (COLOR_PRESETS)

All presets are frozen objects exported from `symbiote-ui/themes/ThemeFactory`.

### carbon

Neutral monochrome dark theme. Best for code editors and terminals.

```javascript
{ mode: 'dark', hue: 218, chroma: 0, brightness: 0, contrast: 58 }
```

- Zero chroma → fully desaturated (grayscale).
- Standard contrast → comfortable for long reading sessions.

### neon

Vibrant purple-accented dark theme. Best for creative tools and visual editors.

```javascript
{ mode: 'dark', hue: 280, chroma: 80, brightness: 5, contrast: 65 }
```

- High chroma (80) → vivid accent colors.
- Slight brightness boost (5) → surfaces are not pure black.
- Elevated contrast (65) → strong text/bg separation.

### pcb

Matrix/circuit-board green theme. Best for monitoring dashboards.

```javascript
{ mode: 'dark', hue: 148, chroma: 70, brightness: 2, contrast: 60 }
```

- Green hue (148) → circuit board aesthetic.
- High chroma (70) → noticeable green tint.

### ebook

Warm parchment light theme. Best for reading interfaces.

```javascript
{ mode: 'light', hue: 35, chroma: 12, brightness: 0, contrast: 55 }
```

- Light mode with warm hue (35) → sepia-like feel.
- Low chroma (12) → subtle warmth, not saturated.
- Slightly reduced contrast (55) → easy on eyes.

### dark (default)

Standard dark blue theme. Default for all panels.

```javascript
{ mode: 'dark', hue: 218, chroma: 89, brightness: 0, contrast: 100 }
```

### light

Standard light blue theme. Mirror of `dark`.

```javascript
{ mode: 'light', hue: 218, chroma: 89, brightness: 0, contrast: 100 }
```

## Skin Presets (SKIN_PRESETS)

### modern (default)

Standard spacing. Balanced density for general use.

```javascript
{ density: 100, outline: 38, type: 100, heading: 100 }
```

### compact

Dense IDE-like layout. High information density.

```javascript
{ density: 80, outline: 50, type: 90, heading: 90 }
```

- Density 80 → 20% less padding/gaps.
- Higher outline (50) → clearer panel borders.
- Reduced type (90) → smaller fonts.

### rounded

Spacious layout with larger elements. More consumer-oriented.

```javascript
{ density: 120, outline: 30, type: 110, heading: 110 }
```

- Density 120 → 20% more padding.
- Lower outline (30) → subtler borders.
- Larger type (110) → bigger fonts.

## Motion Presets (MOTION_PRESETS)

### default

Balanced transitions.

```javascript
{ motion: 100 }  // → scale 1.0, fast 120ms, normal 240ms, slow 400ms
```

### smooth

Elegant, eased transitions. Good for onboarding and presentation.

```javascript
{ motion: 120 }  // → scale 1.2, fast 150ms, normal 300ms, slow 500ms
```

### fast

Snappy utility transitions. Best for professional tools.

```javascript
{ motion: 60 }  // → scale 0.6, fast 70ms, normal 140ms, slow 240ms
```

### disabled

No animation at all. Critical for a11y compliance.

```javascript
{ motion: 0 }  // → all transitions 0ms
```

## Panel/Task Presets (PANEL_THEME_PRESETS)

Semantic combinations mapping panel purpose to theme settings.

### chat

Conversational UI — comfortable, smooth animations.

```javascript
{ color: 'dark', skin: 'modern', motion: 'smooth' }
```

### editor

Code editor — monochrome, dense, fast.

```javascript
{ color: 'carbon', skin: 'compact', motion: 'fast' }
```

### monitor

System monitoring — green-tinted, dense, fast.

```javascript
{ color: 'pcb', skin: 'compact', motion: 'fast' }
```

### terminal

Terminal/console — monochrome, dense, no animations.

```javascript
{ color: 'carbon', skin: 'compact', motion: 'disabled' }
```

## Usage Patterns

### Apply preset by name

```javascript
import { applyThemePresets } from 'symbiote-ui/themes/ThemeFactory';

applyThemePresets(element, { color: 'neon', skin: 'compact', motion: 'fast' });
```

### Apply preset by task type

```javascript
import { resolveThemePresetsForTask, applyThemePresets } from 'symbiote-ui/themes/ThemeFactory';

let presets = resolveThemePresetsForTask('monitor');
applyThemePresets(element, presets);
```

### Resolve presets without applying

```javascript
import { resolveThemePresets } from 'symbiote-ui/themes/ThemeFactory';

let params = resolveThemePresets({ color: 'pcb', skin: 'compact', motion: 'fast' });
// → { mode: 'dark', hue: 148, chroma: 70, brightness: 2, contrast: 60, density: 80, outline: 50, type: 90, heading: 90, motion: 60 }
```

### Custom hybrid (override preset values)

```javascript
import { applyCascadeTheme } from 'symbiote-ui/themes/Theme';
import { resolveThemePresets } from 'symbiote-ui/themes/ThemeFactory';

let base = resolveThemePresets({ color: 'pcb', skin: 'modern' });
applyCascadeTheme(element, { ...base, hue: 200, density: 90 });
```
