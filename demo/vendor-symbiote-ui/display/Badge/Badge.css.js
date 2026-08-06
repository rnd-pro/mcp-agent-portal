export default /*css*/ `
sn-badge {
  display: inline-flex;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  gap: var(--sn-badge-gap, 4px);
  min-width: 0;
  padding: var(--sn-badge-padding, 2px 8px);
  border: 1px solid var(--sn-badge-border, var(--sn-sys-outline));
  border-radius: var(--sn-badge-radius, 12px);
  background: var(--sn-badge-bg, transparent);
  color: var(--sn-badge-color, var(--sn-sys-on-surface-dim));
  font-family: var(--sn-font, sans-serif);
  font-size: var(--sn-badge-font-size, 12px);
  font-weight: var(--sn-badge-font-weight, 500);
  line-height: var(--sn-badge-line-height, 1.2);
  white-space: nowrap;
}

sn-badge[hidden] {
  display: none !important;
}

sn-badge[variant="success"] {
  background: var(--sn-badge-success-bg, color-mix(in oklch, var(--sn-sys-success) 15%, transparent));
  border-color: var(--sn-badge-success-border, color-mix(in oklch, var(--sn-sys-success) 76%, transparent));
  color: var(--sn-badge-success-color, var(--sn-sys-success));
}

sn-badge[variant="info"] {
  background: var(--sn-badge-info-bg, color-mix(in oklch, var(--sn-sys-info) 15%, transparent));
  border-color: var(--sn-badge-info-border, color-mix(in oklch, var(--sn-sys-info) 76%, transparent));
  color: var(--sn-badge-info-color, var(--sn-sys-info));
}

sn-badge[variant="warning"] {
  background: var(--sn-badge-warning-bg, color-mix(in oklch, var(--sn-sys-warning) 15%, transparent));
  border-color: var(--sn-badge-warning-border, color-mix(in oklch, var(--sn-sys-warning) 76%, transparent));
  color: var(--sn-badge-warning-color, var(--sn-sys-warning));
}

sn-badge[variant="error"] {
  background: var(--sn-badge-error-bg, color-mix(in oklch, var(--sn-sys-danger) 15%, transparent));
  border-color: var(--sn-badge-error-border, color-mix(in oklch, var(--sn-sys-danger) 76%, transparent));
  color: var(--sn-badge-error-color, var(--sn-sys-danger));
}

sn-badge[variant="neutral"] {
  background: var(--sn-badge-neutral-bg, color-mix(in oklch, var(--sn-sys-on-surface-dim) 10%, transparent));
  border-color: var(--sn-badge-neutral-border, var(--sn-badge-border, var(--sn-sys-outline)));
  color: var(--sn-badge-neutral-color, var(--sn-sys-on-surface-dim));
}
`;
