import {
  themedScrollFadeBlockStyles,
  themedScrollFadeInlineStyles,
} from '../../themes/scroll-fade-styles.js';

export default `
:host,
chat-message-item {
  display: contents;
}

.message {
  max-width: 100%;
  display: flex;
}

.message.board {
  width: 100%;
}

.message.tool {
  align-self: flex-start;
  flex-direction: column;
  gap: var(--sn-chat-tool-gap, 6px);
  max-width: 100%;
  width: 100%;
}

.message.thinking {
  max-width: 100%;
}

.message.agent {
  flex-direction: column;
}

.message.system {
  align-self: center;
  font-size: var(--sn-chat-small-size, 11px);
  min-width: 0;
  max-width: 90%;
  color: var(--sn-sys-on-surface-dim);
}

.message.system .msg-content {
  display: flex;
  align-items: center;
  gap: var(--sn-step-2);
  min-width: 0;
  max-width: 100%;
  background: color-mix(in srgb, var(--sn-sys-on-surface-dim) 9%, transparent);
  border-radius: var(--sn-radius-lg, 12px);
  text-align: left;
  font-style: normal;
  padding: var(--sn-step-2) var(--sn-step-4);
  overflow-wrap: anywhere;
  white-space: normal;
}

.message.system .system-note-icon {
  flex: 0 0 auto;
  font-size: var(--sn-chat-meta-icon-size);
  color: var(--sn-sys-on-surface-dim);
}

.msg-content {
  box-sizing: border-box;
  padding: var(--sn-chat-message-padding, 12px 16px);
  border-radius: var(--sn-radius-xl, 16px);
  width: 100%;
  min-width: 0;
  max-width: 100%;
  font-size: var(--sn-chat-message-font-size, 13px);
  line-height: 1.5;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.message.user .msg-content {
  background: var(--sn-chat-user-message-bg, var(--sn-composer-bg, var(--sn-chat-message-bg, var(--sn-sys-surface-raised))));
  color: var(--sn-sys-on-surface);
}

.message.agent .msg-content {
  background: var(--sn-chat-agent-message-bg, var(--sn-sys-surface-raised));
  color: var(--sn-sys-on-surface);
}

.tool-card {
  border-radius: var(--sn-radius-xl);
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
  overflow: hidden;
  width: 100%;
  min-width: 0;
  transition: background var(--sn-transition-fast) var(--sn-transition-easing);
}

.tool-card[open] {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
}

.tool-header {
  display: flex;
  align-items: center;
  gap: var(--sn-chat-status-card-gap, 6px);
  padding: var(--sn-chat-tool-padding, 8px 12px);
  font-size: var(--sn-chat-tool-font-size, 12px);
  font-weight: 600;
  color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
  user-select: none;
  list-style: none;
}

.tool-header::-webkit-details-marker {
  display: none;
}

.tool-header::before {
  content: '>';
  font-size: var(--sn-chat-tool-label-size, 10px);
  transition: transform var(--sn-transition-fast) var(--sn-transition-easing);
  color: var(--sn-sys-on-surface-dim);
}

.tool-card[open] .tool-header::before {
  transform: rotate(90deg);
}

.tool-header .material-symbols-outlined {
  color: var(--sn-sys-on-surface-dim);
}

.tool-icon {
  font-size: var(--sn-chat-tool-icon-size);
}

.tool-name {
  flex: 0 0 auto;
}

.tool-summary {
  min-width: 0;
  max-width: min(56ch, 100%);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sn-sys-on-surface);
  opacity: 0.72;
  font-weight: 500;
}

.tool-summary::before {
  content: '-';
  margin-inline-end: var(--sn-step-3);
  color: var(--sn-sys-on-surface-dim);
}

.tool-card[open] .tool-header {
  border-bottom: none;
  color: var(--sn-sys-on-surface);
}

.tool-section {
  padding: var(--sn-chat-tool-padding, 8px 12px);
}

.tool-label {
  font-size: var(--sn-chat-tool-label-size, 10px);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--sn-sys-on-surface-dim);
  margin-bottom: var(--sn-step-2);
}

.tool-result-summary {
  font-size: var(--sn-chat-tool-font-size, 12px);
  font-weight: 600;
  color: var(--sn-sys-on-surface);
  line-height: 1.4;
}

.tool-warnings {
  list-style: none;
  margin: 0;
  padding: 0 var(--sn-chat-tool-padding, 12px) var(--sn-step-3);
  display: flex;
  flex-direction: column;
  gap: var(--sn-step-2);
}

.tool-warning {
  display: flex;
  align-items: flex-start;
  gap: var(--sn-step-2);
  font-size: var(--sn-chat-small-size, 11px);
  color: var(--sn-sys-warning);
  line-height: 1.4;
}

.tool-warning-icon {
  font-size: var(--sn-chat-tool-icon-size, 14px);
  flex: 0 0 auto;
}

.tool-code {
  background: var(--sn-sys-surface);
  border-radius: var(--sn-radius-md);
  padding: var(--sn-chat-code-padding, 8px);
  font-family: var(--sn-font-mono);
  font-size: var(--sn-chat-code-size, 11px);
  color: var(--sn-sys-on-surface-dim);
  white-space: pre-wrap;
  word-break: break-all;
  overflow-wrap: anywhere;
  min-width: 0;
  max-width: 100%;
  max-height: 200px;
  overflow-y: auto;
  ${themedScrollFadeBlockStyles}
}

.tool-waiting {
  color: var(--sn-sys-on-surface-dim);
  font-style: italic;
  font-size: var(--sn-chat-small-size, 11px);
}

.spin-icon {
  animation: spin var(--sn-animation-duration-normal) linear infinite;
  animation-play-state: var(--sn-animation-play-state);
}

@keyframes spin {
  100% { transform: rotate(360deg); }
}

.streaming-cursor {
  display: inline-block;
  width: 6px;
  height: 14px;
  background-color: var(--sn-sys-on-surface-dim);
  vertical-align: middle;
  margin-left: var(--sn-step-2);
  animation: blink var(--sn-animation-duration-normal) step-end infinite;
  animation-play-state: var(--sn-animation-play-state);
}

@keyframes blink {
  50% { opacity: 0; }
}

.md-code-block {
  background: var(--sn-sys-surface);
  border-radius: var(--sn-radius-lg);
  padding: var(--sn-chat-code-padding, 12px);
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  ${themedScrollFadeInlineStyles}
  margin: var(--sn-step-3) 0;
  font-family: var(--sn-font-mono);
  font-size: var(--sn-chat-code-size, 12px);
  white-space: pre;
}

.md-inline-code {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
  padding: var(--sn-step-1) var(--sn-step-2, 5px);
  border-radius: var(--sn-radius-sm);
  font-family: var(--sn-font-mono);
  font-size: var(--sn-chat-code-size, 11px);
  color: var(--sn-sys-on-surface);
}

.markdown-mention {
  color: var(--sn-sys-accent);
  background: var(--sn-accent-bg);
  padding: var(--sn-step-0, 1px) var(--sn-step-2);
  border-radius: var(--sn-radius-sm);
  font-weight: 500;
  word-break: break-all;
}

.md-link {
  color: var(--sn-sys-on-surface-dim);
  text-decoration: underline;
  text-decoration-color: var(--sn-sys-outline);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.md-link:hover {
  /* text emphasis only — links keep their underline affordance (0% state layer) */
  color: color-mix(in oklch, var(--sn-sys-accent) 0%, var(--sn-sys-on-surface));
}

.md-h {
  margin: var(--sn-step-8) 0 var(--sn-step-4);
  color: var(--sn-sys-on-surface);
  font-weight: 700;
}

h1.md-h {
  font-size: var(--sn-chat-markdown-h1-size, 20px);
  border-bottom: 1px solid var(--sn-sys-outline);
  padding-bottom: var(--sn-step-3);
}

h2.md-h {
  font-size: var(--sn-chat-markdown-h2-size, 18px);
  border-bottom: 1px solid var(--sn-sys-outline);
  padding-bottom: var(--sn-step-2);
}

h3.md-h {
  font-size: var(--sn-chat-markdown-h3-size, 16px);
}

h4.md-h {
  font-size: var(--sn-chat-markdown-h4-size, 14px);
}

.md-p {
  margin: 0;
}

.md-quote {
  margin: var(--sn-step-4) 0;
  padding: var(--sn-step-4) var(--sn-step-8);
  border-left: 4px solid var(--sn-sys-accent);
  background: var(--sn-accent-bg-subtle);
  border-radius: 0 var(--sn-radius-sm) var(--sn-radius-sm) 0;
  font-style: italic;
  color: var(--sn-sys-on-surface-dim);
}

.md-list {
  margin: var(--sn-step-4) 0;
  padding-left: var(--sn-step-10);
}

.md-list li {
  margin: var(--sn-step-1, 3px) 0;
}

.md-img {
  max-width: 100%;
  height: auto;
  border-radius: var(--sn-radius-md);
  margin: var(--sn-step-4) 0;
  border: 1px solid var(--sn-sys-outline);
}

.md-hr {
  border: none;
  border-top: 1px solid var(--sn-sys-outline);
  margin: var(--sn-step-8) 0;
}

.md-table {
  width: 100%;
  border-collapse: collapse;
  margin: var(--sn-step-6) 0;
  font-size: var(--sn-chat-table-size, 12px);
}

.md-table th,
.md-table td {
  padding: var(--sn-step-3) var(--sn-step-6);
  border: 1px solid var(--sn-sys-outline);
  text-align: left;
}

.md-table th {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
  font-weight: 600;
}

.md-table tr:hover td {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised));
}

.t-kw,
.t-lit {
  color: var(--sn-syntax-keyword);
}

.t-str,
.t-num {
  color: var(--sn-syntax-string);
}

.t-cm {
  color: var(--sn-syntax-comment);
  font-style: italic;
}

.t-fn,
.t-bi {
  color: var(--sn-syntax-function);
}

.t-prop {
  color: var(--sn-syntax-property);
}

.msg-content .t-kw,
.msg-content .t-lit,
.work-body .t-kw,
.work-body .t-lit,
.display-card-body .t-kw,
.display-card-body .t-lit {
  color: var(--sn-chat-syntax-keyword, color-mix(in srgb, var(--sn-syntax-keyword) 55%, var(--sn-sys-on-surface-dim)));
}

.msg-content .t-str,
.msg-content .t-num,
.work-body .t-str,
.work-body .t-num,
.display-card-body .t-str,
.display-card-body .t-num {
  color: var(--sn-chat-syntax-string, color-mix(in srgb, var(--sn-syntax-string) 55%, var(--sn-sys-on-surface-dim)));
}

.msg-content .t-fn,
.msg-content .t-bi,
.work-body .t-fn,
.work-body .t-bi,
.display-card-body .t-fn,
.display-card-body .t-bi {
  color: var(--sn-chat-syntax-function, color-mix(in srgb, var(--sn-syntax-function) 55%, var(--sn-sys-on-surface-dim)));
}

.msg-content .t-prop,
.work-body .t-prop,
.display-card-body .t-prop {
  color: var(--sn-chat-syntax-property, color-mix(in srgb, var(--sn-syntax-property) 55%, var(--sn-sys-on-surface-dim)));
}

.work-summary-wrap {
  display: inline-flex;
  align-items: flex-start;
  align-self: flex-start;
  max-width: 100%;
  opacity: 0;
  transform: translateY(-2px);
  transition: opacity var(--sn-transition-fast) var(--sn-transition-easing), transform var(--sn-transition-fast) var(--sn-transition-easing);
}

.message.agent:hover .work-summary-wrap,
.message.agent:focus-within .work-summary-wrap,
.work-summary-wrap:focus-within {
  opacity: 1;
  transform: translateY(0);
}

.thinking-block,
.work-summary {
  font-size: var(--sn-chat-tool-font-size, 12px);
  color: var(--sn-sys-on-surface-dim);
}

.thinking-block summary,
.work-summary summary {
  cursor: pointer;
  user-select: none;
  list-style: none;
  display: inline-flex;
  align-items: center;
  gap: var(--sn-step-3);
  padding: var(--sn-step-2) 0;
  font-weight: 500;
}

.thinking-block summary::-webkit-details-marker,
.work-summary summary::-webkit-details-marker {
  display: none;
}

.thinking-block summary .material-symbols-outlined {
  animation: thinking-pulse var(--sn-animation-duration-normal) var(--sn-transition-easing) infinite;
  animation-play-state: var(--sn-animation-play-state);
}

.thinking-icon {
  font-size: var(--sn-chat-summary-icon-size);
}

@keyframes thinking-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

.work-summary summary > .work-summary-icon {
  color: var(--sn-sys-success);
}

.work-summary-icon {
  font-size: var(--sn-chat-summary-icon-size);
  color: var(--sn-sys-success);
}

.work-copy-btn {
  flex: 0 0 calc(var(--sn-chat-summary-icon-size, 16px) * 1.5);
  margin-top: var(--sn-step-0, 1px);
  width: calc(var(--sn-chat-summary-icon-size, 16px) * 1.5);
  height: calc(var(--sn-chat-summary-icon-size, 16px) * 1.5);
  border: none;
  border-radius: var(--sn-radius-lg);
  background: transparent;
  color: var(--sn-sys-on-surface-dim);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0.75;
  transition: background var(--sn-transition-fast) var(--sn-transition-easing), color var(--sn-transition-fast) var(--sn-transition-easing), opacity var(--sn-transition-fast) var(--sn-transition-easing);
}

.work-copy-btn:hover {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised));
  color: var(--sn-sys-on-surface);
  opacity: 1;
}

.work-copy-btn .material-symbols-outlined {
  font-size: var(--sn-chat-summary-icon-size, 15px);
}

.work-copy-btn.copied {
  color: var(--sn-sys-on-surface);
}

.work-copy-btn.copied .material-symbols-outlined {
  color: var(--sn-sys-on-surface);
}

.work-copy-btn.copy-error {
  color: var(--sn-sys-danger);
}

.work-body {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sn-step-3);
  padding: var(--sn-step-3) 0 var(--sn-step-1) var(--sn-step-10);
}

.chat-session-meta {
  display: flex;
  align-items: center;
  gap: var(--sn-step-3);
  margin-left: var(--sn-step-4);
}

.chat-session-meta:empty {
  display: none;
}

.meta-chip {
  font-size: var(--sn-chat-tool-label-size, 10px);
  font-weight: 500;
  padding: var(--sn-step-1) var(--sn-step-3, 7px);
  border-radius: var(--sn-radius-sm);
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
  color: var(--sn-sys-on-surface-dim);
  white-space: nowrap;
  font-family: var(--sn-font-mono, monospace);
  letter-spacing: 0.2px;
}

.meta-chip-icon {
  font-size: var(--sn-chat-meta-icon-size);
}

.meta-chip.meta-ok {
  color: var(--sn-sys-success);
  background: var(--sn-status-ok-bg);
}

.meta-chip.meta-err {
  color: var(--sn-sys-danger);
  background: var(--sn-status-error-bg);
}

.meta-chip.meta-sid {
  cursor: default;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.thinking-status {
  display: inline-block;
  margin-left: var(--sn-step-4);
  font-size: var(--sn-chat-small-size, 11px);
  font-weight: 400;
  color: var(--sn-sys-on-surface-dim);
  font-style: italic;
}

.status-board {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sn-chat-status-card-gap, 8px);
  padding: var(--sn-step-2) 0;
  width: 100%;
}

.status-card {
  flex: 1 1 220px;
  max-width: 320px;
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
  border: 1px solid color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
  border-radius: var(--sn-radius-lg);
  padding: var(--sn-chat-status-card-padding, 10px 12px);
  display: flex;
  flex-direction: column;
  gap: var(--sn-chat-status-card-gap, 6px);
  transition: border-color var(--sn-transition-normal) var(--sn-transition-easing), box-shadow var(--sn-transition-normal) var(--sn-transition-easing);
  position: relative;
  overflow: hidden;
}

.status-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--card-accent, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface)));
  transition: background var(--sn-transition-normal) var(--sn-transition-easing);
}

.status-card[data-status="running"] {
  border-color: var(--sn-accent-border);
  --card-accent: var(--sn-cat-server);
}

.status-card[data-status="running"]::before {
  animation: card-progress var(--sn-animation-duration-slow) var(--sn-transition-easing) infinite;
  animation-play-state: var(--sn-animation-play-state);
}

@keyframes card-progress {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

.status-card[data-status="done"] {
  border-color: color-mix(in oklch, var(--sn-sys-success) 40%, transparent);
  --card-accent: var(--sn-sys-success);
}

.status-card[data-status="error"] {
  border-color: color-mix(in oklch, var(--sn-sys-danger) 40%, transparent);
  --card-accent: var(--sn-sys-danger);
}

.status-card-linked {
  cursor: pointer;
}

.status-card-linked:hover {
  border-color: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-outline));
  box-shadow: var(--sn-accent-glow);
}

.status-card-header {
  display: flex;
  align-items: center;
  gap: var(--sn-chat-status-card-gap, 6px);
  font-size: var(--sn-chat-status-card-size, 12px);
  font-weight: 500;
  color: var(--sn-sys-on-surface);
}

.status-card-header .material-symbols-outlined {
  font-size: var(--sn-chat-status-icon-size, 16px);
}

.status-card-header .spin-icon {
  animation: spin var(--sn-animation-duration-normal) linear infinite;
  animation-play-state: var(--sn-animation-play-state);
}

.status-card-status {
  font-size: var(--sn-chat-small-size, 11px);
  color: var(--sn-sys-on-surface-dim);
  display: flex;
  align-items: center;
  gap: var(--sn-step-2);
}

.status-card-events {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--sn-chat-status-card-gap, 6px) * 0.5);
}

.status-card-event {
  display: inline-block;
  background: var(--sn-sys-surface-raised);
  color: var(--sn-sys-on-surface-dim);
  padding: var(--sn-composer-footer-btn-padding, 2px 6px);
  border-radius: var(--sn-radius-sm);
  font-size: var(--sn-chat-small-size, 11px);
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  border: 1px solid var(--border-color, var(--sn-sys-outline));
}

.status-card-event[data-type="tool_use"],
.status-card-event[data-type="tool_result"] {
  color: var(--sn-sys-on-surface);
  border-color: var(--sn-sys-accent);
  background: var(--sn-accent-bg);
}

.status-card-event[data-status="error"] {
  color: var(--sn-sys-danger);
  border-color: var(--sn-sys-danger);
  background: var(--sn-danger-bg);
}

.status-card-event[data-type="message"] {
  color: var(--sn-cat-server);
  background: var(--sn-message-event-bg);
}

.source-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--sn-step-3);
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
  border: 1px solid var(--sn-sys-outline);
  padding: var(--sn-step-2) var(--sn-step-4);
  border-radius: var(--sn-radius-md);
  font-size: var(--sn-chat-small-size, 11px);
  color: var(--sn-sys-on-surface-dim);
  margin-top: var(--sn-step-2);
}
.source-badge .material-symbols-outlined {
  font-size: var(--sn-text-lg);
}

.attachment-card {
  display: flex;
  align-items: center;
  gap: var(--sn-step-4);
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
  border: 1px solid var(--sn-sys-outline);
  padding: var(--sn-step-4) var(--sn-step-6);
  border-radius: var(--sn-radius-lg);
  margin: var(--sn-step-2) 0;
  max-width: 320px;
}
.attachment-card .material-symbols-outlined {
  font-size: var(--sn-text-2xl, 20px);
  color: var(--sn-sys-on-surface-dim);
}
.attachment-info {
  display: flex;
  flex-direction: column;
  gap: var(--sn-step-1);
}
.attachment-title {
  font-size: var(--sn-chat-small-size, 12px);
  font-weight: 500;
  color: var(--sn-sys-on-surface);
}

.artifact-card {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
  border: 1px solid var(--sn-sys-outline);
  border-radius: var(--sn-radius-lg);
  overflow: hidden;
  margin: var(--sn-step-3) 0;
  width: 100%;
}
.artifact-header {
  display: flex;
  align-items: center;
  gap: var(--sn-step-3);
  background: var(--sn-sys-surface);
  padding: var(--sn-step-3) var(--sn-step-6);
  border-bottom: 1px solid var(--sn-sys-outline);
}
.artifact-header .material-symbols-outlined {
  font-size: var(--sn-text-xl);
  color: var(--sn-sys-on-surface-dim);
}
.artifact-title {
  font-size: var(--sn-chat-small-size, 11px);
  font-weight: 600;
  color: var(--sn-sys-on-surface-dim);
  text-transform: uppercase;
}

.approval-card,
.action-card {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
  border: 1px solid var(--sn-accent-border, var(--sn-sys-outline));
  border-radius: var(--sn-radius-lg);
  padding: var(--sn-step-6);
  margin: var(--sn-step-4) 0;
  display: flex;
  flex-direction: column;
  gap: var(--sn-step-4);
  width: 100%;
}
.approval-header,
.action-header {
  display: flex;
  align-items: center;
  gap: var(--sn-step-4);
  font-size: var(--sn-chat-status-card-size, 12px);
  font-weight: 600;
  color: var(--sn-sys-on-surface);
}
.approval-header .material-symbols-outlined {
  color: var(--sn-cat-server, var(--sn-sys-on-surface-dim));
}
.action-header .material-symbols-outlined {
  color: var(--sn-accent-color, var(--sn-sys-on-surface-dim));
}
.approval-body,
.action-body {
  font-size: var(--sn-chat-small-size, 12px);
  color: var(--sn-sys-on-surface-dim);
  line-height: 1.4;
}
.approval-actions,
.action-actions {
  display: flex;
  gap: var(--sn-step-4);
  margin-top: var(--sn-step-2);
}
.sn-btn {
  font-family: inherit;
  font-size: var(--sn-chat-small-size, 11px);
  font-weight: 600;
  padding: var(--sn-step-3) var(--sn-step-6);
  border-radius: var(--sn-radius-md);
  border: 1px solid var(--sn-sys-outline);
  background: var(--sn-sys-surface-raised);
  color: var(--sn-sys-on-surface);
  cursor: pointer;
  transition: background var(--sn-transition-fast) var(--sn-transition-easing), border-color var(--sn-transition-fast) var(--sn-transition-easing);
}
.sn-btn:hover {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised));
  border-color: var(--sn-sys-on-surface-dim);
}
.sn-btn.approve {
  background: var(--sn-sys-success);
  color: #fff;
  color: oklch(from var(--sn-sys-success) calc((l - 0.5) * -1000) 0 0);
  border-color: var(--sn-sys-success);
}
.sn-btn.approve:hover {
  background: color-mix(in oklch, var(--sn-sys-success) calc(100% - var(--sn-sys-state-hover-mix)), black);
}
.sn-btn.reject {
  background: var(--sn-sys-danger);
  color: #fff;
  color: oklch(from var(--sn-sys-danger) calc((l - 0.5) * -1000) 0 0);
  border-color: var(--sn-sys-danger);
}
.sn-btn.reject:hover {
  background: color-mix(in oklch, var(--sn-sys-danger) calc(100% - var(--sn-sys-state-hover-mix)), black);
}

.error-card {
  background: var(--sn-danger-bg, color-mix(in oklch, var(--sn-sys-danger) 8%, transparent));
  border: 1px solid color-mix(in oklch, var(--sn-sys-danger) 40%, transparent);
  border-radius: var(--sn-radius-lg);
  padding: var(--sn-step-6);
  margin: var(--sn-step-3) 0;
  display: flex;
  flex-direction: column;
  gap: var(--sn-step-3);
  width: 100%;
}
.error-card.cancelled {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
  border-color: var(--sn-sys-outline);
}
.error-header {
  display: flex;
  align-items: center;
  gap: var(--sn-step-3);
  font-size: var(--sn-chat-status-card-size, 12px);
  font-weight: 600;
  color: var(--sn-sys-on-surface);
}
.error-header .material-symbols-outlined {
  color: var(--sn-sys-danger);
}
.error-card.cancelled .error-header .material-symbols-outlined {
  color: var(--sn-sys-on-surface-dim);
}
.error-body {
  font-size: var(--sn-chat-small-size, 11px);
  color: var(--sn-sys-on-surface-dim);
  font-family: var(--sn-font-mono, monospace);
  white-space: pre-wrap;
}

.display-card {
  box-sizing: border-box;
  background: var(--sn-sys-surface-raised);
  border: 1px solid var(--sn-sys-outline);
  border-radius: var(--sn-radius-xl, 16px);
  padding: var(--sn-chat-message-padding, 12px 16px);
  margin: var(--sn-step-2) 0;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--sn-step-3);
}
.display-card-body {
  font-size: var(--sn-chat-message-font-size, 13px);
  line-height: 1.5;
  color: var(--sn-sys-on-surface);
  min-width: 0;
  max-width: 100%;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.display-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sn-step-3);
  min-width: 0;
  max-width: 100%;
}
.display-card-meta > * {
  min-width: 0;
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
}

.confirm-pill {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--sn-step-4);
  flex-wrap: wrap;
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
  border: 1px solid var(--sn-accent-border, var(--sn-sys-outline));
  border-radius: var(--sn-radius-xl, 16px);
  padding: var(--sn-step-3) var(--sn-step-6);
  margin: var(--sn-step-3) 0;
  width: 100%;
}
/* full-width padded message-content blocks must include padding in their width
   so they never overflow a narrow chat panel (same rule as msg-content/display-card) */
.tool-code,
.md-code-block,
.md-table,
.status-board,
.action-card,
.error-card {
  box-sizing: border-box;
}
.confirm-pill-icon {
  font-size: var(--sn-chat-status-icon-size, 16px);
  color: var(--sn-accent-color, var(--sn-sys-on-surface-dim));
}
.confirm-pill-info {
  display: flex;
  flex-direction: column;
  gap: var(--sn-step-1);
  flex: 1 1 auto;
  min-width: 0;
}
.confirm-pill-title {
  font-size: var(--sn-chat-status-card-size, 12px);
  font-weight: 600;
  color: var(--sn-sys-on-surface);
}
.confirm-pill-text {
  font-size: var(--sn-chat-small-size, 12px);
  color: var(--sn-sys-on-surface-dim);
  line-height: 1.4;
}
.confirm-pill-actions {
  display: flex;
  gap: var(--sn-step-3);
  flex: 0 0 auto;
}
.sn-btn.confirm {
  background: var(--sn-sys-success);
  color: var(--sn-text-on-accent, var(--sn-sys-on-status));
  border-color: var(--sn-sys-success);
}
.sn-btn.confirm:hover {
  background: color-mix(in oklch, var(--sn-sys-success) calc(100% - var(--sn-sys-state-hover-mix)), black);
}
.sn-btn.cancel {
  background: var(--sn-sys-surface-raised);
  color: var(--sn-sys-on-surface);
  border-color: var(--sn-sys-outline);
}
.sn-btn.cancel:hover {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised));
  border-color: var(--sn-sys-on-surface-dim);
}

.confirm-pill.resolved {
  opacity: 0.85;
  border-color: var(--sn-sys-outline);
}
.confirm-pill.resolved .confirm-pill-icon {
  color: var(--sn-sys-on-surface-dim);
}
.confirm-pill[data-resolved='confirm'] .confirm-pill-icon {
  color: var(--sn-sys-success);
}
.confirm-pill.resolved .confirm-btn {
  cursor: default;
}
.confirm-pill.resolved .confirm-btn:disabled {
  opacity: 0.5;
}
.confirm-pill.resolved .confirm-btn.is-chosen {
  opacity: 1;
  font-weight: 600;
}

.actions-card {
  box-sizing: border-box;
  width: 100%;
  margin: var(--sn-step-3) 0;
}
.actions-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sn-step-3);
}
.sn-btn.action-btn-group {
  display: inline-flex;
  align-items: center;
  gap: var(--sn-step-2);
}
.sn-btn.action-btn-group .material-symbols-outlined {
  font-size: var(--sn-chat-status-icon-size, 16px);
}
.sn-btn.action-btn-group[data-variant='primary'] {
  background: var(--sn-sys-success);
  color: var(--sn-text-on-accent, var(--sn-sys-on-status));
  border-color: var(--sn-sys-success);
}
.sn-btn.action-btn-group[data-variant='primary']:hover {
  background: color-mix(in oklch, var(--sn-sys-success) calc(100% - var(--sn-sys-state-hover-mix)), black);
}
.sn-btn.action-btn-group[data-variant='danger'] {
  background: var(--sn-sys-danger);
  color: var(--sn-text-on-accent, var(--sn-sys-on-status));
  border-color: var(--sn-sys-danger);
}
.sn-btn.action-btn-group[data-variant='danger']:hover {
  background: color-mix(in oklch, var(--sn-sys-danger) calc(100% - var(--sn-sys-state-hover-mix)), black);
}

.chat-embed {
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  margin: var(--sn-step-3) 0;
}
`;
