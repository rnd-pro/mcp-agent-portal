export default /*css*/ `
sn-banner {
  display: flex;
  box-sizing: border-box;
  align-items: center;
  gap: var(--sn-banner-gap, 8px);
  width: 100%;
  min-width: 0;
  margin-block-end: var(--sn-banner-margin-block-end, 16px);
  padding: var(--sn-banner-padding, 10px 14px);
  border: 1px solid var(--sn-banner-border, var(--sn-sys-outline));
  border-radius: var(--sn-banner-radius, 8px);
  background: var(--sn-banner-bg, transparent);
  color: var(--sn-banner-color, var(--sn-sys-on-surface));
  font-family: var(--sn-font, sans-serif);
  font-size: var(--sn-banner-font-size, 12px);
  font-weight: var(--sn-banner-font-weight, 500);
  line-height: var(--sn-banner-line-height, 1.4);
}

sn-banner[hidden] {
  display: none !important;
}

sn-banner[variant="running"],
sn-banner[variant="info"] {
  background: var(--sn-banner-info-bg, color-mix(in oklch, var(--sn-sys-info) 12%, transparent));
  border-color: var(--sn-banner-info-border, color-mix(in oklch, var(--sn-sys-info) 58%, transparent));
  color: var(--sn-banner-info-color, var(--sn-sys-info));
}

sn-banner[variant="success"] {
  background: var(--sn-banner-success-bg, color-mix(in oklch, var(--sn-sys-success) 12%, transparent));
  border-color: var(--sn-banner-success-border, color-mix(in oklch, var(--sn-sys-success) 58%, transparent));
  color: var(--sn-banner-success-color, var(--sn-sys-success));
}

sn-banner[variant="warning"] {
  background: var(--sn-banner-warning-bg, color-mix(in oklch, var(--sn-sys-warning) 12%, transparent));
  border-color: var(--sn-banner-warning-border, color-mix(in oklch, var(--sn-sys-warning) 58%, transparent));
  color: var(--sn-banner-warning-color, var(--sn-sys-warning));
}

sn-banner[variant="error"] {
  background: var(--sn-banner-error-bg, color-mix(in oklch, var(--sn-sys-danger) 12%, transparent));
  border-color: var(--sn-banner-error-border, color-mix(in oklch, var(--sn-sys-danger) 58%, transparent));
  color: var(--sn-banner-error-color, var(--sn-sys-danger));
}

sn-banner .material-symbols-outlined {
  flex: 0 0 auto;
  font-size: var(--sn-banner-icon-size, 18px);
  line-height: 1;
}

sn-banner[variant="running"] .material-symbols-outlined {
  animation: sn-banner-spin var(--sn-banner-running-spin-duration, 2s) linear infinite;
}

@keyframes sn-banner-spin {
  to {
    transform: rotate(360deg);
  }
}
`;
