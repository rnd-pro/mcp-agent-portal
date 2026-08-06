export default /*css*/ `
:host,
sn-list-item {
  display: block;
  color: var(--sn-sys-on-surface);
}

:host([hidden]),
sn-list-item[hidden]  {
  display: none !important;
}

.sn-list-item {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--sn-list-item-gap, 8px);
  min-height: var(--sn-list-item-min-height, 32px);
  padding: var(--sn-list-item-padding, 4px 12px);
  border: 1px solid transparent;
  border-radius: var(--sn-list-item-radius, 4px);
  background: var(--sn-list-item-bg);
  color: inherit;
  cursor: pointer;
  user-select: none;
  outline: none;
  transition:
    background 0.14s ease,
    border-color 0.14s ease,
    color 0.14s ease;
}

.sn-list-item:hover {
  background: var(--sn-list-item-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-list-item-bg, var(--sn-sys-surface-raised))));
}

.sn-list-item:focus-visible {
  box-shadow: 0 0 0 var(--sn-sys-focus-ring-width) var(--sn-list-item-focus-border, var(--sn-sys-focus-ring));
}

:host([active]) .sn-list-item,
sn-list-item[active] .sn-list-item,
:host([selected]) .sn-list-item,
sn-list-item[selected] .sn-list-item {
  background: var(--sn-list-item-active-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), var(--sn-list-item-bg, var(--sn-sys-surface-raised))));
  border-color: var(--sn-list-item-active-border, var(--sn-sys-accent));
}

:host([current]) .sn-list-item,
sn-list-item[current] .sn-list-item {
  font-weight: 600;
  color: var(--sn-list-item-active-color, var(--sn-sys-on-surface));
  background: var(--sn-list-item-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-list-item-bg, var(--sn-sys-surface-raised))));
}

:host([disabled]),
sn-list-item[disabled]  {
  color: var(--sn-list-item-disabled-color, var(--sn-sys-on-surface-dim));
}

:host([disabled]) .sn-list-item,
sn-list-item[disabled] .sn-list-item {
  cursor: not-allowed;
  opacity: var(--sn-sys-state-disabled-opacity, 0.38);
}

/* Disabled rows suppress the hover state layer: 0% mix pins the resting background */
:host([disabled]) .sn-list-item:hover,
sn-list-item[disabled] .sn-list-item:hover {
  background: color-mix(in oklch, var(--sn-sys-accent) 0%, var(--sn-list-item-bg, transparent));
}

:host([loading]) .sn-list-item,
sn-list-item[loading] .sn-list-item {
  cursor: wait;
  opacity: 0.7;
}

.sn-list-item-spinner {
  display: inline-block;
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: sn-list-item-spin var(--sn-animation-duration-fast, 0.6s) linear infinite;
  margin-inline-end: var(--sn-step-2);
  flex: 0 0 auto;
}

.sn-list-item-spinner[hidden] {
  display: none !important;
}

@keyframes sn-list-item-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .sn-list-item-spinner {
    animation-duration: var(--sn-animation-duration-slower, 2s);
  }
}

.sn-list-item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 var(--sn-list-item-icon-size, 16px);
  width: var(--sn-list-item-icon-size, 16px);
  height: var(--sn-list-item-icon-size, 16px);
  color: var(--sn-list-item-icon-color);
  font-family: var(--sn-icon-font);
  font-size: var(--sn-list-item-icon-font-size, 16px);
  line-height: 1;
}

.sn-list-item-prefix,
.sn-list-item-suffix {
  display: inline-flex;
  align-items: center;
  min-inline-size: 0;
}

.sn-list-item-prefix {
  flex: 0 0 auto;
}

.sn-list-item-suffix {
  flex: 0 0 auto;
  justify-content: flex-end;
  max-inline-size: var(--sn-list-item-meta-max-width, 38%);
  overflow: hidden;
}

.sn-list-item-body {
  display: flex;
  flex-direction: column;
  gap: var(--sn-step-1, 4px);
  min-width: 0;
  flex: 1 1 auto;
}

.sn-list-item-label,
.sn-list-item-description,
.sn-list-item-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sn-list-item-label {
  color: var(--sn-list-item-label-color, var(--sn-sys-on-surface, currentColor));
  font-size: var(--sn-list-item-label-size, 12px);
  font-weight: var(--sn-list-item-label-weight, 500);
}

.sn-list-item-description {
  color: var(--sn-list-item-description-color, var(--sn-sys-on-surface-dim, currentColor));
  font-size: var(--sn-list-item-description-size, 11px);
  line-height: 1.25;
}

.sn-list-item-meta {
  flex: 0 1 auto;
  min-inline-size: 0;
  max-inline-size: 100%;
  color: var(--sn-list-item-meta-color, var(--sn-sys-on-surface-dim, currentColor));
  font-family: var(--sn-font-mono, monospace);
  font-size: var(--sn-list-item-meta-size, 10px);
}
`;
