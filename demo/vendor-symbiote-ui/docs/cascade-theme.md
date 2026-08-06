# Cascade Theme

`symbiote-ui` exposes a reusable cascade theme contract for agent-built UI, graph canvases, layouts, scrollbars, and VR-ready panels:

```js
import { applyCascadeTheme, createCascadeTheme } from 'symbiote-ui';

let theme = createCascadeTheme({
  mode: 'dark',
  brightness: 0,
  contrast: 100,
  chroma: 89,
  hue: 218,
  pattern: 100,
  outline: 0,
  type: 100,
  heading: 100,
  density: 100,
  motion: 100,
});

applyCascadeTheme(document.documentElement, theme.state);
```

Apply the cascade once at `:root`, an app shell, or a subtree boundary. Components inherit `--sn-*` tokens; host projects should not duplicate the formulas in app-local CSS or JS.

Agent-controlled theme construction should use the design protocol model:
`theme.recipe` selects a relative direction, `theme.params` stores current
bounded controls, `theme.relations` modifies derived formulas, and
`theme.overrides` is a sparse escape hatch for concrete `--sn-*` tokens.
`symbiote-ui discover` exposes `themeRecipeModel`, `themeRelations`, and
`themeRecipes` for agents that need to inspect the available directions.

```js
import {
  applyCascadeTheme,
  resolveCascadeThemeRecipe,
} from 'symbiote-ui';
import {
  deriveDesignConstraints,
  validateThemePatch,
} from 'symbiote-ui/rules/design-policy.js';

let patch = {
  recipe: 'agent-console',
  relations: {
    surfaceLadder: { depth: 1 },
    stateLayers: { strength: 1 },
  },
  params: {
    contrast: 76,
    density: 88,
  },
};
let hostConfig = {};

let constraints = deriveDesignConstraints({
  design: {
    register: 'agent-workspace',
    componentFamilies: ['chat', 'graph', 'table'],
  },
  theme: {
    recipe: patch.recipe,
  },
});
let report = validateThemePatch(patch, constraints);
if (report.status === 'blocked') {
  throw new Error(report.violations.map((item) => item.reason).join('\n'));
}

let resolved = resolveCascadeThemeRecipe(patch);
let portableTheme = {
  params: resolved.params,
  relations: resolved.relations,
  overrides: resolved.overrides,
};
hostConfig.theme = portableTheme;
applyCascadeTheme(document.documentElement, patch);
```

The validator does not silently clamp agent patches. It returns hard blocks,
soft warnings, violated rules, derived ranges, and suggested JSON-patch-style
fixes. Browser smoke coverage includes a segmented design protocol check for
recipe application and policy diagnostics; it runs through `npm run
test:browser` when a managed Chrome for Testing or Chromium binary is
available.

The contract writes both low-level controls such as `--sn-theme-bg-lightness`,
`--sn-theme-outline-strength`, `--sn-theme-type-scale`, and
`--sn-theme-heading-scale`, `--sn-theme-density`, and
`--sn-theme-pattern-brightness`, `--sn-theme-motion-scale`, and public component aliases such as `--sn-sys-surface`,
`--sn-sys-on-surface`, `--sn-sys-surface-raised`, `--sn-sys-surface-panel`, `--sn-sys-surface-overlay`,
`--sn-button-bg`, and `--sn-field-control-bg`. Motion also exposes
`--sn-motion-enabled`, `--sn-animation-play-state`,
`--sn-animation-duration-scale`, and `--sn-transition-easing`; disabled
motion sets transition durations to zero and pauses cascade-driven animations.
The `pattern` control tunes animated background dots through
`--sn-cell-base-alpha`, `--sn-cell-alpha-span`, and
`--sn-theme-pattern-brightness`, while chat backgrounds remain on fixed
`--sn-chat-cell-base-alpha` and `--sn-chat-cell-alpha-span` aliases independently
of global pattern; glare, vignette, and noise stay stable so the ambient
gradient does not shift with dot intensity.
The `cellRadius` control is separate from UI corner radius and writes
`--sn-theme-cell-radius-scale`, which drives `--sn-cell-min-radius` and
`--sn-cell-max-radius` for `cell-bg`. Sharp panels can therefore use
`radius: 0` without shrinking the animated chat background circles.
`composerRadius` is also independent and writes
`--sn-theme-composer-radius-scale`, so hosts can keep the chat composer input
rounded while cards, tables, and layout chrome use a sharp classic geometry.
The composer textarea uses `--sn-composer-input-padding`, whose inline inset
expands from `--sn-composer-radius` so text stays visually aligned inside
rounded composer surfaces.
`scrollShadow` writes `--sn-scroll-shadow-size` and controls the short
scroll-edge fade used by reusable scroll hosts. The reusable scroll-fade
controller keeps the CSS mask disabled until the host actually overflows on its
configured single axis, so empty or not-yet-scrollable regions do not show edge
gradients.
Set `scrollShadow: 0` to disable the fade.
Pan/drag canvases such as `node-canvas` and `canvas-graph` do not use the
scroll-edge fade; it is reserved for conventional one-axis scroll surfaces such
as lists, tab strips, menus, and code/data panes.

