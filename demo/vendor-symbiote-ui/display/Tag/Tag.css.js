export default /*css*/ `
sn-tag {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  padding: var(--sn-tag-padding, 2px 8px);
  gap: var(--sn-tag-gap, 6px);
  border-radius: var(--sn-tag-radius, 12px);
  background: var(--sn-tag-bg, var(--sn-sys-outline-subtle));
  border: 1px solid var(--sn-tag-border, var(--sn-sys-outline));
  color: var(--sn-tag-color, var(--sn-sys-on-surface-dim));
  font-family: var(--sn-font, sans-serif);
  font-size: var(--sn-tag-font-size, 11px);
  font-weight: 500;
  line-height: 1.2;
}

sn-tag[hidden] {
  display: none !important;
}

sn-tag[variant="success"] {
  background: var(--sn-tag-success-bg, color-mix(in oklch, var(--sn-sys-success) 15%, transparent));
  border-color: var(--sn-tag-success-border, color-mix(in oklch, var(--sn-sys-success) 30%, transparent));
  color: var(--sn-tag-success-color, var(--sn-sys-success));
}

sn-tag[variant="warning"] {
  background: var(--sn-tag-warning-bg, color-mix(in oklch, var(--sn-sys-warning) 15%, transparent));
  border-color: var(--sn-tag-warning-border, color-mix(in oklch, var(--sn-sys-warning) 30%, transparent));
  color: var(--sn-tag-warning-color, var(--sn-sys-warning));
}

sn-tag[variant="error"] {
  background: var(--sn-tag-error-bg, color-mix(in oklch, var(--sn-sys-danger) 15%, transparent));
  border-color: var(--sn-tag-error-border, color-mix(in oklch, var(--sn-sys-danger) 30%, transparent));
  color: var(--sn-tag-error-color, var(--sn-sys-danger));
}

sn-tag[variant="info"] {
  background: var(--sn-tag-info-bg, color-mix(in oklch, var(--sn-sys-info) 15%, transparent));
  border-color: var(--sn-tag-info-border, color-mix(in oklch, var(--sn-sys-info) 30%, transparent));
  color: var(--sn-tag-info-color, var(--sn-sys-info));
}

.sn-tag-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  padding: 0;
  margin: 0 var(--sn-step-0, -4px) 0 0;
  cursor: pointer;
  color: inherit;
  border-radius: 50%;
  width: 14px;
  height: 14px;
  opacity: 0.6;
  transition: opacity var(--sn-transition-fast, 120ms), background-color var(--sn-transition-fast, 120ms);
}

.sn-tag-close-btn:hover {
  opacity: 1;
  background-color: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent);
}

.sn-tag-close-btn .material-symbols-outlined {
  font-size: var(--sn-text-sm);
}
`;
