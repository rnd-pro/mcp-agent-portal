import { css } from '@symbiotejs/symbiote';

export default css`
pg-tool-explorer {
  display: block;
  height: 100%;
  background: var(--sn-bg, #1a1a2e);
  color: var(--sn-text, #c8c8d4);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

pg-tool-explorer .te-layout {
  display: flex;
  height: 100%;
}

pg-tool-explorer .te-sidebar {
  width: 250px;
  border-right: 1px solid color-mix(in srgb, currentColor 8%, transparent);
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, #000 20%, transparent);
}

pg-tool-explorer .te-sidebar-header {
  padding: 14px 18px;
  font-weight: 600;
  font-size: 13px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.7;
}

pg-tool-explorer .te-server-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

pg-tool-explorer .te-server-item {
  padding: 10px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background 0.15s, color 0.15s;
}

pg-tool-explorer .te-server-item:hover {
  background: color-mix(in srgb, currentColor 5%, transparent);
}

pg-tool-explorer .te-server-item[data-active="true"] {
  background: color-mix(in srgb, var(--sn-node-selected, #4a9eff) 15%, transparent);
  color: var(--sn-node-selected, #4a9eff);
  font-weight: 500;
}

pg-tool-explorer .te-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

pg-tool-explorer .te-main-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent);
  flex-shrink: 0;
}

pg-tool-explorer .te-header-title {
  font-weight: 600;
  font-size: 15px;
}

pg-tool-explorer .te-tools-grid {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  align-content: start;
}

pg-tool-explorer .te-empty {
  grid-column: 1 / -1;
  text-align: center;
  padding: 40px;
  opacity: 0.4;
  font-size: 14px;
}

pg-tool-explorer .te-tool-card {
  background: color-mix(in srgb, currentColor 3%, transparent);
  border: 1px solid color-mix(in srgb, currentColor 6%, transparent);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

pg-tool-explorer .te-tool-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--sn-node-selected, #4a9eff);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

pg-tool-explorer .te-tool-desc {
  font-size: 12px;
  opacity: 0.8;
  line-height: 1.5;
}

pg-tool-explorer .te-schema-block {
  background: color-mix(in srgb, #000 30%, transparent);
  padding: 10px;
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  overflow-x: auto;
  color: #a8b2d1;
  white-space: pre-wrap;
}

pg-tool-explorer .te-schema-title {
  font-size: 11px;
  text-transform: uppercase;
  opacity: 0.5;
  margin-bottom: 6px;
}
`;