`createCascadeTheme()` also derives readable foreground tokens for colored
controls. The same Node-safe formula is exposed as `getReadableTextForHsl()`;
agents should use it when they construct custom accent surfaces instead of
hard-coding light or dark button text. Tab and content-group accents rotate
through `--sn-tab-accent-0` ... `--sn-tab-accent-5`, which lets hosts separate
layout groups while still inheriting the same root cascade.

Runtime hosts can set `data-engine-state="idle"`, `"running"`, `"success"`,
or `"error"` on a reusable surface. The default provider maps those states to
`--sn-engine-state-color`, `--sn-engine-state-bg`, and
`--sn-engine-state-border`; running state animation uses
`--sn-animation-play-state` so reduced or disabled motion pauses it without
component-local JavaScript.

Preset composition is available through `ThemeFactory` exports. Agents can use
`resolveThemePresetsForTask('chat' | 'editor' | 'monitor' | 'terminal')` for
task defaults, then call `applyThemePresets(element, { color, skin, motion })`.
The motion preset comes from the same `Motion.js` definitions as direct
`applyMotion()` usage.

Browser hosts can mount the reusable editor module inside a layout panel:

```html
<cascade-theme-editor
  storage-key="my-app:cascade-theme"
  target-selector="#app-shell"
></cascade-theme-editor>
```

The editor reuses the same bounded cascade controls, auto-saves normalized
parameters to `localStorage`, can reset to defaults while removing only cascade-owned
`localStorage` keys, copies the current parameter JSON, and emits
`cascade-theme-change` after applying tokens. The
layout owns where the module is shown; `panel-layout` can register it as a
panel type while keeping the panel menu closed by default.
Temporary UI-invoked panels use the built-in `Close` action and
`closeUiPanel()` contract; close marks the panel closed/collapsed so the layout
surface remains recoverable. `removeUiPanel()` is the destructive operation that
physically removes a temporary panel and may restore the captured host layout
when the last temporary panel is removed. Persistent host layout panels use
`Remove` when the host deliberately edits the split tree.

## Theme Variants and Tab Shape

The bounded cascade state includes two discrete theme variants:

- `themeVariant: "classic"` is the library default and restores the earlier Agent Portal shell direction
  (`hue: 218`, `chroma: 89`, `contrast: 100`, dark background/surface/text
  lightness `10.0%` / `15.1%` / `98.0%`, pattern 100),
  uses sharp/no-outline chrome, and defaults to `tabShape: "classic-ear"`.
  It keeps `bgLightness`, `surfaceLightness`, `accentLightness`, and
  `accentChroma` on auto so the brightness and chroma sliders keep affecting
  the whole cascade instead of only part of the UI.
- `themeVariant: "modern"` keeps the framed cascade direction and defaults to
  `tabShape: "frame"`.

`tabShape` is a separate enum so hosts can mix the visual family and tab
geometry without changing theme recipes or geometry registers:

- `frame` keeps the current fully framed tab button.
- `ear` uses a flat-bottom active tab aligned to the tab-strip baseline.
- `classic-ear` adds the old outward rounded joins using the
  `--sn-tabs-corner-size` and `--sn-tabs-corner-cut` tokens. It does not draw a
  tab-strip separator line.

`tabRadius` is independent from the general `radius` control. `frame` applies
the derived `--sn-tabs-radius` to all tab corners; `ear` and `classic-ear`
apply it only to the top corners. Hosts that need a window scope to colour an
outer tab strip should copy public tab tokens such as `--sn-tabs-active-bg`,
`--sn-tabs-active-color`, and `--sn-tabs-accent` onto that tab strip instead of
duplicating component CSS.

`applyCascadeTheme()` writes `data-cascade-theme-variant` and
`data-cascade-tab-shape` on the target for scoped CSS inspection while keeping
the portable values in the normalized `cascade-theme-change` state.

## Scoped Theme State

Hosts with more than one cascade boundary should pass explicit scope
descriptors to `cascade-theme-widget` and `cascade-theme-editor`:

