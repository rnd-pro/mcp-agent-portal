export default /*css*/ `
sn-toolbar {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  background: var(--sn-toolbar-bg, color-mix(in oklch, var(--sn-sys-surface-toolbar) 94%, transparent));
  border: 1px solid var(--sn-toolbar-border, var(--sn-sys-outline));
  border-radius: var(--sn-toolbar-radius, 4px);
  padding: var(--sn-toolbar-padding, 4px);
  gap: var(--sn-toolbar-gap, 4px);
  color: var(--sn-toolbar-color, var(--sn-sys-on-surface-dim));
  min-height: var(--sn-toolbar-height, 36px);
  max-width: 100%;
}

sn-toolbar[hidden] {
  display: none !important;
}

sn-toolbar[orientation="vertical"] {
  flex-direction: column;
  min-height: auto;
  min-width: var(--sn-toolbar-height, 36px);
}

sn-toolbar[compact] {
  padding: var(--sn-toolbar-compact-padding, 2px);
  gap: var(--sn-toolbar-compact-gap, 2px);
  min-height: var(--sn-toolbar-compact-height, 28px);
}

sn-toolbar[compact][orientation="vertical"] {
  min-width: var(--sn-toolbar-compact-height, 28px);
}
`;
