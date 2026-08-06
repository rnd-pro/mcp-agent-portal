export const CASCADE_THEME_VARIANTS = Object.freeze(['modern', 'classic']);
export const CASCADE_THEME_TAB_SHAPES = Object.freeze(['frame', 'ear', 'classic-ear']);

export const CASCADE_THEME_CONTROL_LIST = Object.freeze([
  {
    name: 'themeVariant',
    type: 'enum',
    values: CASCADE_THEME_VARIANTS,
    default: 'classic',
    labels: { modern: 'Modern', classic: 'Classic' },
    icon: 'palette',
    description: 'Top-level visual theme family. Classic is the library default; Modern keeps the framed cascade direction.',
  },
  {
    name: 'tabShape',
    type: 'enum',
    values: CASCADE_THEME_TAB_SHAPES,
    default: 'classic-ear',
    labels: { frame: 'Frame', ear: 'Ear', 'classic-ear': 'Classic ear' },
    icon: 'tab',
    description: 'Project tab geometry: framed tabs, flat-bottom ear tabs, or the classic ear tabs with outward rounded joins.',
  },
  {
    name: 'mode',
    type: 'enum',
    values: ['dark', 'light'],
    default: 'dark',
    icon: 'routine',
    description: 'Neutral luminance branch used to derive background, surface, text, border, and hover tokens.',
  },
  {
    name: 'brightness',
    type: 'number',
    min: 0,
    max: 100,
    default: 0,
    icon: 'brightness_6',
    description: 'Global neutral brightness control. Dark mode moves surfaces upward; light mode moves them downward.',
  },
  {
    name: 'contrast',
    type: 'number',
    min: 0,
    max: 100,
    default: 100,
    icon: 'contrast',
    description: 'Contrast control for text, borders, hover surfaces, and accent lightness.',
  },
  {
    name: 'chroma',
    type: 'number',
    min: 0,
    max: 100,
    default: 89,
    icon: 'opacity',
    description: 'Accent saturation from grayscale to vivid color.',
  },
  {
    name: 'hue',
    type: 'number',
    min: 0,
    max: 360,
    default: 218,
    icon: 'palette',
    description: 'Accent hue in native CSS HSL space.',
  },
  {
    name: 'bgLightness',
    type: 'number',
    min: -1,
    max: 100,
    default: -1,
    icon: 'format_color_fill',
    description: 'Explicit background lightness (0 = black, 100 = white), overriding the brightness-derived value for the full range. -1 = auto (derive from brightness/mode).',
  },
  {
    name: 'surfaceLightness',
    type: 'number',
    min: -1,
    max: 100,
    default: -1,
    icon: 'layers',
    description: 'Explicit surface / panel (accent-background) lightness, overriding the derived value so panels can be set independently of the page background. -1 = auto.',
  },
  {
    name: 'accentLightness',
    type: 'number',
    min: -1,
    max: 100,
    default: -1,
    icon: 'gradient',
    description: 'Explicit accent-colour lightness (0-100), overriding the contrast-derived value - set a dark vivid accent on white or a bright accent on black for maximum contrast. -1 = auto.',
  },
  {
    name: 'accentChroma',
    type: 'number',
    min: -1,
    max: 100,
    default: -1,
    icon: 'invert_colors',
    description: 'Explicit accent saturation for the accent colour only, overriding the global chroma. -1 = auto (use chroma).',
  },
  {
    name: 'pattern',
    type: 'number',
    min: 0,
    max: 100,
    default: 100,
    icon: 'grain',
    description: 'Intensity of animated cell-bg dots; ambient gradients and noise stay stable.',
  },
  {
    name: 'cellRadius',
    type: 'number',
    min: 0,
    max: 100,
    default: 17,
    icon: 'blur_circular',
    description: 'Animated cell-bg dot radius scale, independent from UI corner radius so sharp panels do not shrink chat background circles.',
  },
  {
    name: 'outline',
    type: 'number',
    min: 0,
    max: 100,
    default: 0,
    icon: 'border_outer',
    description: 'Outline visibility and emphasis for DOM borders, SVG shapes, split resizers, focus rings, sockets, and graph connections.',
  },
  {
    name: 'type',
    type: 'number',
    min: 80,
    max: 130,
    default: 100,
    icon: 'text_fields',
    description: 'Typography scale for graph nodes, chat messages, controls, layout chrome, menus, tree rows, and demo labels.',
  },
  {
    name: 'heading',
    type: 'number',
    min: 80,
    max: 140,
    default: 100,
    icon: 'title',
    description: 'Heading-to-body type balance for titles, graph labels, panel headings, cards, chat markdown, and document markdown.',
  },
  {
    name: 'density',
    type: 'number',
    min: 75,
    max: 140,
    default: 100,
    icon: 'density_medium',
    description: 'Spacing and hit-target scale for graph nodes, ports, chat composer, controls, layout chrome, panel menus, and tree rows.',
  },
  {
    name: 'radius',
    type: 'number',
    min: 0,
    max: 100,
    default: 0,
    icon: 'rounded_corner',
    description: 'Corner-radius scale for reusable controls, cards, tables, graph chrome, and layout panels.',
  },
  {
    name: 'tabRadius',
    type: 'number',
    min: 0,
    max: 100,
    default: 17,
    icon: 'tab',
    description: 'Project tab corner-radius scale. Frame tabs use it on all corners; ear and classic-ear tabs use it only on the top corners.',
  },
  {
    name: 'composerRadius',
    type: 'number',
    min: 0,
    max: 100,
    default: 100,
    icon: 'chat',
    description: 'Chat composer corner-radius scale, independent from the general UI radius so sharp panels can keep a rounded input surface.',
  },
  {
    name: 'scrollShadow',
    type: 'number',
    min: 0,
    max: 48,
    default: 14,
    icon: 'gradient',
    description: 'Size in px of the scroll-edge fade. 0 disables the fade; larger values make content disappear under a stronger surface-colored edge.',
  },
  {
    name: 'frameRadius',
    type: 'number',
    min: 0,
    max: 200,
    default: 0,
    icon: 'crop_square',
    description: 'Corner radius of the outer layout frames (panels), independent of the inner radius; also cascades into their inner padding so content stays clear of the rounded corners.',
  },
  {
    name: 'frameGap',
    type: 'number',
    min: 0,
    max: 20,
    default: 0,
    icon: 'space_dashboard',
    description: 'Gap (px) between layout panels and inset from the window edges, so rounded frames float apart as separate cards instead of touching.',
  },
  {
    name: 'motion',
    type: 'number',
    min: 0,
    max: 200,
    default: 100,
    icon: 'directions_run',
    description: 'Global motion scale (0-200%) for interactive transitions, animations, and cell effects.',
  },
]);

export const CASCADE_THEME_PARAM_NAMES = Object.freeze(
  CASCADE_THEME_CONTROL_LIST.map((control) => control.name)
);

export const CASCADE_THEME_DEFAULTS = Object.freeze(Object.fromEntries(
  CASCADE_THEME_CONTROL_LIST.map((control) => [control.name, control.default])
));

/**
 * Pre-defined theme variants provided by the library.
 * Architectural Principle (Separation of Concerns): 
 * Library presets define ONLY structural or layout differences (e.g. tabShape, themeVariant).
 * Brand-specific parameters (hue, chroma, frameRadius, etc.) MUST NOT be hardcoded here.
 * Applications consuming the library should provide their own color and spacing defaults
 * via their specific storage state (e.g. default-state attribute).
 */
export const CASCADE_THEME_VARIANT_PRESETS = Object.freeze({
  modern: Object.freeze({
    ...CASCADE_THEME_DEFAULTS,
    themeVariant: 'modern',
    tabShape: 'frame',
  }),
  classic: Object.freeze({
    ...CASCADE_THEME_DEFAULTS,
    themeVariant: 'classic',
    tabShape: 'classic-ear',
  }),
});
