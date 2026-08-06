const sharedUiStyles = `
:host {
  display: block;
  height: 100%;
  width: 100%;
  background: var(--sn-sys-surface-panel);
  color: var(--sn-sys-on-surface);
  overflow: hidden;
  font-family: var(--sn-font);
  font-size: 13px;
}

/* Utility Animations */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Icon Size Utilities */
.icon-sm { font-size: 14px; }
.icon-md { font-size: 16px; }
.icon-lg { font-size: 18px; }
`;

export { sharedUiStyles };
export default sharedUiStyles;
