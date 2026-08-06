import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default /*css*/ `
:host,
chat-list {
  display: block;
}

.chat-list {
  width: 100%;
  border-right: none;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--sn-sys-surface-raised);
  color: var(--sn-sys-on-surface);
  overflow: hidden;
}

.chat-list-header {
  display: flex;
  align-items: center;
  gap: var(--sn-chat-list-header-gap, 8px);
  min-height: var(--sn-chat-list-header-min-height, 36px);
  padding: var(--sn-chat-list-header-padding, 6px 12px);
  border-bottom: 1px solid var(--sn-sys-outline);
  flex-shrink: 0;
}

.chat-list-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--sn-chat-list-title-size, 13px);
  font-weight: 600;
  color: var(--sn-sys-on-surface);
}

.chat-list-content {
  min-height: 0;
  overflow: auto;
  ${themedScrollFadeBlockStyles}
}

.chat-list-icon {
  font-size: var(--sn-chat-list-icon-size, 16px);
}

.chat-list-empty-icon {
  display: block;
  margin-block-end: var(--sn-chat-list-empty-icon-margin, 8px);
  font-size: var(--sn-chat-list-empty-icon-size, 32px);
  opacity: 0.3;
}

.chat-list-title {
  flex: none;
}

.chat-list-new-btn {
  margin-left: auto;
}

.chat-list-new-btn-icon {
  font-size: var(--sn-chat-list-new-icon-size, 14px);
}

.chat-list-items {
  padding: var(--sn-chat-list-items-padding, 4px 0);
}

.chat-list-filter-bar {
  display: flex;
  gap: var(--sn-chat-list-filter-gap, 4px);
  padding: var(--sn-chat-list-filter-padding, 6px 12px);
  border-bottom: 1px solid var(--sn-sys-outline);
  flex-shrink: 0;
}

.chat-list-filter-btn {
  --sn-button-bg: transparent;
  --sn-button-border: transparent;
  --sn-button-color: var(--sn-sys-on-surface-dim);
  --sn-button-hover-bg: transparent;
  --sn-button-hover-border: transparent;
  --sn-button-padding: var(--sn-chat-list-filter-button-padding, 3px 8px);
  --sn-button-radius: var(--sn-chat-list-filter-button-radius, 4px);
  --sn-button-min-height: var(--sn-chat-list-filter-button-min-height, 24px);
  --sn-button-font-size: var(--sn-chat-list-filter-button-size, 11px);
  --sn-button-font-weight: 500;
  color: var(--sn-sys-on-surface-dim);
  transition: color var(--sn-transition-fast) var(--sn-transition-easing), background var(--sn-transition-fast) var(--sn-transition-easing), border-color var(--sn-transition-fast) var(--sn-transition-easing);
}

.chat-list-filter-btn:hover {
  /* text emphasis only — the sn-button state layer owns the background (0% mix) */
  color: color-mix(in oklch, var(--sn-sys-accent) 0%, var(--sn-sys-on-surface));
}

.chat-list-filter-btn[active] {
  --sn-button-bg: var(--sn-sys-surface-raised);
  --sn-button-border: var(--sn-sys-outline);
  color: var(--sn-sys-on-surface);
}
`;
