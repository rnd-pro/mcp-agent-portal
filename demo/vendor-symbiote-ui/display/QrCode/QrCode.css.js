export default /*css*/ `
sn-qr-code {
  display: inline-block;
  font-family: var(--sn-font, sans-serif);
  box-sizing: border-box;
}

.sn-qr-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: var(--sn-sys-surface-panel);
  border: 1px solid var(--sn-sys-outline-subtle);
  border-radius: var(--sn-panel-radius, 6px);
  padding: var(--sn-step-6);
  box-sizing: border-box;
}

.sn-qr-svg-wrap {
  width: 120px;
  height: 120px;
  background-color: var(--sn-qr-background, #fff);
  padding: var(--sn-step-3);
  border-radius: var(--sn-radius-sm);
  box-sizing: border-box;
}

.sn-qr-svg {
  width: 100%;
  height: 100%;
}

.sn-qr-module {
  fill: var(--sn-qr-module-color, #000);
}

.sn-qr-label {
  margin-top: var(--sn-step-4);
  max-width: 120px;
  font-size: var(--sn-text-xs);
  color: var(--sn-sys-on-surface-dim);
  overflow-wrap: anywhere;
}
`;
