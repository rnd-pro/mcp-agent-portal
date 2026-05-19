export default /*css*/ `
:host {
  display: block;
  height: 38px;
  background: transparent;
  flex-shrink: 0;
  user-select: none;
  position: relative;
}

/* The continuous horizontal bottom line */
:host::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--sn-node-border, rgba(255,255,255,0.08));
  z-index: 1;
}

.tab-bar {
  display: flex;
  align-items: flex-end;
  height: 100%;
  padding: 0 12px;
  overflow-x: auto;
  scrollbar-width: none;
  position: relative;
  z-index: 2;
}

.tab-bar::-webkit-scrollbar {
  display: none;
}

.tab, project-tab-item {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px 0 12px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--sn-text-dim, #888);
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
  position: relative;
  border-radius: 8px 8px 0 0;
  margin: 0 2px;
  border: 1px solid transparent;
  border-bottom: none;
}

.tab .material-symbols-outlined,
project-tab-item .material-symbols-outlined {
  font-size: 15px;
}

.tab:hover,
project-tab-item:hover {
  background: var(--sn-node-hover, rgba(255, 255, 255, 0.04));
  color: var(--sn-text, #e0e0e0);
}

.tab[active],
project-tab-item[active] {
  background: var(--sn-node-bg, #2a2a2a);
  color: var(--sn-text, #e0e0e0);
  border-color: transparent;
  border-bottom: none;
}

/* Left flare */
.tab[active]::before,
project-tab-item[active]::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: -12px;
  width: 12px;
  height: 12px;
  pointer-events: none;
  background: radial-gradient(
    circle at 0 0,
    transparent 11.5px,
    var(--sn-node-bg, #2a2a2a) 12px
  );
}

/* Right flare */
.tab[active]::after,
project-tab-item[active]::after {
  content: '';
  position: absolute;
  bottom: 0;
  right: -12px;
  width: 12px;
  height: 12px;
  pointer-events: none;
  background: radial-gradient(
    circle at 100% 0,
    transparent 11.5px,
    var(--sn-node-bg, #2a2a2a) 12px
  );
}

/* Separator line between inactive tabs */
.tab:not([active]):not(:hover)::after,
project-tab-item:not([active]):not(:hover)::after {
  content: '';
  position: absolute;
  right: -2px;
  top: 25%;
  height: 50%;
  width: 1px;
  background: var(--sn-node-border, rgba(255,255,255,0.1));
}

/* Hide separator if the next tab (or first dynamic tab) is active/hovered, or if it's the last tab */
.tab:not([active]):not(:hover):has(+ .tab[active])::after,
.tab:not([active]):not(:hover):has(+ project-tab-item[active])::after,
.tab:not([active]):not(:hover):has(+ .tab:hover)::after,
.tab:not([active]):not(:hover):has(+ project-tab-item:hover)::after,
project-tab-item:not([active]):not(:hover):has(+ project-tab-item[active])::after,
project-tab-item:not([active]):not(:hover):has(+ project-tab-item:hover)::after,
.tab:not([active]):not(:hover):has(+ div > project-tab-item:first-child[active])::after,
.tab:not([active]):not(:hover):has(+ div > project-tab-item:first-child:hover)::after,
.tab:not([active]):not(:hover):last-child::after,
project-tab-item:not([active]):not(:hover):last-child::after,
.tab:not([active]):not(:hover):has(+ div:empty)::after {
  content: none;
}

.tab-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tab-accent, var(--sn-node-selected, #4c8bf5));
  flex-shrink: 0;
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: transparent;
  border: none;
  color: var(--sn-text-dim, #888);
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
}

.tab:hover .tab-close,
.tab[active] .tab-close,
project-tab-item:hover .tab-close,
project-tab-item[active] .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: var(--sn-node-hover, rgba(255, 255, 255, 0.2));
  color: var(--sn-text, #e0e0e0);
}

.tab-add {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--sn-text-dim, #888);
  cursor: pointer;
  font-size: 18px;
  transition: background 0.15s, color 0.15s;
  margin-left: 4px;
  margin-bottom: 2px;
}

.tab-add:hover {
  background: var(--sn-node-hover, rgba(255, 255, 255, 0.1));
  color: var(--sn-text, #e0e0e0);
}

.tab-filler {
  flex: 1;
}
`;
