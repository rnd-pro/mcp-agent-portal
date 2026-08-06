export default /*css*/ `
sn-avatar {
  display: inline-flex;
  position: relative;
  box-sizing: border-box;
  width: var(--sn-avatar-size, 32px);
  height: var(--sn-avatar-size, 32px);
}

sn-avatar[hidden] {
  display: none !important;
}

.sn-avatar-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: var(--sn-avatar-radius, 50%);
  background: var(--sn-avatar-bg, var(--sn-sys-outline-subtle));
  border: 1px solid var(--sn-avatar-border, var(--sn-sys-outline));
  overflow: hidden;
  color: var(--sn-avatar-color, var(--sn-sys-on-surface));
  font-family: var(--sn-font, sans-serif);
  font-size: calc(var(--sn-avatar-size, 32px) * 0.4);
  font-weight: 600;
  user-select: none;
}

.sn-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

sn-avatar[shape="square"] .sn-avatar-container {
  border-radius: 0;
}

sn-avatar[shape="rounded"] .sn-avatar-container {
  border-radius: var(--sn-avatar-rounded-radius, 6px);
}

.sn-avatar-status {
  position: absolute;
  bottom: 0;
  right: 0;
  width: calc(var(--sn-avatar-size, 32px) * 0.28);
  height: calc(var(--sn-avatar-size, 32px) * 0.28);
  border-radius: 50%;
  border: 2px solid var(--sn-avatar-status-border, var(--sn-sys-surface-panel));
  background: var(--sn-avatar-status-bg, var(--sn-sys-on-surface-faint));
  display: none;
  z-index: 1;
}

sn-avatar[status] .sn-avatar-status {
  display: block;
}

sn-avatar[status="success"] .sn-avatar-status {
  background: var(--sn-sys-success);
}

sn-avatar[status="warning"] .sn-avatar-status {
  background: var(--sn-sys-warning);
}

sn-avatar[status="error"] .sn-avatar-status {
  background: var(--sn-sys-danger);
}

sn-avatar[status="info"] .sn-avatar-status {
  background: var(--sn-sys-info);
}

sn-avatar[status="neutral"] .sn-avatar-status {
  background: var(--sn-sys-on-surface-faint);
}
`;
