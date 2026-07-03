export default`
:host,
pg-project-item {
  display: block;
}
sn-card {
  --sn-card-padding: 10px 12px;
  --sn-card-margin-block-end: 8px;
  transition: border-color 0.2s;
}
sn-card:hover {
  border-color: var(--project-accent, var(--sn-sys-accent));
}
.project-title {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.token-badge {
  --sn-badge-font-size: 10px;
  --sn-badge-font-weight: 500;
  --sn-badge-padding: 1px 6px;
  --sn-badge-radius: 8px;
  --sn-badge-color: var(--sn-cat-server);
  --sn-badge-bg: color-mix(in srgb, var(--sn-cat-server) 10%, transparent);
  --sn-badge-border: color-mix(in srgb, var(--sn-cat-server) 15%, transparent);
  color: var(--sn-cat-server);
  font-family: var(--sn-font-mono);
}
.token-badge:empty {
  display: none;
}
.project-remove[variant="icon"] {
  --sn-button-size: 24px;
  --sn-button-padding: 0;
  --sn-button-bg: transparent;
  --sn-button-border: transparent;
  --sn-button-color: var(--sn-sys-on-surface-dim);
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.2s;
}
.project-remove[variant="icon"] .material-symbols-outlined {
  font-size: 16px;
}
sn-card:hover .project-remove[variant="icon"] {
  opacity: 1;
}
.project-remove[variant="icon"]:hover {
  --sn-button-color: var(--sn-sys-danger);
}
.path {
  font-size: 11px;
  font-family: var(--sn-font-mono);
  color: var(--sn-sys-on-surface-dim);
  word-break: break-all;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
a {
  color: var(--project-accent, var(--sn-sys-accent));
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
`;