```js
let scopes = [
  { id: 'base', selector: '#app-shell', storageKey: 'app:theme:base', defaultState: baseTheme },
  { id: 'windows', selector: '#window-host', storageKey: 'app:theme:windows', defaultState: windowTheme },
];

themeWidget.scopes = scopes;
themeEditor.targets = scopes;
```

The full editor also supports scoped editing affordances that stay host-agnostic:

- `pickable="[data-theme-pickable]"` enables the eyedropper. The selected
  element becomes an individual target button using its `data-theme-id`,
  `data-theme-label`, `data-theme-target`, and `data-theme-key` hints, with the
  active theme and geometry register seeded as that target's starting state.
- `applyToAllTargets()` and the editor's select-all action copy the active
  theme state plus geometry register to every configured or picked target.
- `locale="en|ru|es"` renders the optional language segment and emits
  `cascade-theme-locale-change`. Locale is intentionally outside the cascade
  theme state and copied bundles; hosts apply it through their localization
  layer.

The shared helpers keep persistence and application behavior out of product
code:

```js
import {
  applyCascadeThemeScope,
  readCascadeThemeScopeState,
  seedCascadeThemeScopeState,
  removeCascadeThemeScopeState,
} from 'symbiote-ui';

seedCascadeThemeScopeState(scopes[0]);
let state = readCascadeThemeScopeState(scopes[0]);
applyCascadeThemeScope(scopes[0], { state, persist: true });
```

Geometry registers are stored beside the scope using
`CASCADE_THEME_REGISTER_STORAGE_SUFFIX` and applied with
`applyCascadeGeometryRegister()`. The public helper and
`cascade-geometry-register-change` event remain for stored bundles and
host-driven geometry previews; the visible editor controls use `themeVariant`
and `tabShape` instead of exposing the register presets directly.

## Theme sharing and user presets

The root `symbiote-ui` entrypoint provides the Node-safe sharing codec and
insert-only user preset store. The codec produces a bounded, canonical
`v1.<base64url>` token. Decoding returns a complete normalized state plus an
optional geometry register and display name.

```js
import {
  decodeCascadeThemeShare,
  encodeCascadeThemeShare,
  getCascadeThemeUserPreset,
  insertCascadeThemeUserPreset,
  listCascadeThemeUserPresets,
} from 'symbiote-ui';

let token = encodeCascadeThemeShare({
  state: { mode: 'dark', contrast: 100 },
  register: '',
  name: 'Museum dark',
});
let shared = decodeCascadeThemeShare(token);

let preset = insertCascadeThemeUserPreset(shared);
let stored = getCascadeThemeUserPreset(preset.id);
let presets = listCascadeThemeUserPresets();
```

Every accepted preset receives a fresh UUID and its own storage record. Insert
never accepts a caller-owned ID and never replaces a library preset or an
existing user preset.

`cascade-theme-widget` and `cascade-theme-editor` expose a localized
`share-label` attribute/property. Their share action emits a bubbling, composed
`cascade-theme-share-request` event with `{ state, register, name? }`. The state
is a detached plain snapshot. An explicit theme name or active display label is
trimmed and included only when it is a non-empty string; other values are never
coerced. The event is an intent boundary: the library does
not create URLs, write history, copy to the clipboard, or choose product
translations.

```js
themeWidget.shareLabel = 'Поделиться темой';
themeWidget.addEventListener('cascade-theme-share-request', ({ detail }) => {
  let token = encodeCascadeThemeShare(detail);
  // The host decides how to place the token in a URL and how to present sharing.
});
```

Browser hosts can import `symbiote-ui/ui` and use
`<sn-theme-import-dialog>`. `show()` accepts exactly one options object:

```js
await import('symbiote-ui/ui');

let dialog = document.createElement('sn-theme-import-dialog');
document.body.append(dialog);
dialog.show({
  token,
  target: document.documentElement,
  storage: localStorage,
  storageKey: 'app:active-cascade-theme',
  labels: localizedLabels,
  messages: localizedMessages,
});
```

`storageKey` is the active theme state key, not the user-preset collection key.
While the dialog is open, preview changes are applied only to the target and
write no storage. Cancel, replacement, navigation, or disconnection restores
the exact pre-preview state. `saveWithoutApplying()` inserts a new preset and
rolls the preview back; `addAndApply()` inserts a new preset and then commits it
as the active theme. The host owns `sn-theme` URL parsing/removal, history,
clipboard fallback, localization, and creation/removal of the dialog element.

## Standalone document adoption

`applyCascadeTheme(element, options)` adopts the provider foundation and system
cascade in `element.ownerDocument`. Adoption is idempotent per document, so
theme tokens resolve in iframes and other same-origin document realms without a
separate global-style preload.
