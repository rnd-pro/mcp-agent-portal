import { hasComponent } from './component-registry.js';

/**
 * @typedef {object} ComponentRecipe
 * @property {string} intent Short need phrase an author would describe ("tabular data", "modal dialog").
 * @property {string} component Existing component tagName to reuse for this intent.
 * @property {string} when One-line "use when…" guidance for picking this component.
 * @property {string} antipattern One-line "don't hand-roll a …" reminder.
 */

/**
 * Curated intent → existing component reuse index. Every entry points an author
 * at a real `symbiote-ui` component instead of inventing a bespoke one, so new
 * modules stay consistent with the existing UI surface.
 *
 * Entries are filtered against the live registry by {@link listComponentRecipes}
 * so a component that disappears from the registry drops out of the index
 * rather than dangling.
 *
 * @type {ComponentRecipe[]}
 */
const RECIPES = [
  {
    intent: 'tabular data',
    component: 'sn-data-table',
    when: 'use when rows and columns need sorting, selection, or aligned cells',
    antipattern: "don't hand-roll a <table> grid with custom row markup",
  },
  {
    intent: 'key/value details',
    component: 'sn-description-list',
    when: 'use when showing labelled term/value pairs for a single record',
    antipattern: "don't hand-roll a two-column <dl> or label/value flex layout",
  },
  {
    intent: 'status indicator',
    component: 'sn-status-light',
    when: 'use when surfacing a discrete health or state dot (online, error, idle)',
    antipattern: "don't hand-roll a colored <span> dot with bespoke state classes",
  },
  {
    intent: 'count or label badge',
    component: 'sn-badge',
    when: 'use when annotating an item with a small count, tag, or state label',
    antipattern: "don't hand-roll a pill <span> with custom background colors",
  },
  {
    intent: 'titled bordered container',
    component: 'sn-card',
    when: 'use when grouping related content in a bordered, optionally titled surface',
    antipattern: "don't hand-roll a <div> with border, radius, and padding tokens",
  },
  {
    intent: 'modal dialog',
    component: 'sn-dialog',
    when: 'use when a focused, blocking task or confirmation interrupts the flow',
    antipattern: "don't hand-roll a fixed overlay <div> with manual focus trapping",
  },
  {
    intent: 'slide-over panel',
    component: 'sn-drawer',
    when: 'use when secondary content slides in from an edge without leaving the page',
    antipattern: "don't hand-roll an off-canvas <aside> with manual transitions",
  },
  {
    intent: 'transient notification',
    component: 'sn-toast',
    when: 'use when confirming an action with a brief, auto-dismissing message',
    antipattern: "don't hand-roll a floating <div> with a setTimeout dismiss",
  },
  {
    intent: 'inline alert',
    component: 'sn-banner',
    when: 'use when a persistent in-flow message warns or informs about context',
    antipattern: "don't hand-roll a colored callout <div> with an icon and message",
  },
  {
    intent: 'empty or zero state',
    component: 'sn-empty-state',
    when: 'use when a list or view has no data and needs guidance or a next action',
    antipattern: "don't hand-roll a centered <div> with an icon and 'nothing here' text",
  },
  {
    intent: 'single metric',
    component: 'sn-metric',
    when: 'use when highlighting one headline number with a label and optional delta',
    antipattern: "don't hand-roll a stat block with bespoke number and caption styles",
  },
  {
    intent: 'hierarchical data',
    component: 'sn-tree-view',
    when: 'use when nested, expandable parent/child nodes need to be navigated',
    antipattern: "don't hand-roll nested <ul> lists with manual expand/collapse state",
  },
  {
    intent: 'selectable list',
    component: 'sn-listbox',
    when: 'use when a single- or multi-select list needs keyboard and roving focus',
    antipattern: "don't hand-roll a <ul> of clickable items with custom selection logic",
  },
  {
    intent: 'collapsible sections',
    component: 'sn-accordion',
    when: 'use when stacked sections expand and collapse to manage vertical space',
    antipattern: "don't hand-roll <details>/<summary> blocks with bespoke animation",
  },
  {
    intent: 'contextual overlay',
    component: 'sn-popover',
    when: 'use when transient content anchors to a trigger and dismisses on outside click',
    antipattern: "don't hand-roll an absolutely positioned <div> with manual placement",
  },
  {
    intent: 'form text input',
    component: 'sn-field',
    when: 'use when collecting a labelled text value with validation and help text',
    antipattern: "don't hand-roll a <label> + <input> pair with custom error markup",
  },
  {
    intent: 'choice from many options',
    component: 'sn-select',
    when: 'use when picking one value from a known, bounded list of options',
    antipattern: "don't hand-roll a styled native <select> or custom dropdown menu",
  },
  {
    intent: 'searchable choice from many',
    component: 'sn-combobox',
    when: 'use when picking from a long list that benefits from type-ahead filtering',
    antipattern: "don't hand-roll an <input> with a filtered results <ul> beneath it",
  },
  {
    intent: 'on/off toggle',
    component: 'sn-switch',
    when: 'use when toggling a single boolean setting on or off immediately',
    antipattern: "don't hand-roll a checkbox restyled to look like a toggle track",
  },
  {
    intent: 'determinate progress',
    component: 'sn-progress-bar',
    when: 'use when showing linear completion toward a known total',
    antipattern: "don't hand-roll a track <div> with a width-percentage fill",
  },
  {
    intent: 'compact circular progress',
    component: 'sn-progress-ring',
    when: 'use when completion is shown in a small, radial footprint',
    antipattern: "don't hand-roll an SVG circle with stroke-dashoffset math",
  },
  {
    intent: 'user avatar',
    component: 'sn-avatar',
    when: 'use when representing a person or entity with an image or initials',
    antipattern: "don't hand-roll a rounded <img> with initials fallback logic",
  },
  {
    intent: 'tag or chip',
    component: 'sn-tag',
    when: 'use when labelling or categorizing an item with a small, optionally removable chip',
    antipattern: "don't hand-roll a pill <span> with a close button and remove handler",
  },
  {
    intent: 'code snippet',
    component: 'code-block',
    when: 'use when displaying syntax-highlighted code with copy affordance',
    antipattern: "don't hand-roll a <pre><code> block with bespoke highlighting",
  },
  {
    intent: 'tooltip',
    component: 'sn-tooltip',
    when: 'use when a brief hint appears on hover or focus of a trigger',
    antipattern: "don't hand-roll a title attribute or absolutely positioned hint <div>",
  },
  {
    intent: 'chronological timeline',
    component: 'sn-timeline',
    when: 'use when events are shown in ordered, time-anchored steps',
    antipattern: "don't hand-roll a vertical rail with bespoke dot-and-line markup",
  },
  {
    intent: 'multi-step progress',
    component: 'sn-stepper',
    when: 'use when guiding through ordered stages of a task or wizard',
    antipattern: "don't hand-roll numbered step circles with manual active state",
  },
  {
    intent: 'navigation breadcrumb',
    component: 'sn-breadcrumb',
    when: 'use when showing the current location within a hierarchy path',
    antipattern: "don't hand-roll a separator-joined list of links",
  },
  {
    intent: 'paginated navigation',
    component: 'sn-pagination',
    when: 'use when splitting a long result set across navigable pages',
    antipattern: "don't hand-roll prev/next buttons with custom page-number state",
  },
  {
    intent: 'loading placeholder',
    component: 'sn-skeleton',
    when: 'use when reserving layout with a shimmer while content loads',
    antipattern: "don't hand-roll gray placeholder <div>s with a custom shimmer animation",
  },
];

