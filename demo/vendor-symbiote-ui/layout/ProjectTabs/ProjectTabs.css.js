import { themedScrollFadeInlineStyles } from '../../themes/scroll-fade-styles.js';

export default /*css*/ `
:host,
project-tabs {
  display: block;
  height: var(--sn-tabs-height);
  background: var(--sn-tabs-bg);
  flex-shrink: 0;
  user-select: none;
  position: relative;
}

[data-cascade-tab-shape="ear"] project-tabs,
[data-cascade-tab-shape="classic-ear"] project-tabs,
project-tabs[data-cascade-tab-shape="ear"],
project-tabs[data-cascade-tab-shape="classic-ear"],
:host([data-cascade-tab-shape="ear"]),
:host([data-cascade-tab-shape="classic-ear"]) {
  --sn-tabs-ear-radius: var(--sn-tabs-corner-radius, var(--sn-tabs-radius, 8px));
  --sn-tabs-bar-align: flex-end;
  --sn-tabs-item-border-bottom: none;
  --sn-tabs-active-border-bottom: none;
  --sn-tabs-radius: var(--sn-tabs-ear-radius) var(--sn-tabs-ear-radius) 0 0;
}

[data-cascade-tab-shape="classic-ear"] project-tabs,
project-tabs[data-cascade-tab-shape="classic-ear"],
:host([data-cascade-tab-shape="classic-ear"]) {
  --sn-tabs-active-corner-display: block;
  --sn-tabs-corner-size: 12px;
  --sn-tabs-corner-cut: 11.5px;
}

.tab-bar {
  display: flex;
  align-items: var(--sn-tabs-bar-align, center);
  height: 100%;
  padding: var(--sn-tabs-bar-padding, 0 12px);
  overflow-x: auto;
  ${themedScrollFadeInlineStyles}
  scrollbar-width: none;
  position: relative;
  z-index: 2;
}

.tab-bar::-webkit-scrollbar {
  display: none;
}

.tab,
project-tab-item {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--sn-tabs-item-gap, 6px);
  padding: var(--sn-tabs-item-padding, 0 10px);
  height: var(--sn-tabs-item-height);
  border: 1px solid var(--sn-tabs-item-border, transparent);
  border-bottom: var(--sn-tabs-item-border-bottom, 1px solid var(--sn-tabs-item-border, transparent));
  background: transparent;
  color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
  font-size: var(--sn-tabs-item-font-size, 12px);
  font-family: inherit;
  white-space: nowrap;
  transition: background var(--sn-transition-fast) var(--sn-transition-easing), color var(--sn-transition-fast) var(--sn-transition-easing);
  position: relative;
  border-radius: var(--sn-tabs-radius);
  margin: 0 var(--sn-tabs-item-margin-inline, 2px);
}

.tab .material-symbols-outlined,
project-tab-item .material-symbols-outlined {
  font-size: var(--sn-tabs-icon-size, 15px);
  color: var(--tab-accent, var(--sn-tabs-accent));
}

.tab:hover,
project-tab-item:hover:not([disabled]) {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-tabs-bg, transparent));
  color: var(--sn-sys-on-surface);
}

project-tab-item[disabled] {
  cursor: not-allowed;
  opacity: 0.46;
}

.tab[active],
project-tab-item[active] {
  background: var(--sn-tabs-active-bg);
  border-color: var(--sn-tabs-active-border, color-mix(in oklab, var(--tab-accent, var(--sn-tabs-accent)) 44%, transparent));
  border-bottom: var(--sn-tabs-active-border-bottom, 1px solid var(--sn-tabs-active-border, color-mix(in oklab, var(--tab-accent, var(--sn-tabs-accent)) 44%, transparent)));
  color: var(--sn-sys-on-surface);
  /* the active tab inverts its background, so derive a legible label colour from
     that background's own lightness instead of the surrounding text colour */
  color: var(--sn-tabs-active-color, oklch(from var(--sn-tabs-active-bg) calc((l - 0.5) * -1000) 0 0));
  z-index: 3;
}

.tab[active]::before,
project-tab-item[active]::before,
.tab[active]::after,
project-tab-item[active]::after {
  content: '';
  display: var(--sn-tabs-active-corner-display, none);
  position: absolute;
  bottom: 0;
  width: var(--sn-tabs-corner-size, 12px);
  height: var(--sn-tabs-corner-size, 12px);
  pointer-events: none;
}

.tab[active]::before,
project-tab-item[active]::before {
  left: calc(-1 * var(--sn-tabs-corner-size, 12px));
  background: radial-gradient(circle at 0 0, transparent var(--sn-tabs-corner-cut, 11.5px), var(--sn-tabs-active-bg) var(--sn-tabs-corner-size, 12px));
}

.tab[active]::after,
project-tab-item[active]::after {
  right: calc(-1 * var(--sn-tabs-corner-size, 12px));
  background: radial-gradient(circle at 100% 0, transparent var(--sn-tabs-corner-cut, 11.5px), var(--sn-tabs-active-bg) var(--sn-tabs-corner-size, 12px));
}

.tab:not([active])::after,
project-tab-item:not([active])::after {
  content: '';
  display: var(--sn-tabs-divider-display, var(--sn-tabs-chrome, block));
  position: absolute;
  right: var(--sn-step-0, -2px);
  top: 25%;
  height: 50%;
  width: 1px;
  background: var(--sn-tabs-divider);
}

.tab:not([active]):hover::after,
project-tab-item:not([active]):hover::after {
  content: none;
}

.tab:not([active]):not(:hover):has(+ .tab[active])::after,
.tab:not([active]):not(:hover):has(+ project-tab-item[active])::after,
.tab:not([active]):not(:hover):has(+ .tab:hover)::after,
.tab:not([active]):not(:hover):has(+ project-tab-item:hover)::after,
project-tab-item:not([active]):not(:hover):has(+ project-tab-item[active])::after,
project-tab-item:not([active]):not(:hover):has(+ project-tab-item:hover)::after,
.tab:not([active]):not(:hover):has(+ div > project-tab-item:first-child[active])::after,
.tab:not([active]):not(:hover):has(+ div > project-tab-item:first-child:hover)::after,
.tab:not([active]):not(:hover):last-child::after,
project-tab-item:not([active]):not(:hover):last-child::after,
.tab:not([active]):not(:hover):has(+ div:empty)::after {
  content: none;
}

.tab-lead {
  display: grid;
  place-items: center;
  width: var(--sn-tabs-close-size, 16px);
  height: var(--sn-tabs-close-size, 16px);
}

.tab-lead > * {
  grid-area: 1 / 1;
}

.tab-lead .material-symbols-outlined {
  opacity: 1;
  pointer-events: none;
  transition: opacity var(--sn-transition-fast) var(--sn-transition-easing);
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: transparent;
  border: none;
  color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
  font-size: var(--sn-tabs-close-font-size, 14px);
  padding: 0;
  line-height: 1;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--sn-transition-fast) var(--sn-transition-easing), background var(--sn-transition-fast) var(--sn-transition-easing), color var(--sn-transition-fast) var(--sn-transition-easing);
}

.tab-close[hidden] {
  display: none;
}

project-tab-item:hover .tab-lead:has(.tab-close:not([hidden])) .material-symbols-outlined {
  opacity: 0;
}

project-tab-item:hover .tab-close:not([hidden]) {
  opacity: 1;
  pointer-events: auto;
}

.tab-close:hover {
  background: color-mix(in oklab, var(--sn-sys-on-surface) 20%, transparent);
  color: var(--sn-sys-on-surface);
}

.tab-add {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--sn-tabs-add-size, 28px);
  height: var(--sn-tabs-add-size, 28px);
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
  font-size: var(--sn-tabs-add-font-size, 18px);
  transition: background var(--sn-transition-fast) var(--sn-transition-easing), color var(--sn-transition-fast) var(--sn-transition-easing);
  margin-left: var(--sn-tabs-add-margin-left, 4px);
  margin-bottom: var(--sn-tabs-add-margin-bottom, 2px);
}

.tab-add:hover {
  background: color-mix(in oklab, var(--sn-sys-on-surface) 10%, transparent);
  color: var(--sn-sys-on-surface);
}

.tab-filler {
  flex: 1;
}

.tab-items {
  display: flex;
  align-items: stretch;
}
`;
