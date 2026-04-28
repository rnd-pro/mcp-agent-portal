export default /*css*/ `
:host {
  display: block;
  height: 30px;
  background: var(--sn-bg, #1a1a1a);
  border-bottom: 1px solid var(--sn-node-border, rgba(255,255,255,0.08));
  flex-shrink: 0;
  user-select: none;
}

.tab-bar {
  display: flex;
  align-items: stretch;
  height: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}

.tab-bar::-webkit-scrollbar {
  display: none;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  height: 30px;
  border: none;
  background: transparent;
  color: var(--sn-text-dim, #666);
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
  border-right: 1px solid var(--sn-node-border, rgba(255,255,255,0.06));
  position: relative;
}

.tab .material-symbols-outlined {
  font-size: 15px;
}

.tab:hover {
  background: var(--sn-node-bg, #2a2a2a);
  color: var(--sn-text, #e0e0e0);
}

.tab[active] {
  background: var(--sn-node-bg, #2a2a2a);
  color: var(--sn-text, #e0e0e0);
  border-bottom: 2px solid var(--tab-accent, var(--sn-node-selected, #4c8bf5));
}

.tab-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tab-accent, var(--sn-node-selected, #4c8bf5));
  flex-shrink: 0;
}

.tab-close {
  display: none;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  background: transparent;
  border: none;
  color: var(--sn-text-dim, #666);
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  line-height: 1;
  margin-left: 4px;
}

.tab:hover .tab-close {
  display: flex;
}

.tab-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--sn-text, #e0e0e0);
}

.tab-add {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: var(--sn-text-dim, #555);
  cursor: pointer;
  font-size: 18px;
  transition: color 0.15s, background 0.15s;
}

.tab-add:hover {
  background: var(--sn-node-bg, #2a2a2a);
  color: var(--sn-text, #e0e0e0);
}

.tab-filler {
  flex: 1;
}
`;
