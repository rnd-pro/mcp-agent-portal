export default /*css*/ `
sn-status-light {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  gap: var(--sn-status-light-gap, 6px);
  font-family: var(--sn-font, sans-serif);
  font-size: var(--sn-status-light-font-size, 12px);
  color: var(--sn-status-light-color, var(--sn-sys-on-surface));
}

sn-status-light[hidden] {
  display: none !important;
}

.sn-status-light-dot {
  width: var(--sn-status-light-size, 8px);
  height: var(--sn-status-light-size, 8px);
  border-radius: 50%;
  background: var(--sn-status-light-bg, var(--sn-sys-on-surface-faint));
  transition: background var(--sn-transition-normal, 240ms);
  flex-shrink: 0;
}

sn-status-light[variant="success"] .sn-status-light-dot {
  background: var(--sn-status-light-success, var(--sn-sys-success));
  box-shadow: 0 0 4px var(--sn-status-light-success, var(--sn-sys-success));
}

sn-status-light[variant="warning"] .sn-status-light-dot {
  background: var(--sn-status-light-warning, var(--sn-sys-warning));
  box-shadow: 0 0 4px var(--sn-status-light-warning, var(--sn-sys-warning));
}

sn-status-light[variant="error"] .sn-status-light-dot {
  background: var(--sn-status-light-error, var(--sn-sys-danger));
  box-shadow: 0 0 4px var(--sn-status-light-error, var(--sn-sys-danger));
}

sn-status-light[variant="info"] .sn-status-light-dot {
  background: var(--sn-status-light-info, var(--sn-sys-info));
  box-shadow: 0 0 4px var(--sn-status-light-info, var(--sn-sys-info));
}

sn-status-light[variant="neutral"] .sn-status-light-dot {
  background: var(--sn-status-light-neutral, var(--sn-sys-on-surface-faint));
  box-shadow: none;
}
`;
