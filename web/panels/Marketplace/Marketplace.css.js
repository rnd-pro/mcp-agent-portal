export default `
:host {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--sn-panel-bg);
  color: var(--sn-text);
  font-family: var(--sn-font);
  font-size: 13px;
}

.mp-header-icon {
  font-size: 20px;
  background: linear-gradient(135deg, var(--sn-provider-rnd-pro-color), var(--sn-node-selected));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.mp-header-count {
  margin-left: auto;
  font-size: 11px;
  opacity: 0.4;
}

.mp-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--sn-node-border);
  background: var(--sn-panel-bg);
}

/* ── Tabs ──────────────────────────────────────────── */
.mp-tabs {
  display: flex;
  gap: 2px;
  padding: 8px 18px;
  border-bottom: 1px solid var(--sn-node-border);
  flex-shrink: 0;
  background: var(--sn-bg);
}

.mp-tab {
  background: none;
  border: none;
  color: inherit;
  font-size: 12px;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.15s, background 0.15s;
}

.mp-tab:hover {
  opacity: 0.8;
  background: var(--sn-node-hover);
}

.mp-tab.active {
  opacity: 1;
  background: color-mix(in srgb, var(--sn-node-selected) 15%, transparent);
  font-weight: 600;
  color: var(--sn-node-selected);
}

/* ── Search ────────────────────────────────────────── */
.mp-search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--sn-node-border);
  flex-shrink: 0;
  background: var(--sn-panel-bg);
}

.mp-search-icon {
  font-size: 16px;
  opacity: 0.3;
}

/* ── Scrollable ────────────────────────────────────── */
.mp-scrollable {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

/* ── Grid ──────────────────────────────────────────── */
.mp-grid {
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  align-content: start;
}

/* ── Category ──────────────────────────────────────── */
.mp-category {
  padding: 0 18px;
}

.mp-category-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0 8px;
  border-bottom: 1px solid var(--sn-node-hover);
  margin-bottom: 12px;
}

.mp-category-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.4;
}

.mp-category-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.mp-badge-rnd-pro { background: var(--sn-provider-rnd-pro-bg); color: var(--sn-provider-rnd-pro-color); }
.mp-badge-official { background: var(--sn-provider-official-bg); color: var(--sn-provider-official-color); }
.mp-badge-google { background: var(--sn-provider-google-bg); color: var(--sn-provider-google-color); }
.mp-badge-community { background: var(--sn-provider-community-bg); color: var(--sn-provider-community-color); }

.mp-category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  padding-bottom: 8px;
}

/* ── Custom Form ───────────────────────────────────── */
.mp-custom-form {
  padding: 20px 18px;
  max-width: 480px;
}

.mp-form-desc {
  margin: 0 0 20px;
  font-size: 12px;
  opacity: 0.5;
  line-height: 1.5;
}

.mp-required {
  color: var(--sn-danger-color);
}

.mp-hint {
  font-weight: 400;
  opacity: 0.5;
}

.mp-form-status {
  margin-top: 10px;
  font-size: 12px;
  min-height: 18px;
}

.mp-form-status.success {
  color: var(--sn-success-color);
}

.mp-form-status.error {
  color: var(--sn-danger-color);
}

.mp-title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.mp-title-left {
  display: flex;
  align-items: center;
}

.mp-mode-toggle {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--sn-node-border);
  border-radius: 8px;
  background: var(--sn-bg);
  font-size: 13px;
  font-weight: normal;
}

.mp-mode-toggle button {
  border: 0;
  border-radius: 6px;
  padding: 6px 10px;
  color: var(--sn-text-dim);
  background: transparent;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.mp-mode-toggle button:hover {
  background: var(--sn-node-hover);
  color: var(--sn-text);
}

.mp-mode-toggle button.active {
  background: color-mix(in srgb, var(--sn-node-selected) 18%, transparent);
  color: var(--sn-text);
}

.mp-search-field {
  flex: 1;
}

.mp-search-input {
  width: 100%;
}

.mp-custom-title {
  margin-bottom: 4px;
  font-size: 15px;
  font-weight: 600;
  color: var(--sn-text);
}

.mp-install-icon {
  font-size: 18px;
}

.mp-context-section {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.mp-context-header {
  padding: 16px;
  border-bottom: 1px solid var(--sn-node-border);
  background: var(--sn-node-bg);
}

.mp-context-desc {
  margin: 0;
  font-size: 13px;
  color: var(--sn-text-dim);
  line-height: 1.5;
}

.mp-context-body {
  padding: 16px;
}

.mp-card-installed {
  opacity: 0.5;
}

.mp-card-removing {
  opacity: 0;
  transform: scale(0.95);
  transition: opacity 0.3s, transform 0.3s;
}
`;
