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

.chat-workspace-view {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

`;
