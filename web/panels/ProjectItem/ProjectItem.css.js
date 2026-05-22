export default`
:host {
  display: block;
}
sn-card {
  --sn-card-padding: 10px 12px;
  --sn-card-margin-block-end: 8px;
  transition: border-color 0.2s;
}
sn-card:hover {
  border-color: var(--project-accent, var(--sn-node-selected));
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
  font-size: 10px;
  font-weight: 500;
  color: var(--sn-cat-server);
  padding: 1px 6px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--sn-cat-server) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--sn-cat-server) 15%, transparent);
  font-family: var(--sn-font-mono);
  white-space: nowrap;
}
.token-badge:empty {
  display: none;
}
.delete-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--sn-text-dim);
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.2s, color 0.2s;
}
sn-card:hover .delete-btn {
  opacity: 1;
}
.delete-btn:hover {
  color: var(--sn-danger-color);
}
.path {
  font-size: 11px;
  font-family: var(--sn-font-mono);
  color: var(--sn-text-dim);
  word-break: break-all;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
a {
  color: var(--project-accent, var(--sn-node-selected));
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
`;
