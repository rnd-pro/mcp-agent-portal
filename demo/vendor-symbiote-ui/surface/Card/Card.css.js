export default /*css*/ `
sn-card {
  --sn-card-border: var(--sn-sys-outline-subtle);
  --sn-card-bg: transparent;
  --sn-card-hover-border: var(--sn-sys-outline);

  display: block;
  box-sizing: border-box;
  min-width: 0;
  padding: var(--sn-card-padding, 12px);
  margin-block-end: var(--sn-card-margin-block-end, 0);
  border: 1px solid var(--sn-card-border);
  border-radius: var(--sn-card-radius, 4px);
  background: var(--sn-card-bg);
  color: var(--sn-sys-on-surface);
  font-family: var(--sn-font);
}

sn-card[hidden] {
  display: none !important;
}

sn-card[interactive] {
  cursor: pointer;
  transition: background var(--sn-transition-normal, 150ms) var(--sn-transition-easing, ease),
              border-color var(--sn-transition-normal, 150ms) var(--sn-transition-easing, ease),
              box-shadow var(--sn-transition-normal, 150ms) var(--sn-transition-easing, ease);
}

sn-card[interactive]:focus-visible {
  outline: var(--sn-card-focus-ring, var(--sn-sys-focus-ring-width) solid var(--sn-sys-focus-ring));
  outline-offset: 2px;
}

sn-card[interactive]:hover {
  border-color: var(--sn-card-hover-border);
  background: var(--sn-card-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised)));
}

sn-card[variant="flat"] {
  padding: 0;
  margin-block-end: 0;
  border-color: transparent;
  background: transparent;
}

sn-card[variant="panel"] {
  background: var(--sn-sys-surface-panel);
}

sn-card [slot="title"],
sn-card .sn-card-title {
  display: block;
  margin-block-end: var(--sn-card-title-margin-block-end);
  color: var(--sn-card-title-color);
  font-size: var(--sn-card-title-size);
  font-weight: var(--sn-card-title-weight);
  text-transform: uppercase;
}

sn-card [slot="footer"] {
  display: flex;
  gap: var(--sn-card-footer-gap);
  margin-block-start: var(--sn-card-footer-margin-block-start);
  padding-block-start: var(--sn-card-footer-padding-block-start);
  border-block-start: 1px solid var(--sn-card-border);
}
`;
