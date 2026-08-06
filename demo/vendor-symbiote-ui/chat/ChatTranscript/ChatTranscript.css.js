import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default `
:host,
chat-transcript {
  display: flex;
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  background: var(--sn-chat-bg);
}

.chat-background {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.chat-background ::slotted(*) {
  width: 100%;
  height: 100%;
}

chat-transcript > [slot="background"] {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  --sn-cell-base-alpha: var(--sn-chat-cell-base-alpha);
  --sn-cell-alpha-span: var(--sn-chat-cell-alpha-span);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  ${themedScrollFadeBlockStyles}
  padding: var(--sn-chat-transcript-padding);
  padding-block-end: calc(
    var(--sn-chat-transcript-padding-block-end, 16px) + var(--sn-chat-overlay-stack-reserve, 0px)
  );
  scroll-padding-block-end: var(--sn-chat-overlay-stack-reserve, 0px);
  display: flex;
  flex-direction: column;
  gap: var(--sn-chat-gap);
  position: relative;
  z-index: 1;
}

.chat-top-sentinel {
  position: absolute;
  inset-block-start: 0;
  inset-inline: 0;
  height: var(--sn-chat-transcript-top-sentinel-height, 0);
  pointer-events: none;
}

.chat-message-list {
  display: contents;
}

chat-message-item {
  display: contents;
}

.scroll-bottom-btn {
	  position: absolute;
	  left: 50%;
	  bottom: calc(var(--sn-chat-scroll-bottom, 18px) + var(--sn-chat-overlay-stack-reserve, 0px));
  z-index: 30;
  width: var(--sn-composer-send-size, 32px);
  height: var(--sn-composer-send-size, 32px);
  border: none;
  border-radius: 50%;
  background: var(--sn-sys-surface-raised);
  color: var(--sn-sys-on-surface-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%) translateY(4px);
  box-shadow: var(--sn-shadow-lg);
  transition: opacity var(--sn-transition-fast) var(--sn-transition-easing), transform var(--sn-transition-fast) var(--sn-transition-easing), background var(--sn-transition-fast) var(--sn-transition-easing), color var(--sn-transition-fast) var(--sn-transition-easing);
}

.scroll-bottom-btn.visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) translateY(0);
}

.scroll-bottom-btn:hover {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised));
  color: var(--sn-sys-on-surface);
}

.scroll-bottom-btn .material-symbols-outlined {
  font-size: var(--sn-composer-send-icon-size, 18px);
}

.live-status-indicator {
  display: flex;
  align-items: center;
  gap: var(--sn-chat-gap, 8px);
  padding: var(--sn-chat-tool-padding, 8px 16px);
  font-size: var(--sn-chat-tool-font-size, 12px);
  color: var(--sn-sys-on-surface-dim);
  animation: status-fade-in var(--sn-transition-normal) var(--sn-transition-easing);
  animation-play-state: var(--sn-animation-play-state);
}

.live-status-indicator[hidden] {
  display: none;
}

.live-status-indicator .material-symbols-outlined {
  font-size: var(--sn-chat-live-icon-size);
  color: var(--sn-cat-server);
}

.status-card-header .material-symbols-outlined[data-status="done"] {
  color: var(--sn-sys-success);
}

.status-card-header .material-symbols-outlined[data-status="error"] {
  color: var(--sn-sys-danger);
}

@keyframes status-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
`;
