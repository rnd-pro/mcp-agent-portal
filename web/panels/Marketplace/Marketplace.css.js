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

pg-marketplace .mp-grid {
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  align-content: start;
}

pg-marketplace .mp-section {
  display: flex;
  flex-direction: column;
}

pg-marketplace .mp-section-title {
  font-size: 14px;
  font-weight: 600;
  padding: 20px 18px 0 18px;
  margin: 0;
  opacity: 0.8;
}

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

pg-marketplace .mp-card-version {
  font-size: 10px;
  opacity: 0.4;
  margin-top: 1px;
}

pg-marketplace .mp-card-desc {
  font-size: 11.5px;
  line-height: 1.5;
  opacity: 0.6;
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

pg-marketplace .mp-card-tools {
  font-size: 10px;
  opacity: 0.35;
  text-align: right;
}

pg-marketplace .mp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  opacity: 0.3;
}

pg-marketplace .mp-empty .material-symbols-outlined {
  font-size: 40px;
}
`;
