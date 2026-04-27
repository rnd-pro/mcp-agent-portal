import { css } from '@symbiotejs/symbiote';

export default css`
pg-marketplace {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--sn-bg, #1a1a2e);
  color: var(--sn-text, #c8c8d4);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
}

/* ── Header ────────────────────────────────────────── */
pg-marketplace .mp-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent);
  flex-shrink: 0;
}

pg-marketplace .mp-header-icon {
  font-size: 20px;
  background: linear-gradient(135deg, var(--sn-cat-data, #a78bfa), var(--sn-node-selected, #4a9eff));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

pg-marketplace .mp-header-title {
  font-weight: 600;
  font-size: 15px;
}

pg-marketplace .mp-header-count {
  margin-left: auto;
  font-size: 11px;
  opacity: 0.4;
}

/* ── Tabs ──────────────────────────────────────────── */
pg-marketplace .mp-tabs {
  display: flex;
  gap: 2px;
  padding: 8px 18px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 6%, transparent);
  flex-shrink: 0;
}

pg-marketplace .mp-tab {
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

pg-marketplace .mp-tab:hover {
  opacity: 0.8;
  background: color-mix(in srgb, currentColor 5%, transparent);
}

pg-marketplace .mp-tab.active {
  opacity: 1;
  background: color-mix(in srgb, var(--sn-node-selected, #4a9eff) 15%, transparent);
  font-weight: 600;
}

/* ── Search ────────────────────────────────────────── */
pg-marketplace .mp-search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 18px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 4%, transparent);
  flex-shrink: 0;
}

pg-marketplace .mp-search-icon {
  font-size: 16px;
  opacity: 0.3;
}

pg-marketplace .mp-search {
  flex: 1;
  background: none;
  border: none;
  color: inherit;
  font-size: 12px;
  outline: none;
  padding: 6px 0;
}

pg-marketplace .mp-search::placeholder {
  opacity: 0.3;
}

/* ── Scrollable ────────────────────────────────────── */
pg-marketplace .mp-scrollable {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

/* ── Grid ──────────────────────────────────────────── */
pg-marketplace .mp-grid {
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  align-content: start;
}

/* ── Category ──────────────────────────────────────── */
pg-marketplace .mp-category {
  padding: 0 18px;
}

pg-marketplace .mp-category-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0 8px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 4%, transparent);
  margin-bottom: 12px;
}

pg-marketplace .mp-category-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.4;
}

pg-marketplace .mp-category-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
}

pg-marketplace .mp-badge-rnd-pro {
  background: linear-gradient(135deg, #a78bfa33, #7c3aed33);
  color: #a78bfa;
}

pg-marketplace .mp-badge-official {
  background: linear-gradient(135deg, #4a9eff33, #2563eb33);
  color: #4a9eff;
}

pg-marketplace .mp-badge-google {
  background: linear-gradient(135deg, #34d39933, #05966933);
  color: #34d399;
}

pg-marketplace .mp-badge-community {
  background: linear-gradient(135deg, #f59e0b33, #d9770633);
  color: #f59e0b;
}

pg-marketplace .mp-category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  padding-bottom: 8px;
}

/* ── Card ──────────────────────────────────────────── */
pg-marketplace .mp-card {
  background: color-mix(in srgb, currentColor 3%, transparent);
  border: 1px solid color-mix(in srgb, currentColor 6%, transparent);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: border-color 0.2s, transform 0.15s;
  cursor: default;
}

pg-marketplace .mp-card:hover {
  border-color: color-mix(in srgb, var(--sn-node-selected, #4a9eff) 25%, transparent);
  transform: translateY(-1px);
}

pg-marketplace .mp-card[hidden] {
  display: none;
}

pg-marketplace .mp-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

pg-marketplace .mp-card-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

pg-marketplace .mp-card-title {
  font-weight: 600;
  font-size: 13px;
}

pg-marketplace .mp-card-source {
  font-size: 10px;
  opacity: 0.3;
  margin-top: 1px;
}

pg-marketplace .mp-card-desc {
  font-size: 11.5px;
  line-height: 1.5;
  opacity: 0.6;
}

pg-marketplace .mp-card-env {
  font-size: 10px;
  opacity: 0.35;
  font-family: monospace;
}

pg-marketplace .mp-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
}

pg-marketplace .mp-card-status {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
}

pg-marketplace .mp-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

pg-marketplace .mp-status-dot[data-active="true"] {
  background: #4ade80;
  box-shadow: 0 0 6px rgba(74, 222, 128, 0.4);
}

pg-marketplace .mp-status-dot[data-active="false"] {
  background: color-mix(in srgb, currentColor 20%, transparent);
}

pg-marketplace .mp-card-toggle {
  background: none;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  border-radius: 6px;
  color: inherit;
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

pg-marketplace .mp-card-toggle:hover {
  background: color-mix(in srgb, var(--sn-node-selected, #4a9eff) 12%, transparent);
  border-color: color-mix(in srgb, var(--sn-node-selected, #4a9eff) 25%, transparent);
}

pg-marketplace .mp-card-toggle[data-action="remove"]:hover {
  background: color-mix(in srgb, #ef4444 12%, transparent);
  border-color: color-mix(in srgb, #ef4444 25%, transparent);
}

pg-marketplace .mp-card-toggle:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ── Custom Form ───────────────────────────────────── */
pg-marketplace .mp-custom-form {
  padding: 20px 18px;
  max-width: 480px;
}

pg-marketplace .mp-form-title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
}

pg-marketplace .mp-form-desc {
  margin: 0 0 20px;
  font-size: 12px;
  opacity: 0.5;
  line-height: 1.5;
}

pg-marketplace .mp-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  margin: 12px 0 4px;
  opacity: 0.7;
}

pg-marketplace .mp-required {
  color: #ef4444;
}

pg-marketplace .mp-hint {
  font-weight: 400;
  opacity: 0.5;
}

pg-marketplace .mp-input,
pg-marketplace .mp-textarea {
  display: block;
  width: 100%;
  box-sizing: border-box;
  background: color-mix(in srgb, currentColor 4%, transparent);
  border: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  border-radius: 8px;
  color: inherit;
  font-size: 12px;
  padding: 8px 12px;
  outline: none;
  font-family: inherit;
  transition: border-color 0.2s;
}

pg-marketplace .mp-textarea {
  resize: vertical;
  font-family: monospace;
  font-size: 11px;
}

pg-marketplace .mp-input:focus,
pg-marketplace .mp-textarea:focus {
  border-color: color-mix(in srgb, var(--sn-node-selected, #4a9eff) 40%, transparent);
}

pg-marketplace .mp-install-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 20px;
  padding: 10px 20px;
  background: linear-gradient(135deg, var(--sn-cat-data, #a78bfa), var(--sn-node-selected, #4a9eff));
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
}

pg-marketplace .mp-install-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

pg-marketplace .mp-install-btn:active {
  transform: translateY(0);
}

pg-marketplace .mp-install-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

pg-marketplace .mp-install-btn .material-symbols-outlined {
  font-size: 18px;
}

pg-marketplace .mp-form-status {
  margin-top: 10px;
  font-size: 12px;
  min-height: 18px;
}

pg-marketplace .mp-form-status.success {
  color: #4ade80;
}

pg-marketplace .mp-form-status.error {
  color: #f87171;
}

/* ── Empty ─────────────────────────────────────────── */
pg-marketplace .mp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 8px;
  opacity: 0.3;
}

pg-marketplace .mp-empty .material-symbols-outlined {
  font-size: 40px;
}
`;
