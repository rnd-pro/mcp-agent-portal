export default /*css*/ `
sn-stepper {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  gap: var(--sn-stepper-gap, 8px);
  font-family: var(--sn-font, sans-serif);
  font-size: var(--sn-stepper-font-size, 12px);
}

sn-stepper[hidden] {
  display: none !important;
}

.sn-stepper-step {
  display: flex;
  align-items: center;
  gap: var(--sn-step-4);
  position: relative;
  flex: 1;
}

.sn-stepper-step:last-child {
  flex: 0 0 auto;
}

.sn-stepper-step:focus-visible {
  outline: var(--sn-stepper-focus-ring, 2px solid var(--sn-sys-focus-ring, currentColor));
  outline-offset: 2px;
  border-radius: var(--sn-radius-sm, 4px);
}

.sn-stepper-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--sn-stepper-indicator-size, 24px);
  height: var(--sn-stepper-indicator-size, 24px);
  border-radius: 50%;
  background: var(--sn-stepper-indicator-bg, var(--sn-sys-surface));
  border: 2px solid var(--sn-stepper-indicator-border, var(--sn-outline-color, var(--sn-sys-outline)));
  color: var(--sn-stepper-indicator-color, var(--sn-sys-on-surface-dim));
  font-size: var(--sn-text-xs);
  font-weight: 600;
  transition: all var(--sn-transition-normal, 240ms);
}

.sn-stepper-label {
  color: var(--sn-stepper-label-color, var(--sn-sys-on-surface-dim));
  white-space: nowrap;
}

.sn-stepper-line {
  flex: 1;
  height: 2px;
  background: var(--sn-stepper-line-bg, var(--sn-outline-color-soft, var(--sn-sys-outline-subtle)));
  margin: 0 var(--sn-step-4);
  transition: background var(--sn-transition-normal, 240ms);
}

/* Completed state */
.sn-stepper-step[data-state="completed"] .sn-stepper-indicator {
  /* full-strength completed fill */
  background: var(--sn-stepper-completed-bg, color-mix(in oklch, var(--sn-sys-success) 100%, transparent));
  border-color: var(--sn-stepper-completed-border, var(--sn-sys-success));
  color: var(--sn-stepper-completed-color, var(--sn-sys-on-surface));
}

.sn-stepper-step[data-state="completed"] .sn-stepper-line {
  background: var(--sn-stepper-completed-line, color-mix(in oklch, var(--sn-sys-success) 100%, transparent));
}

.sn-stepper-step[data-state="completed"] .sn-stepper-label {
  color: var(--sn-stepper-completed-label-color, color-mix(in oklch, var(--sn-sys-on-surface) 100%, transparent));
}

/* Active state */
.sn-stepper-step[data-state="active"] .sn-stepper-indicator {
  background: var(--sn-stepper-active-bg, var(--sn-sys-accent));
  border-color: var(--sn-stepper-active-border, var(--sn-sys-accent));
  color: var(--sn-stepper-active-color, var(--sn-sys-on-surface));
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--sn-sys-accent) 25%, transparent);
}

.sn-stepper-step[data-state="active"] .sn-stepper-label {
  color: var(--sn-stepper-active-label-color, color-mix(in oklch, var(--sn-sys-on-surface) 100%, transparent));
  font-weight: 600;
}

.sn-stepper-indicator .material-symbols-outlined {
  font-size: var(--sn-text-lg);
}
`;
