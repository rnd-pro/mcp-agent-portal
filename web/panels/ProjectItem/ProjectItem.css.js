export default`
:host {
  display: block;
}
.ui-card {
  padding: 10px 12px;
  margin-bottom: 8px;
  transition: border-color 0.2s;
}
.ui-card:hover {
  border-color: var(--project-accent, #7878ff);
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
  color: #64b5f6;
  padding: 1px 6px;
  border-radius: 8px;
  background: rgba(100, 181, 246, 0.1);
  border: 1px solid rgba(100, 181, 246, 0.15);
  font-family: var(--sn-font-mono, monospace);
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
.ui-card:hover .delete-btn {
  opacity: 1;
}
.delete-btn:hover {
  color: var(--sn-danger-color, #ef5350);
}
.path {
  font-size: 11px;
  font-family: var(--sn-font-mono, monospace);
  color: var(--sn-text-dim);
  word-break: break-all;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
a {
  color: var(--project-accent, #7878ff);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
`;