export default /*css*/ `
sn-tour {
  display: block;
  position: fixed;
  z-index: 1500;
  font-family: var(--sn-font, sans-serif);
  box-sizing: border-box;
}

.sn-tour-popover {
  display: none;
  background-color: var(--sn-sys-surface-overlay);
  border: 1px solid var(--sn-sys-accent);
  border-radius: var(--sn-panel-radius, 6px);
  box-shadow: var(--sn-sys-shadow-overlay);
  padding: var(--sn-step-6);
  width: 240px;
  box-sizing: border-box;
  flex-direction: column;
  gap: var(--sn-step-4);
}

.sn-tour-popover[data-visible] {
  display: flex;
}

.sn-tour-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sn-tour-title {
  font-size: calc(var(--sn-text-md, 13px) * var(--sn-theme-type-scale, 1));
  font-weight: 600;
  color: var(--sn-sys-on-surface);
}

.sn-tour-close-btn {
  background: none;
  border: none;
  color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
  padding: var(--sn-step-1);
  border-radius: var(--sn-radius-sm);
}

.sn-tour-icon {
  font-size: var(--sn-text-xl);
}

.sn-tour-body {
  font-size: calc(var(--sn-text-sm, 12px) * var(--sn-theme-type-scale, 1));
  color: var(--sn-sys-on-surface-dim);
  line-height: 1.4;
}

.sn-tour-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: var(--sn-step-4);
}

.sn-tour-progress {
  font-size: var(--sn-text-xs);
  color: var(--sn-sys-on-surface-faint);
}

.sn-tour-buttons {
  display: flex;
  gap: var(--sn-step-3);
}

.sn-tour-btn {
  background: var(--sn-sys-surface-panel);
  border: 1px solid var(--sn-sys-outline-subtle);
  color: var(--sn-sys-on-surface);
  padding: var(--sn-step-2) var(--sn-step-4);
  border-radius: var(--sn-radius-sm);
  font-size: var(--sn-text-xs);
  cursor: pointer;
}

.sn-tour-btn:hover {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel));
}

.sn-tour-btn[data-primary] {
  background: var(--sn-sys-accent);
  border-color: var(--sn-sys-accent);
  color: var(--sn-sys-on-accent);
}
`;
