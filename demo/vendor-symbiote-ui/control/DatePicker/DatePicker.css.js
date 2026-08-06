export default /*css*/ `
sn-date-picker {
  display: block;
  font-family: var(--sn-font, sans-serif);
  position: relative;
  width: 100%;
}

.sn-date-container {
  position: relative;
  width: 100%;
}

.sn-date-trigger {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: calc(36px * var(--sn-theme-density, 1));
  padding: 0 calc(12px * var(--sn-theme-density, 1));
  background: var(--sn-field-control-bg, var(--sn-sys-surface));
  border: 1px solid var(--sn-field-control-border, var(--sn-outline-color-soft, var(--sn-sys-outline-subtle)));
  border-radius: var(--sn-field-control-radius, var(--sn-panel-radius, 6px));
  color: var(--sn-sys-on-surface);
  font-size: calc(13px * var(--sn-theme-type-scale, 1));
  cursor: pointer;
  text-align: left;
}

.sn-date-trigger:focus-visible {
  outline: none;
  border-color: var(--sn-field-control-focus-border, var(--sn-sys-accent));
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--sn-sys-accent) 25%, transparent);
}

.sn-date-calendar-icon {
  color: var(--sn-sys-on-surface-dim);
}

.sn-date-dropdown {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 1000;
  margin-top: var(--sn-step-2);
  background-color: var(--sn-sys-surface-panel);
  border: 1px solid var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
  border-radius: var(--sn-panel-radius, 6px);
  box-shadow: var(--sn-panel-shadow, var(--sn-sys-shadow-overlay));
  padding: var(--sn-step-4);
  box-sizing: border-box;
  min-width: 260px;
}

.sn-date-dropdown[data-visible] {
  display: block;
}

.sn-date-native-input {
  display: none;
}

.sn-calendar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--sn-step-4);
}

.sn-calendar-nav-btn {
  background: none;
  border: none;
  color: var(--sn-sys-on-surface);
  cursor: pointer;
  padding: var(--sn-step-2);
  border-radius: var(--sn-radius-sm);
}

.sn-calendar-nav-btn:hover {
  background-color: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel));
}

.sn-calendar-title {
  font-size: calc(13px * var(--sn-theme-type-scale, 1));
  font-weight: 500;
  color: var(--sn-sys-on-surface);
}

.sn-calendar-grid {
  display: flex;
  flex-direction: column;
  gap: var(--sn-step-1);
  text-align: center;
}

.sn-calendar-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--sn-step-1);
}

.sn-calendar-weekday {
  font-size: var(--sn-text-xs);
  font-weight: 500;
  color: var(--sn-sys-on-surface-dim);
  padding: var(--sn-step-2) 0;
}

.sn-calendar-day {
  font-size: calc(12px * var(--sn-theme-type-scale, 1));
  padding: var(--sn-step-3) 0;
  color: var(--sn-sys-on-surface);
  border-radius: var(--sn-radius-sm);
  cursor: pointer;
}

.sn-calendar-day:hover {
  background-color: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel));
}

.sn-calendar-day:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--sn-sys-accent) 60%, transparent);
}

.sn-calendar-nav-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--sn-sys-accent) 60%, transparent);
}

.sn-calendar-day[data-selected] {
  /* full-strength selected fill */
  background-color: color-mix(in oklch, var(--sn-sys-accent) 100%, transparent);
  color: var(--sn-node-selected-text, var(--sn-sys-on-accent));
  font-weight: bold;
}

.sn-calendar-day[data-selected]:hover {
  background-color: color-mix(in oklch, var(--sn-sys-on-surface) var(--sn-sys-state-hover-mix), var(--sn-sys-accent));
}

.sn-calendar-day[data-other-month] {
  opacity: 0.4;
}

sn-date-picker[disabled] .sn-date-trigger {
  cursor: not-allowed;
  opacity: 0.6;
}
`;
