export default `
:host {
  display: block;
}

pg-agent-chat {
  display: block;
  height: 100%;
  overflow: hidden;
  font-family: var(--sn-font, 'Inter', -apple-system, sans-serif);
}

.chat-shell {
  display: flex;
  height: 100%;
  background: var(--sn-bg, #1a1a1a);
  color: var(--sn-text);
  font-size: 13px;
}

/* ── Chat Nav (unchanged) ── */

/* ── Chat View ── */

.chat-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
}

.chat-view::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 20px;
  background: linear-gradient(to bottom, var(--sn-bg, #1a1a1a) 0%, transparent 100%);
  z-index: 2;
  pointer-events: none;
}

/* Empty state: composer centered */
.chat-view[empty] {
  justify-content: center;
  align-items: center;
}

.chat-view[empty] chat-transcript {
  display: none;
}

.chat-view[empty] chat-composer {
  position: relative;
  max-width: 640px;
  width: 90%;
}

`;