/**
 * Live intent → component reuse index, filtered so every recipe targets a
 * component that currently exists in the registry.
 *
 * @returns {ComponentRecipe[]} Grounded recipes whose component passes `hasComponent`.
 */
export function listComponentRecipes() {
  return RECIPES.filter((recipe) => hasComponent(recipe.component));
}

/**
 * Versioned descriptor wrapping the grounded recipe index for discovery output.
 *
 * @returns {{ version: string, count: number, recipes: ComponentRecipe[] }} Recipe descriptor.
 */
export function getComponentRecipesDescriptor() {
  let recipes = listComponentRecipes();
  return {
    version: 'component-recipes-v1',
    count: recipes.length,
    recipes,
  };
}

/**
 * Find the best-matching recipe for a free-text intent query.
 *
 * Scores each query word by whole-word match against the intent words and the
 * component tag words (so "table" finds `sn-data-table`), with a substring
 * fallback. Higher score wins; ties prefer the shorter, more specific intent.
 *
 * @param {string} query Free-text description of the UI need.
 * @returns {ComponentRecipe | null} Best matching recipe, or null when none match.
 */
export function recipeForIntent(query) {
  let needle = String(query ?? '').trim().toLowerCase();
  if (!needle) return null;
  let queryWords = needle.split(/\s+/).filter(Boolean);
  let best = null;
  let bestScore = 0;
  for (let recipe of listComponentRecipes()) {
    let intent = recipe.intent.toLowerCase();
    let intentWords = intent.split(/\s+/);
    let tagWords = recipe.component.toLowerCase().replace(/^sn-/, '').split('-');
    let score = 0;
    for (let word of queryWords) {
      if (intentWords.includes(word) || tagWords.includes(word)) score += 2;
      else if (intent.includes(word)) score += 1;
    }
    if (score > bestScore || (score === bestScore && score > 0 && recipe.intent.length < best.intent.length)) {
      best = recipe;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}
