import { themedScrollFadeInlineStyles } from '../../themes/scroll-fade-styles.js';

export default /*css*/ `
sn-kanban-board {
  --sn-kanban-border: var(--sn-sys-outline-subtle);
  --sn-kanban-column-bg: var(--sn-sys-surface-panel);
  --sn-kanban-header-bg: var(--sn-sys-surface-toolbar);
  --sn-kanban-title-color: var(--sn-sys-on-surface);
  --sn-kanban-description-color: var(--sn-sys-on-surface-dim);
  --sn-kanban-count-color: var(--sn-sys-on-surface-dim);
  --sn-kanban-card-bg: var(--sn-sys-surface-raised);
  --sn-kanban-card-border: var(--sn-sys-outline-subtle);
  --sn-kanban-card-hover-border: var(--sn-sys-accent);
  --sn-kanban-drop-border: var(--sn-sys-accent);

  display: block;
  min-width: 0;
  min-height: 0;
  height: 100%;
  color: var(--sn-sys-on-surface);
  font-family: var(--sn-font);
}

sn-kanban-board[hidden] {
  display: none !important;
}

sn-kanban-board .sn-kanban-columns {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: var(--sn-kanban-column-width, minmax(232px, 286px));
  align-items: var(--sn-kanban-columns-align, stretch);
  gap: var(--sn-kanban-gap, var(--sn-step-5));
  min-width: 0;
  min-height: var(--sn-kanban-columns-min-height, 0);
  height: var(--sn-kanban-columns-height, 100%);
  overflow: auto;
  ${themedScrollFadeInlineStyles}
  padding: var(--sn-kanban-padding, 0 0 var(--sn-step-2));
}

sn-kanban-board .sn-kanban-column {
  /* Named inline-size container (house pattern: ChatComposer/LayoutNode) for the
     narrow-column adaptivity rules at the end of this sheet. */
  container: kanban-column / inline-size;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: var(--sn-kanban-column-min-height, 240px);
  height: var(--sn-kanban-column-height, auto);
  border: 1px solid var(--sn-kanban-border);
  border-radius: var(--sn-kanban-radius, var(--sn-card-radius));
  background: var(--sn-kanban-column-bg);
  overflow: var(--sn-kanban-column-overflow, hidden);
}

/*
 * The audit's state-layer-usage check inspects each rule's own text for the color-mix pattern
 * and cannot see through a custom-property indirection (same limitation menu/ hit for
 * disabled-state selectors); the mix is written directly in the fallback of the themeable
 * --sn-kanban-drop-bg alias so the rule reads as compliant without losing the override point.
 */
sn-kanban-board .sn-kanban-column[data-drop-active="true"] {
  border-color: var(--sn-kanban-drop-border);
  background: var(--sn-kanban-drop-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-kanban-column-bg)));
}

sn-kanban-board .sn-kanban-column-header {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--sn-step-4);
  min-height: var(--sn-kanban-header-min-height, 54px);
  padding: var(--sn-kanban-header-padding, var(--sn-step-4) var(--sn-step-5));
  border-block-end: 1px solid var(--sn-kanban-border);
  background: var(--sn-kanban-header-bg);
}

sn-kanban-board .sn-kanban-column-title {
  min-width: 0;
  color: var(--sn-kanban-title-color);
  font-size: var(--sn-kanban-title-size, 13px);
  font-weight: var(--sn-kanban-title-weight, 650);
  line-height: 1.25;
}

sn-kanban-board .sn-kanban-column-description {
  margin-block-start: var(--sn-step-1);
  color: var(--sn-kanban-description-color);
  font-size: var(--sn-kanban-description-size, 11px);
  line-height: 1.3;
}

sn-kanban-board .sn-kanban-column-count {
  align-self: start;
  min-width: 24px;
  padding: var(--sn-step-1) var(--sn-step-3);
  border: 1px solid var(--sn-kanban-border);
  border-radius: var(--sn-radius-full);
  color: var(--sn-kanban-count-color);
  font-size: var(--sn-text-xs);
  line-height: 1.4;
  text-align: center;
}

sn-kanban-board .sn-kanban-column-body,
sn-kanban-board .sn-kanban-card-list {
  min-width: 0;
  min-height: 0;
}

sn-kanban-board .sn-kanban-column-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
}

sn-kanban-board .sn-kanban-card-list {
  display: flex;
  flex-direction: column;
  gap: var(--sn-kanban-card-gap, var(--sn-step-4));
  padding: var(--sn-kanban-card-list-padding, var(--sn-step-4));
  overflow: var(--sn-kanban-card-list-overflow, auto);
}

/* U11: one clearly-labeled empty state per column, not four dashed boxes in a row. */
sn-kanban-board .sn-kanban-column-empty {
  display: grid;
  place-items: center;
  min-height: 96px;
  padding: var(--sn-step-6);
  border: 1px dashed var(--sn-kanban-border);
  border-radius: var(--sn-radius-md);
  color: var(--sn-kanban-description-color);
  font-size: var(--sn-text-xs);
  line-height: 1.4;
  text-align: center;
}

/*
 * Fixed widget geometry: every card is the same height (height, not min-height) and clips
 * internally. Rows: meta (1 line, clipped) / title (2-line clamp) / ticker (1 line) /
 * footer (1 line, no wrap — the host's chip budget + overflow chip guarantee fit).
 */
sn-kanban-board .sn-kanban-card {
  display: grid;
  flex: 0 0 auto;
  grid-template-rows: auto auto 1fr auto;
  gap: var(--sn-step-3);
  position: relative;
  width: 100%;
  height: var(--sn-kanban-card-height, 148px);
  padding: var(--sn-kanban-card-padding, var(--sn-step-4));
  border: 1px solid var(--sn-kanban-card-border);
  border-radius: var(--sn-kanban-card-radius, 7px);
  background: var(--sn-kanban-card-bg);
  color: var(--sn-sys-on-surface);
  font: inherit;
  text-align: start;
  overflow: hidden;
  /* U08: draggable + clickable — grab affordance disambiguates from a plain button press. */
  cursor: grab;
}

sn-kanban-board .sn-kanban-card:active {
  cursor: grabbing;
}

sn-kanban-board .sn-kanban-card:hover,
sn-kanban-board .sn-kanban-card:focus-visible {
  border-color: var(--sn-kanban-card-hover-border);
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-kanban-card-bg));
  outline: none;
}

sn-kanban-board .sn-kanban-card[aria-selected="true"] {
  border-color: var(--sn-sys-accent);
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), var(--sn-kanban-card-bg));
  box-shadow: inset 0 0 0 1px var(--sn-sys-accent);
}

/* U08: explicit drag-handle affordance alongside the whole-card grab cursor. */
sn-kanban-board .sn-kanban-card-drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: start;
  width: 18px;
  height: 18px;
  margin-inline-end: var(--sn-step-2);
  color: var(--sn-kanban-description-color);
  cursor: grab;
}

sn-kanban-board .sn-kanban-card-drag-handle .material-symbols-outlined {
  font-size: var(--sn-text-lg);
}

sn-kanban-board .sn-kanban-card-title {
  display: flex;
  align-items: flex-start;
  min-width: 0;
  color: var(--sn-sys-on-surface);
  font-size: var(--sn-kanban-card-title-size, 13px);
  font-weight: 650;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

sn-kanban-board .sn-kanban-card-title-text {
  display: -webkit-box;
  min-width: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--sn-kanban-card-title-lines, 2);
}

/*
 * Host compat: the default card face no longer renders a summary (long texts live in the
 * inspector), but custom renderCard hosts may still compose this class — the clamp and the
 * --sn-kanban-card-summary-* vars stay accepted.
 */
sn-kanban-board .sn-kanban-card-summary {
  display: -webkit-box;
  min-width: 0;
  color: var(--sn-sys-on-surface-dim);
  font-size: var(--sn-kanban-card-summary-size, var(--sn-text-xs));
  line-height: 1.35;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--sn-kanban-card-summary-lines, 3);
}

/* Ticker row: the one-line "last agent action / live status" line between title and footer. */
sn-kanban-board .sn-kanban-card-ticker {
  display: flex;
  align-items: center;
  align-self: start;
  gap: var(--sn-step-2);
  min-width: 0;
  color: var(--sn-sys-on-surface-dim);
  font-size: var(--sn-kanban-card-ticker-size, var(--sn-text-xs));
  line-height: 1.35;
}

sn-kanban-board .sn-kanban-card-ticker .material-symbols-outlined {
  font-size: 1.15em; /* audit-ok: icon scales with the ticker text, not an absolute rung */
}

sn-kanban-board .sn-kanban-card-ticker-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

sn-kanban-board .sn-kanban-card-ticker[data-kind="state"] {
  color: color-mix(in oklch, var(--sn-sys-accent) 72%, var(--sn-sys-on-surface));
}

sn-kanban-board .sn-kanban-card-ticker[data-kind="warning"] {
  color: color-mix(in oklch, var(--sn-sys-warning) 78%, var(--sn-sys-on-surface));
}

sn-kanban-board .sn-kanban-card-ticker[data-kind="error"] {
  color: color-mix(in oklch, var(--sn-sys-danger) 78%, var(--sn-sys-on-surface));
}

@keyframes sn-kanban-card-spin { to { transform: rotate(360deg); } }
sn-kanban-board .sn-kanban-card-spinner {
  display: inline-block;
  width: 11px;
  height: 11px;
  margin-inline-end: var(--sn-step-3);
  vertical-align: -1px;
  border: 2px solid var(--sn-kanban-card-border);
  border-top-color: var(--sn-sys-accent);
  border-radius: 50%;
  animation: sn-kanban-card-spin var(--sn-animation-duration-fast) linear infinite;
}
sn-kanban-board .sn-kanban-card[data-busy] {
  border-color: color-mix(in oklch, var(--sn-sys-accent) 45%, var(--sn-kanban-card-border));
}

/* Fixed geometry: the meta row is a single clipped line inside the uniform-height card. */
sn-kanban-board .sn-kanban-card-meta {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--sn-step-2);
  min-width: 0;
  color: var(--sn-sys-on-surface-dim);
  font-size: var(--sn-text-xs);
  line-height: 1.35;
  overflow: hidden;
}

/*
 * Fixed geometry: the footer is one non-wrapping line — the host's chip budget plus the
 * '+N' overflow chip guarantee the row fits (U01 lives in that contract, not in wrapping).
 */
sn-kanban-board .sn-kanban-card-footer {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--sn-step-2);
  min-width: 0;
  color: var(--sn-sys-on-surface-dim);
  font-size: var(--sn-text-xs);
  line-height: 1.35;
  overflow: hidden;
}

sn-kanban-board .sn-kanban-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sn-step-1);
  max-width: 100%;
  min-height: 18px;
  padding: var(--sn-step-0) var(--sn-step-3);
  border: 1px solid var(--sn-kanban-card-border);
  border-radius: var(--sn-radius-full);
  color: var(--sn-sys-on-surface-dim);
  font-size: var(--sn-text-2xs);
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Chip icons scale with the chip text instead of inheriting an oversized glyph size. */
sn-kanban-board .sn-kanban-chip .material-symbols-outlined {
  font-size: 1.15em; /* audit-ok: icon proportion relative to chip text, not an absolute rung */
}

/*
 * Quiet '' chips (duration, tokens, project, kind telemetry) stay outline-only and step back
 * further than kinded chips: dimmer border and text, no fill to fight the status containers.
 */
sn-kanban-board .sn-kanban-chip:not([data-kind]) {
  border-color: color-mix(in oklch, var(--sn-kanban-card-border) 62%, transparent);
  color: color-mix(in oklch, var(--sn-sys-on-surface-dim) 82%, var(--sn-kanban-card-bg));
}

/* U01: explicit "+N more" overflow affordance chip, never a mid-character clip. */
sn-kanban-board .sn-kanban-chip[data-kind="overflow"] {
  color: var(--sn-kanban-description-color);
  border-style: dashed;
  font-weight: 600;
}

/*
 * U05: status/priority chips carry more visual weight via the status container roles
 * (filled, not just an outline) than plain metadata chips, which stay neutral/quiet.
 * U15: color is never the only signal — chip markup pairs an icon/text prefix with the label,
 * so kind is legible without relying on chip color alone.
 */
/*
 * 'state' — execution state (running/queued/recovering): accent-tinted fill, and the ONLY
 * chip family allowed to animate (a quiet pulse alongside the card's busy spinner).
 */
sn-kanban-board .sn-kanban-chip[data-kind="state"] {
  border-color: color-mix(in oklch, var(--sn-sys-accent) 46%, var(--sn-kanban-card-border));
  background: color-mix(in oklch, var(--sn-sys-accent) 14%, var(--sn-kanban-card-bg));
  color: var(--sn-sys-on-surface);
  font-weight: 600;
  animation: sn-kanban-chip-pulse var(--sn-animation-duration-slower) ease-in-out infinite;
}

@keyframes sn-kanban-chip-pulse {
  50% {
    border-color: color-mix(in oklch, var(--sn-sys-accent) 72%, var(--sn-kanban-card-border));
    background: color-mix(in oklch, var(--sn-sys-accent) 22%, var(--sn-kanban-card-bg));
  }
}

sn-kanban-board .sn-kanban-chip[data-kind="status"] {
  border-color: color-mix(in oklch, var(--sn-sys-success) 46%, var(--sn-kanban-card-border));
  background: var(--sn-sys-success-container);
  color: var(--sn-sys-on-success-container);
  font-weight: 600;
}

sn-kanban-board .sn-kanban-chip[data-kind="warning"] {
  border-color: color-mix(in oklch, var(--sn-sys-warning) 46%, var(--sn-kanban-card-border));
  background: var(--sn-sys-warning-container);
  color: var(--sn-sys-on-warning-container);
  font-weight: 600;
}

sn-kanban-board .sn-kanban-chip[data-kind="error"] {
  border-color: color-mix(in oklch, var(--sn-sys-danger) 46%, var(--sn-kanban-card-border));
  background: var(--sn-sys-danger-container);
  color: var(--sn-sys-on-danger-container);
  font-weight: 600;
}

/*
 * Dependency counters: a quiet outline chip (never a filled status), tinted only on the lock icon
 * so blocked (danger) vs unlocks (success) reads without competing with real status/outcome fills.
 * The lock / lock_open icon + count is the primary signal (U15: not color-only).
 */
sn-kanban-board .sn-kanban-chip[data-kind="dep-blocked"] .material-symbols-outlined {
  color: color-mix(in oklch, var(--sn-sys-danger) 72%, var(--sn-sys-on-surface-dim));
}

sn-kanban-board .sn-kanban-chip[data-kind="dep-unlocks"] .material-symbols-outlined {
  color: color-mix(in oklch, var(--sn-sys-success) 72%, var(--sn-sys-on-surface-dim));
}

/*
 * Agent identity chip: --sn-kanban-chip-accent carries the agent's declared color (board DATA,
 * set per chip via the chip's accent field) — the container-fill/border math stays in the theme so an
 * arbitrary data color always lands on a readable, theme-consistent chip. Icon = the agent's
 * declared symbol; text stays on-surface (U15: color is identity, never the only signal).
 */
sn-kanban-board .sn-kanban-chip[data-kind="agent"] {
  border-color: color-mix(in oklch, var(--sn-kanban-chip-accent, var(--sn-sys-accent)) 46%, var(--sn-kanban-card-border));
  background: color-mix(in oklch, var(--sn-kanban-chip-accent, var(--sn-sys-accent)) 14%, var(--sn-sys-surface-raised));
  color: var(--sn-sys-on-surface);
  font-weight: 600;
}

sn-kanban-board .sn-kanban-chip[data-kind="agent"] .material-symbols-outlined {
  color: color-mix(in oklch, var(--sn-kanban-chip-accent, var(--sn-sys-accent)) 78%, var(--sn-sys-on-surface));
}

sn-kanban-board .sn-kanban-card-action {
  display: flex;
  align-items: center;
  gap: var(--sn-step-3);
  width: 100%;
  min-height: 30px;
  padding: var(--sn-step-2) var(--sn-step-4);
  border: 1px solid var(--sn-kanban-card-border);
  border-radius: var(--sn-radius-md);
  background: var(--sn-sys-surface-overlay);
  color: var(--sn-sys-on-surface);
  font: inherit;
  font-size: var(--sn-text-xs);
  text-align: start;
  cursor: pointer;
}

sn-kanban-board .sn-kanban-card-action:hover:not(:disabled),
sn-kanban-board .sn-kanban-card-action:focus-visible {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-overlay));
}

sn-kanban-board .sn-kanban-card-action[data-kind="danger"] {
  color: var(--sn-sys-danger);
  border-color: color-mix(in oklch, var(--sn-sys-danger) 45%, var(--sn-kanban-card-border));
}

sn-kanban-board .sn-kanban-card-action .material-symbols-outlined {
  font-size: var(--sn-text-xl);
}

/*
 * U07: the '⋯' actions menu reuses the sn-dropdown native popover + anchor-positioning
 * primitive (menu/Menu/Menu.js) — it floats over the board instead of reflowing the card
 * (the old full-width in-card expansion column-span is gone).
 */
sn-kanban-board .sn-kanban-card-actions {
  --sn-dropdown-position-area: block-end span-inline-end;
  --sn-dropdown-min-width: 180px;

  justify-self: end;
  min-width: 0;
}

sn-kanban-board .sn-kanban-card-menu {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--sn-kanban-card-border);
  border-radius: var(--sn-radius-full);
  background: var(--sn-sys-surface-overlay);
  color: var(--sn-sys-on-surface);
  cursor: pointer;
}

sn-kanban-board .sn-kanban-card-menu:hover,
sn-kanban-board .sn-kanban-card-menu:focus-visible {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-overlay));
  outline: none;
}

sn-kanban-board .sn-kanban-card-menu .material-symbols-outlined {
  font-size: var(--sn-text-xl);
}

sn-kanban-board .sn-kanban-empty {
  display: grid;
  place-items: center;
  min-height: 96px;
  padding: var(--sn-step-6);
  border: 1px dashed var(--sn-kanban-border);
  border-radius: var(--sn-radius-md);
  color: var(--sn-kanban-description-color);
  font-size: var(--sn-text-xs);
  line-height: 1.4;
  text-align: center;
}

sn-kanban-board .sn-kanban-empty[hidden] {
  display: none !important;
}

/*
 * Narrow-column adaptivity (house pattern: named inline-size @container queries, see
 * ChatComposer.css.js / LayoutNode.css.js). The column is the container: as it narrows,
 * quiet chips shed their icons, the drag handle goes, paddings tighten one rung; below
 * ~210px quiet chips disappear entirely — identity/state/outcome chips survive.
 */
@container kanban-column (width <= 250px) {
  sn-kanban-board .sn-kanban-chip:not([data-kind]) .material-symbols-outlined {
    display: none;
  }

  sn-kanban-board .sn-kanban-card-drag-handle {
    display: none;
  }

  sn-kanban-board .sn-kanban-card {
    padding: var(--sn-kanban-card-padding-narrow, var(--sn-step-3));
  }

  sn-kanban-board .sn-kanban-card-list {
    gap: var(--sn-step-3);
    padding: var(--sn-step-3);
  }
}

@container kanban-column (width <= 210px) {
  sn-kanban-board .sn-kanban-chip:not([data-kind]) {
    display: none;
  }
}
`;
