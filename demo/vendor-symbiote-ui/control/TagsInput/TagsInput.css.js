export default /*css*/ `
sn-tags-input {
  display: block;
  font-family: var(--sn-font, sans-serif);
  width: 100%;
}

.sn-tags-container {
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sn-step-3);
  width: 100%;
  min-height: calc(36px * var(--sn-theme-density, 1));
  padding: var(--sn-step-2, 4px) calc(12px * var(--sn-theme-density, 1));
  background: var(--sn-field-control-bg, var(--sn-sys-surface));
  border: 1px solid var(--sn-field-control-border, var(--sn-outline-color-soft, var(--sn-sys-outline-subtle)));
  border-radius: var(--sn-field-control-radius, var(--sn-panel-radius, 6px));
  transition: border-color var(--sn-transition-fast, 120ms);
}

.sn-tags-container:focus-within {
  border-color: var(--sn-field-control-focus-border, var(--sn-sys-accent));
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--sn-sys-accent) 25%, transparent);
}

.sn-tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sn-step-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.sn-tags-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sn-step-2);
  padding: var(--sn-step-1) var(--sn-step-4);
  background-color: var(--sn-sys-surface-panel);
  border: 1px solid var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
  border-radius: var(--sn-radius-sm);
  font-size: calc(12px * var(--sn-theme-type-scale, 1));
  color: var(--sn-sys-on-surface);
  user-select: none;
}

.sn-tags-chip-remove {
  background: none;
  border: none;
  color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
}

.sn-tags-chip-remove:hover:not([disabled]) {
  color: var(--sn-status-error, color-mix(in oklch, var(--sn-sys-on-surface) var(--sn-sys-state-hover-mix), var(--sn-sys-danger)));
}

.sn-tags-chip-remove:focus-visible {
  outline: var(--sn-tags-focus-ring, 2px solid var(--sn-sys-focus-ring, currentColor));
  outline-offset: 2px;
  border-radius: var(--sn-radius-sm);
}

.sn-tags-chip-remove[disabled] {
  cursor: not-allowed;
}

.sn-tags-chip-remove-icon {
  font-size: var(--sn-text-lg);
}

.sn-tags-input-field {
  flex: 1;
  min-width: 60px;
  background: transparent;
  border: none;
  outline: none;
  color: var(--sn-sys-on-surface);
  font-size: calc(13px * var(--sn-theme-type-scale, 1));
  padding: var(--sn-step-2) 0;
}

sn-tags-input[disabled] .sn-tags-container {
  cursor: not-allowed;
  opacity: 0.6;
}
`;
