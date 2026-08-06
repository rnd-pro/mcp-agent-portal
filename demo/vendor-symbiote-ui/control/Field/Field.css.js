export default /*css*/ `
sn-field {
  display: block;
  box-sizing: border-box;
  margin-block-end: var(--sn-field-margin-block-end);
  color: var(--sn-sys-on-surface);
  font-family: var(--sn-font);
}

sn-field[hidden] {
  display: none !important;
}

.sn-field-container {
  display: flex;
  flex-direction: column;
}

sn-field > label,
sn-field > [slot="label"],
sn-field > .sn-field-label {
  display: block;
  margin-block-end: var(--sn-field-label-margin-block-end);
  color: var(--sn-field-label-color);
  font-size: var(--sn-field-label-size);
  font-weight: var(--sn-field-label-weight);
  line-height: var(--sn-field-label-line-height);
  text-transform: var(--sn-field-label-transform);
}

sn-field[required] > label::after,
sn-field[required] > [slot="label"]::after,
sn-field[required] > .sn-field-label::after {
  content: ' *';
  color: var(--sn-field-required-color, var(--sn-status-error, var(--sn-sys-danger)));
}

.sn-field-control-wrapper {
  display: flex;
  align-items: center;
  gap: var(--sn-field-control-gap, 8px);
  width: 100%;
  position: relative;
}

sn-field input,
sn-field select,
sn-field textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--sn-field-control-border);
  border-radius: var(--sn-field-control-radius);
  background: var(--sn-field-control-bg);
  color: var(--sn-field-control-color);
  padding: var(--sn-field-control-padding);
  font-family: var(--sn-font);
  font-size: var(--sn-field-control-font-size);
  line-height: var(--sn-field-control-line-height);
  transition: border-color var(--sn-transition-fast, 150ms) ease, background var(--sn-transition-fast, 150ms) ease, box-shadow var(--sn-transition-fast, 150ms) ease;
}

sn-field input::placeholder,
sn-field textarea::placeholder {
  color: var(--sn-field-placeholder-color);
}

sn-field input:focus,
sn-field select:focus,
sn-field textarea:focus {
  outline: none;
  border-color: var(--sn-field-control-focus-border, var(--sn-sys-accent));
  box-shadow: var(--sn-field-control-focus-shadow, 0 0 0 2px color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), transparent));
}

sn-field input:focus-visible,
sn-field select:focus-visible,
sn-field textarea:focus-visible {
  outline: var(--sn-field-control-focus-ring, var(--sn-button-focus-ring, 2px solid var(--sn-sys-focus-ring, currentColor)));
  outline-offset: var(--sn-field-control-focus-offset, 1px);
}

sn-field[disabled] {
  opacity: var(--sn-field-disabled-opacity, 0.6);
}

sn-field[disabled] input,
sn-field[disabled] select,
sn-field[disabled] textarea {
  cursor: not-allowed;
  background: var(--sn-field-control-disabled-bg, color-mix(in oklab, var(--sn-sys-on-surface) 5%, transparent));
}

sn-field[readonly] input,
sn-field[readonly] select,
sn-field[readonly] textarea {
  background: var(--sn-field-control-readonly-bg, transparent);
  border-style: dashed;
}

sn-field[invalid] input,
sn-field[invalid] select,
sn-field[invalid] textarea {
  border-color: var(--sn-field-control-error-border, var(--sn-status-error, var(--sn-sys-danger)));
}

sn-field[invalid] input:focus,
sn-field[invalid] select:focus,
sn-field[invalid] textarea:focus {
  box-shadow: var(--sn-field-control-error-shadow, 0 0 0 2px color-mix(in oklch, var(--sn-sys-danger) var(--sn-sys-state-selected-mix), transparent));
}

sn-field textarea {
  min-height: var(--sn-field-textarea-min-height);
  resize: vertical;
}

sn-field [slot="hint"],
sn-field .sn-field-hint {
  display: block;
  margin-block-start: var(--sn-field-hint-margin-block-start);
  color: var(--sn-field-hint-color);
  font-size: var(--sn-field-hint-size);
  line-height: var(--sn-field-hint-line-height);
}

sn-field [slot="error"],
sn-field .sn-field-error {
  display: block;
  margin-block-start: var(--sn-field-error-margin-block-start, 4px);
  color: var(--sn-field-error-color, var(--sn-status-error, var(--sn-sys-danger)));
  font-size: var(--sn-field-error-size, 11px);
  line-height: var(--sn-field-error-line-height, 1.2);
}

sn-field:not([invalid]) [slot="error"] {
  display: none !important;
}

sn-field[variant="inline"] {
  display: flex;
  align-items: center;
  gap: var(--sn-field-inline-gap);
}

sn-field[variant="inline"] > .sn-field-container {
  flex-direction: row;
  align-items: center;
  gap: var(--sn-field-inline-gap);
  width: 100%;
}

sn-field[variant="inline"] > label,
sn-field[variant="inline"] > [slot="label"],
sn-field[variant="inline"] > .sn-field-label {
  margin-block-end: 0;
}

sn-field[variant="compact"] {
  margin-block-end: var(--sn-field-compact-margin-block-end);
}

sn-field[variant="compact"] input,
sn-field[variant="compact"] select,
sn-field[variant="compact"] textarea {
  padding: var(--sn-field-compact-control-padding);
}

sn-field [slot="prefix"],
sn-field [slot="suffix"] {
  display: inline-flex;
  align-items: center;
  color: var(--sn-sys-on-surface-dim);
}
`;
