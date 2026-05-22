export default `
:host {
  display: block;
}

pg-agent-chat {
  display: block;
  height: 100%;
  overflow: hidden;
  font-family: var(--sn-font);
}

.chat-shell {
  display: flex;
  height: 100%;
  background: var(--sn-bg);
  color: var(--sn-text);
  font-size: 13px;
}

/* ── Chat Nav (unchanged) ── */

/* ── Chat View ── */

.chat-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.chat-view:not([empty]) chat-transcript {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.chat-view:not([empty]) chat-composer {
  flex: 0 0 auto;
}

.chat-view::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 20px;
  background: linear-gradient(to bottom, var(--sn-bg) 0%, transparent 100%);
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
