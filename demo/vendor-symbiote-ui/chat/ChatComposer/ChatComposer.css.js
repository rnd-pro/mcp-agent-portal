import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default `
:host,
chat-composer {
  --chat-composer-bg: var(--sn-composer-bg);
  --chat-composer-action-bg: var(--sn-composer-action-bg);
  container: chat-composer / inline-size;
  display: block;
  padding: var(--sn-composer-padding);
  position: relative;
  z-index: 2;
}

.composer-body {
  container: composer-body / inline-size;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  grid-template-rows: minmax(var(--sn-composer-input-min-height), auto) auto;
  align-items: end;
  align-content: stretch;
  gap: var(--sn-composer-control-gap);
  background: var(--chat-composer-bg);
  border-radius: var(--sn-composer-radius);
  padding: var(--sn-composer-body-padding);
  min-block-size: calc(var(--sn-composer-send-size) * 2.75);
  transition: background var(--sn-transition-fast) var(--sn-transition-easing);
}

.voice-preview {
  container: composer-body / inline-size;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--sn-composer-control-gap);
  background: var(--chat-composer-bg);
  border-radius: var(--sn-composer-radius);
  padding: var(--sn-composer-body-padding);
  transition: background var(--sn-transition-fast) var(--sn-transition-easing);
}


.composer-body textarea {
  grid-column: 1 / -1;
  grid-row: 1;
  align-self: stretch;
  min-width: 0;
  min-inline-size: min(100%, var(--sn-composer-input-min-inline-size, 160px));
  box-sizing: border-box;
  width: 100%;
  background: transparent;
  border: none;
  color: var(--sn-sys-on-surface);
  padding: var(--sn-composer-input-padding, 4px 0);
  outline: none;
  font-family: inherit;
  font-size: var(--sn-composer-input-size, 13px);
  line-height: 1.4;
  resize: none;
  min-height: var(--sn-composer-input-min-height);
  max-height: var(--sn-composer-input-max-height, calc(200px * var(--sn-theme-density)));
  overflow-y: auto;
  ${themedScrollFadeBlockStyles}
}

.composer-body textarea:placeholder-shown {
  overflow-y: hidden;
  -webkit-mask-image: none;
  mask-image: none;
}

.composer-leading-controls {
  grid-column: 1;
  grid-row: 2;
  align-self: end;
  display: none;
  min-inline-size: 0;
}

:host([leading-controls]) .composer-body,
chat-composer[leading-controls] .composer-body {
  padding-inline-start: var(--sn-composer-body-leading-padding-inline-start, 8px);
}

:host([leading-controls]) .composer-leading-controls,
chat-composer[leading-controls] .composer-leading-controls {
  display: flex;
  align-items: center;
  justify-content: center;
}

:host([leading-controls]) .composer-body textarea,
chat-composer[leading-controls] .composer-body textarea {
  grid-column: 1 / -1;
}

:host([leading-controls]) .composer-actions,
chat-composer[leading-controls] .composer-actions {
  grid-column: 3;
}

:host([leading-controls]) .btn-mic,
chat-composer[leading-controls] .btn-mic {
  grid-column: 4;
}

:host([leading-controls]) .composer-body > sn-button.btn-send,
chat-composer[leading-controls] .composer-body > sn-button.btn-send {
  grid-column: 5;
}

.composer-actions {
  grid-column: 3;
  grid-row: 2;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  align-self: end;
  justify-self: flex-end;
  gap: var(--sn-composer-control-gap);
  max-width: min(54cqi, var(--sn-composer-actions-max-inline-size, 460px));
  min-width: 0;
  overflow: hidden;
}

.btn-mic {
  grid-column: 4;
  grid-row: 2;
  align-self: end;
}

.composer-body > sn-button.btn-send {
  grid-column: 5;
  grid-row: 2;
  align-self: end;
  justify-self: end;
}

.composer-body textarea::placeholder {
  color: color-mix(in oklab, var(--sn-sys-on-surface-dim) 72%, transparent);
  color: var(--sn-composer-placeholder-color, color-mix(in oklab, var(--sn-sys-on-surface-dim) 72%, transparent));
  opacity: 1;
}

sn-button.btn-send[variant="icon"] {
  --sn-button-icon-size: var(--sn-composer-send-size);
  --sn-button-icon-font-size: var(--sn-composer-send-icon-size);
  --sn-button-radius: 50%;
  --sn-button-bg: var(--sn-sys-on-surface);
  --sn-button-hover-bg: var(--sn-composer-send-hover-bg);
  --sn-button-color: var(--chat-composer-bg);
  --sn-button-disabled-opacity: 0.3;
  --sn-button-focus-ring: 2px solid color-mix(in oklab, var(--sn-sys-on-surface-dim) 50%, transparent);
  background: var(--sn-button-bg);
  border: 0;
  color: var(--sn-button-color);
  flex: 0 0 var(--sn-composer-send-size);
  width: var(--sn-composer-send-size);
  height: var(--sn-composer-send-size);
  min-width: var(--sn-composer-send-size);
  min-height: var(--sn-composer-send-size);
  box-shadow: var(--sn-shadow-sm);
  transition: background var(--sn-transition-fast) var(--sn-transition-easing), box-shadow var(--sn-transition-fast) var(--sn-transition-easing), transform var(--sn-transition-fast) var(--sn-transition-easing);
}

sn-button.btn-send[variant="icon"] .material-symbols-outlined {
  font-size: var(--sn-composer-send-icon-size);
}

sn-button.btn-send[variant="icon"]:hover {
  background: var(--sn-button-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised)));
  color: var(--sn-button-color);
  box-shadow: var(--sn-shadow-md);
  transform: scale(1.05);
}

sn-button.btn-send[variant="icon"]:focus-visible {
  outline-offset: 2px;
}

sn-button.btn-send[variant="icon"][disabled] {
  transform: none;
}

sn-button.btn-send[variant="icon"].btn-stop {
  --sn-button-bg: var(--sn-sys-danger);
  --sn-button-hover-bg: var(--sn-sys-danger);
  color: var(--sn-sys-on-surface);
  position: relative;
}

sn-button.btn-send[variant="icon"].btn-stop:hover {
  /* pin the resting color against the generic send-button hover (0% state layer) */
  color: color-mix(in oklch, var(--sn-sys-accent) 0%, var(--sn-sys-on-surface));
}

sn-button.btn-send[variant="icon"].btn-stop .material-symbols-outlined {
  opacity: 0;
}

sn-button.btn-send[variant="icon"].btn-stop::after {
  content: '';
  width: calc(10px * var(--sn-theme-density));
  height: calc(10px * var(--sn-theme-density));
  border-radius: var(--sn-radius-xs);
  background: var(--sn-sys-on-surface);
  position: absolute;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.composer-footer {
  container: composer-footer / inline-size;
  grid-column: 2;
  grid-row: 2;
  align-self: end;
  justify-self: stretch;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--sn-composer-footer-gap, 4px);
  padding: 0;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.composer-footer:empty {
  display: none;
}

.composer-footer-item {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  gap: var(--sn-composer-footer-gap, 4px);
  flex: 0 1 auto;
}

.composer-leading-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sn-composer-footer-gap, 4px);
  min-inline-size: var(--sn-composer-send-size);
  inline-size: auto;
  max-inline-size: min(var(--sn-composer-leading-control-max-inline-size, 220px), 44cqi);
  block-size: var(--sn-composer-send-size);
  border: 0;
  border-radius: var(--sn-radius-full);
  padding: 0 var(--sn-composer-control-gap, 8px);
  background: transparent;
  color: var(--sn-sys-on-surface-dim);
  font-family: inherit;
  cursor: pointer;
  transition: background var(--sn-transition-fast) var(--sn-transition-easing), color var(--sn-transition-fast) var(--sn-transition-easing), transform var(--sn-transition-fast) var(--sn-transition-easing);
}

.composer-leading-btn.icon-only,
.composer-leading-btn.composer-leading-collapsed {
  inline-size: var(--sn-composer-send-size);
  max-inline-size: var(--sn-composer-send-size);
  padding: 0;
  border-radius: 50%;
}

.composer-leading-btn:hover,
.composer-leading-btn.active {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised));
  color: var(--sn-sys-on-surface);
}

.composer-leading-btn:focus-visible {
  outline: var(--sn-effect-focus-ring);
  outline-offset: 2px;
}

.composer-leading-btn[disabled] {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.composer-leading-btn .material-symbols-outlined {
  font-size: var(--sn-composer-send-icon-size);
}

.composer-leading-label {
  overflow: hidden;
  max-inline-size: var(--sn-composer-leading-label-max, 120px);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--sn-composer-footer-size, 11px);
  font-weight: 650;
}

.composer-footer-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--sn-composer-footer-gap, 4px);
  min-height: var(--sn-composer-footer-btn-min-height, 24px);
  padding: var(--sn-composer-footer-btn-padding, 3px 8px);
  border-radius: var(--sn-radius-lg);
  border: none;
  background: transparent;
  color: var(--sn-sys-on-surface-dim);
  font-size: var(--sn-composer-footer-size, 11px);
  font-family: inherit;
  cursor: pointer;
  transition: background var(--sn-transition-fast) var(--sn-transition-easing), color var(--sn-transition-fast) var(--sn-transition-easing);
  white-space: nowrap;
  min-width: 0;
  max-width: 100%;
  flex: 0 1 auto;
  overflow: hidden;
}

.composer-footer-btn:hover {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised));
  color: var(--sn-sys-on-surface);
}

.composer-footer-btn.active {
  color: var(--sn-sys-on-surface);
  background: color-mix(in oklab, var(--sn-sys-surface-raised) 78%, var(--sn-sys-on-surface) 22%);
}

.composer-footer-btn .material-symbols-outlined {
  font-size: var(--sn-composer-footer-icon-size);
  opacity: 0.75;
  flex: 0 0 auto;
}

.composer-footer-divider-before {
  border-inline-start: 1px solid color-mix(in oklab, var(--sn-sys-on-surface-dim) 18%, transparent);
  margin-inline-start: var(--sn-composer-footer-gap, 4px);
  padding-inline-start: calc(var(--sn-composer-footer-gap, 4px) + var(--sn-composer-control-gap, 8px));
}

.composer-footer-btn:hover .material-symbols-outlined {
  opacity: 1;
}

.composer-footer-meter {
  --composer-meter-progress: 0%;
  --composer-meter-size: var(--sn-composer-context-meter-size, calc(var(--sn-composer-send-size) * 0.58));
  --composer-meter-thickness: var(--sn-composer-context-meter-thickness, calc(var(--composer-meter-size) * 0.22));
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 var(--composer-meter-size);
  inline-size: var(--composer-meter-size);
  block-size: var(--composer-meter-size);
  border: 0;
  border-radius: 50%;
  padding: 0;
  background: transparent;
  color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
}

.composer-footer-meter[hidden] {
  display: none;
}

.composer-footer-meter:hover,
.composer-footer-meter[aria-expanded="true"] {
  color: color-mix(in oklch, var(--sn-sys-on-surface) calc(100% - var(--sn-sys-state-hover-mix)), var(--sn-sys-on-surface-dim));
}

.composer-footer-meter:focus-visible {
  outline: var(--sn-effect-focus-ring);
  outline-offset: 2px;
}

.composer-footer-meter-ring {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  border-radius: 50%;
  background:
    radial-gradient(farthest-side, var(--chat-composer-bg) calc(100% - var(--composer-meter-thickness)), transparent calc(100% - var(--composer-meter-thickness) + 0.5px)),
    conic-gradient(var(--sn-sys-accent) var(--composer-meter-progress), color-mix(in oklab, var(--sn-sys-on-surface-dim) 24%, transparent) 0);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--sn-sys-on-surface-dim) 12%, transparent);
}

.composer-footer-meter-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.composer-footer-select {
  background: transparent;
  border: none;
  color: var(--sn-sys-on-surface-dim);
  font-size: var(--sn-composer-footer-size, 11px);
  font-family: inherit;
  font-weight: 500;
  outline: none;
  cursor: pointer;
  appearance: auto;
  field-sizing: content;
  width: fit-content;
  padding: 0;
  min-width: 0;
  max-width: min(160px, 100%);
  text-overflow: ellipsis;
}

.composer-footer-select-control {
  padding-right: var(--sn-step-2);
  position: relative;
}

.composer-footer-checkbox-control {
  user-select: none;
}

.composer-footer-checkbox {
  accent-color: var(--sn-sys-accent);
  inline-size: var(--sn-composer-footer-icon-size, 16px);
  block-size: var(--sn-composer-footer-icon-size, 16px);
  margin: 0;
}

.composer-footer-select option {
  background: var(--sn-sys-surface-raised);
  color: var(--sn-sys-on-surface);
}

.composer-param-model .composer-footer-select {
  max-width: min(190px, 100%);
}

.composer-toggle-icon {
  font-size: var(--sn-composer-footer-toggle-icon-size) !important;
}

.composer-footer-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.composer-footer-suffix {
  overflow: hidden;
  color: var(--sn-sys-on-surface-dim);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composer-footer-value {
  overflow: hidden;
  max-width: var(--sn-composer-footer-value-max, 92px);
  color: var(--sn-sys-on-surface);
  font-weight: 650;
  text-overflow: ellipsis;
}

.composer-param-collapsed {
  --sn-is-collapsed: 1;
}

@container style(--sn-is-collapsed: 1) {
  .composer-footer-select {
    position: absolute;
    inset: 0;
    width: 100%;
    min-width: var(--sn-composer-collapsed-control-width);
    height: 100%;
    box-sizing: border-box;
    padding-right: var(--sn-composer-collapsed-control-padding);
    opacity: 0;
    z-index: 1;
    cursor: pointer;
  }

  :is(.composer-footer-label, .composer-footer-value, .composer-footer-suffix) {
    display: none;
  }
}

.composer-footer-details-popover {
  --composer-detail-panel-bg: color-mix(in oklab, var(--sn-sys-surface-raised) 94%, var(--sn-sys-on-surface) 6%);
  position: absolute;
  right: 0;
  bottom: 100%;
  z-index: 18;
  box-sizing: border-box;
  inline-size: min(var(--sn-composer-context-details-width, 520px), 100%);
  max-inline-size: 100%;
  max-block-size: min(72vh, 560px);
  overflow: auto;
  margin-bottom: var(--sn-composer-footer-gap, 8px);
  padding: var(--sn-composer-context-details-padding, 16px);
  border: 1px solid color-mix(in oklab, var(--sn-sys-on-surface-dim) 22%, transparent);
  border-radius: var(--sn-composer-context-details-radius, var(--sn-radius-xl, 16px));
  background: var(--composer-detail-panel-bg);
  color: var(--sn-sys-on-surface);
  box-shadow: var(--sn-shadow-xl);
  backdrop-filter: blur(12px);
}

.composer-footer-details-popover[hidden] {
  display: none;
}

.composer-footer-details-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--sn-composer-control-gap, 8px);
  inline-size: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.composer-footer-details-head:hover .composer-footer-details-title,
.composer-footer-details-head:focus-visible .composer-footer-details-title,
.composer-footer-details-head:hover .composer-footer-details-summary,
.composer-footer-details-head:focus-visible .composer-footer-details-summary {
  color: color-mix(in oklch, var(--sn-sys-on-surface) calc(100% - var(--sn-sys-state-hover-mix)), var(--sn-sys-on-surface-dim));
}

.composer-footer-details-head:focus-visible {
  outline: var(--sn-effect-focus-ring);
  outline-offset: 3px;
}

.composer-footer-details-head .material-symbols-outlined {
  color: var(--sn-sys-on-surface-dim);
  font-size: var(--sn-composer-footer-toggle-icon-size, 18px);
}

.composer-footer-details-title {
  min-width: 0;
  color: var(--sn-sys-on-surface-dim);
  font-size: var(--sn-composer-popup-item-size, 13px);
  font-weight: 560;
}

.composer-footer-details-summary {
  color: var(--sn-sys-on-surface-dim);
  font-size: var(--sn-composer-popup-item-size, 13px);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.composer-footer-details-track,
.composer-footer-usage-track {
  --composer-meter-progress: 0%;
  position: relative;
  overflow: hidden;
  block-size: var(--sn-composer-context-track-size, 7px);
  margin-top: var(--sn-composer-control-gap, 8px);
  border-radius: var(--sn-radius-full);
  background: color-mix(in oklab, var(--sn-sys-on-surface-dim) 22%, transparent);
}

.composer-footer-details-fill,
.composer-footer-usage-track span {
  display: block;
  block-size: 100%;
  inline-size: var(--composer-meter-progress);
  border-radius: inherit;
  background: var(--sn-sys-accent);
}

.composer-footer-detail-segments {
  position: absolute;
  inset: 0;
  display: flex;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;
}

.composer-footer-detail-segment {
  flex: 0 0 var(--composer-detail-segment-size, 0%);
  min-inline-size: 2px;
  background: var(--sn-sys-accent);
}

.composer-footer-detail-segment.tone-tools,
.composer-footer-detail-segment.tone-memory,
.composer-footer-detail-segment.tone-system,
.composer-footer-detail-segment.tone-skills {
  background: color-mix(in oklab, var(--sn-sys-accent) 72%, var(--sn-sys-on-surface) 28%);
}

.composer-footer-details-progress-label {
  margin-top: var(--sn-composer-footer-gap, 4px);
  color: var(--sn-sys-on-surface-dim);
  font-size: var(--sn-composer-popup-hint-size, 10px);
  text-align: end;
}

.composer-footer-details-rows {
  display: grid;
  gap: calc(var(--sn-composer-footer-gap, 4px) * 0.5);
  margin-top: var(--sn-composer-footer-gap, 6px);
}

.composer-footer-details-rows[hidden],
.composer-footer-usage-rows[hidden] {
  display: none;
}

.composer-footer-usage[hidden] {
  display: none;
}

.composer-footer-details-toggle {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--sn-composer-footer-gap, 6px);
  inline-size: 100%;
  min-block-size: var(--sn-step-8, 32px);
  border: 0;
  border-radius: var(--sn-radius-md, 8px);
  padding: var(--sn-step-1, 4px) var(--sn-step-2, 8px);
  background: transparent;
  color: var(--sn-sys-on-surface-dim);
  font: inherit;
  font-size: var(--sn-composer-popup-item-size, 13px);
  text-align: start;
  cursor: pointer;
}

.composer-footer-details-toggle[hidden],
.composer-footer-usage-head[hidden] {
  display: none;
}

.composer-footer-details-toggle:hover,
.composer-footer-details-toggle:focus-visible {
  background: color-mix(in oklab, var(--sn-sys-on-surface-dim) 10%, transparent);
  color: var(--sn-sys-on-surface);
}

.composer-footer-details-toggle:focus-visible {
  outline: var(--sn-effect-focus-ring);
  outline-offset: 2px;
}

.composer-footer-details-toggle .material-symbols-outlined {
  flex: 0 0 auto;
  font-size: var(--sn-composer-footer-toggle-icon-size, 18px);
}

.composer-footer-details-action {
  margin-inline-start: auto;
  opacity: 0.7;
}

.composer-footer-detail-row {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--sn-composer-footer-gap, 6px);
  min-width: 0;
  color: var(--sn-sys-on-surface);
  font-size: var(--sn-composer-popup-item-size, 13px);
  line-height: 1.25;
}

.composer-footer-detail-row.is-muted {
  color: var(--sn-sys-on-surface-dim);
}

.composer-footer-detail-row.depth-1 {
  padding-inline-start: calc(var(--sn-composer-control-gap, 8px) * 1.4);
}

.composer-footer-detail-prefix {
  color: var(--sn-sys-on-surface-dim);
}

.composer-footer-detail-swatch {
  inline-size: 8px;
  block-size: 8px;
  border-radius: var(--sn-radius-xs);
  background: var(--sn-sys-accent);
}

.composer-footer-detail-row.tone-free .composer-footer-detail-swatch,
.composer-footer-detail-row.tone-deferred .composer-footer-detail-swatch {
  background: color-mix(in oklab, var(--sn-sys-on-surface-dim) 38%, transparent);
}

.composer-footer-detail-row.tone-free,
.composer-footer-detail-row.tone-deferred {
  color: var(--sn-sys-on-surface-dim);
}

.composer-footer-detail-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composer-footer-detail-value,
.composer-footer-detail-meta {
  color: var(--sn-sys-on-surface-dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.composer-footer-detail-meta {
  min-inline-size: 4ch;
  text-align: end;
  color: var(--sn-sys-on-surface);
}

.composer-footer-usage {
  margin-top: var(--sn-composer-control-gap, 12px);
  padding-top: var(--sn-composer-control-gap, 10px);
  border-top: 1px solid color-mix(in oklab, var(--sn-sys-on-surface-dim) 20%, transparent);
}

.composer-footer-usage-head,
.composer-footer-usage-line {
  display: flex;
  align-items: baseline;
  gap: var(--sn-composer-footer-gap, 6px);
  min-width: 0;
}

.composer-footer-usage-head {
  justify-content: space-between;
  margin-bottom: var(--sn-composer-control-gap, 8px);
  color: var(--sn-sys-on-surface-dim);
  font-size: var(--sn-composer-popup-item-size, 13px);
}

.composer-footer-usage-head .material-symbols-outlined {
  font-size: var(--sn-composer-footer-toggle-icon-size, 18px);
}

.composer-footer-usage-rows {
  display: grid;
  gap: var(--sn-composer-control-gap, 8px);
}

.composer-footer-usage-line {
  color: var(--sn-sys-on-surface);
  font-size: var(--sn-composer-popup-item-size, 13px);
}

.composer-footer-usage-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composer-footer-usage-value {
  margin-inline-start: auto;
  color: var(--sn-sys-on-surface-dim);
  white-space: nowrap;
}

.composer-footer-usage-meta {
  color: var(--sn-sys-on-surface-dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.composer-footer-usage-row.tone-warning .composer-footer-usage-track span {
  background: var(--sn-sys-warning, var(--sn-cat-warning));
}

@media (width <= 560px) {
  .composer-footer-details-popover {
    left: 0;
    right: 0;
    inline-size: auto;
  }
}

@container composer-footer (width <= 560px) {
  .composer-priority-1 {
    --sn-is-collapsed: 1;
  }
}

@container composer-footer (width <= 500px) {
  .composer-param-model.composer-long-value,
  .composer-priority-2 {
    --sn-is-collapsed: 1;
  }
}

@container composer-footer (width <= 440px) {
  .composer-priority-3 {
    --sn-is-collapsed: 1;
  }
}

@container composer-footer (width <= 380px) {
  .composer-priority-4 {
    --sn-is-collapsed: 1;
  }
}

@container composer-footer (width <= 320px) {
  .composer-priority-5 {
    --sn-is-collapsed: 1;
  }
}

@container composer-footer (width <= 320px) {
  .composer-footer-optional {
    display: none;
  }

  .composer-param-model.composer-compact-value .composer-footer-select {
    width: min(7ch, 100%);
    max-width: min(7ch, 100%);
    padding-right: 0;
    color: var(--sn-sys-on-surface) !important;
  }
}

.chat-context-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sn-composer-chip-gap, 6px);
  padding: 0 var(--sn-composer-control-gap, 8px) var(--sn-composer-control-gap, 8px);
  min-height: 0;
  min-width: 0;
  max-width: 100%;
}

.chat-context-bar:empty {
  display: none;
}

.context-chip {
  display: flex;
  align-items: center;
  gap: var(--sn-composer-chip-gap, 4px);
  min-width: 0;
  max-width: 100%;
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
  border-radius: var(--sn-radius-md);
  padding: var(--sn-composer-chip-padding, 3px 8px);
  font-size: var(--sn-composer-chip-size, 11px);
  color: var(--sn-sys-on-surface-dim);
}

.context-path {
  min-width: 0;
  max-width: min(200px, 100%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-remove {
  --sn-button-icon-size: calc(var(--sn-composer-send-size) * 0.5);
  --sn-button-icon-font-size: var(--sn-composer-input-size, 13px);
  --sn-button-border: transparent;
  --sn-button-radius: 4px;
  --sn-button-bg: transparent;
  --sn-button-hover-bg: transparent;
  --sn-button-hover-border: transparent;
  --sn-button-color: var(--sn-sys-on-surface-dim);
  --sn-button-focus-ring: var(--sn-effect-focus-ring);
  color: var(--sn-sys-on-surface-dim);
  line-height: 1;
}

.context-remove:hover {
  color: var(--sn-sys-danger);
  background: color-mix(in oklch, var(--sn-sys-danger) var(--sn-sys-state-hover-mix), transparent);
}

:host(.drag-over) .composer-body,
chat-composer.drag-over .composer-body {
  background: var(--chat-composer-action-bg);
  outline: 1px dashed var(--sn-sys-outline);
  outline-offset: -1px;
}

.autocomplete-popup {
  display: none;
  position: absolute;
  bottom: 100%;
  left: var(--sn-composer-popup-inset, 20px);
  right: var(--sn-composer-popup-inset, 20px);
  max-height: 240px;
  overflow-y: auto;
  ${themedScrollFadeBlockStyles}
  background: color-mix(in oklab, var(--sn-sys-surface-raised) 95%, transparent);
  border: 1px solid color-mix(in oklab, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised)) 45%, transparent);
  border-radius: var(--sn-radius-xl, 16px);
  padding: var(--sn-composer-autocomplete-padding, 4px);
  margin-bottom: var(--sn-composer-footer-gap, 6px);
  box-shadow: var(--sn-shadow-xl);
  z-index: 10;
  backdrop-filter: blur(8px);
}

.autocomplete-popup.visible {
  display: block;
}

.autocomplete-header {
  padding: var(--sn-composer-autocomplete-item-padding, 6px 10px);
  font-size: var(--sn-composer-popup-header-size, 10px);
  font-weight: 600;
  color: var(--sn-sys-on-surface-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.autocomplete-item {
  display: flex;
  align-items: center;
  gap: var(--sn-composer-control-gap, 8px);
  padding: var(--sn-composer-autocomplete-item-padding, 6px 10px);
  border-radius: var(--sn-radius-lg);
  cursor: pointer;
  font-size: var(--sn-composer-popup-item-size, 12px);
  color: var(--sn-sys-on-surface);
  opacity: 0.75;
  transition: background var(--sn-transition-fast) var(--sn-transition-easing), opacity var(--sn-transition-fast) var(--sn-transition-easing), color var(--sn-transition-fast) var(--sn-transition-easing);
}

.autocomplete-item:hover,
.autocomplete-item.active {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised));
  color: var(--sn-sys-on-surface);
  opacity: 1;
}

.autocomplete-item .material-symbols-outlined {
  font-size: var(--sn-composer-send-icon-size, 16px);
  color: var(--sn-sys-on-surface-dim);
}

.autocomplete-item-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.autocomplete-item-hint {
  font-size: var(--sn-composer-popup-hint-size, 10px);
  color: var(--sn-sys-on-surface-dim);
}

/* ── Voice Input — Mic Button ── */

.btn-mic,
.btn-wake-listen,
.btn-voice-response,
.btn-voice-command,
.btn-voice-language {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--sn-composer-send-size);
  height: var(--sn-composer-send-size);
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
  transition: color var(--sn-transition-fast) var(--sn-transition-easing), background var(--sn-transition-fast) var(--sn-transition-easing);
  flex: 0 0 auto;
}

.btn-mic:hover,
.btn-wake-listen:hover,
.btn-voice-response:hover,
.btn-voice-command:hover,
.btn-voice-language:hover {
  color: var(--sn-sys-on-surface);
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised));
}

.btn-mic .material-symbols-outlined,
.btn-wake-listen .material-symbols-outlined,
.btn-voice-response .material-symbols-outlined,
.btn-voice-command .material-symbols-outlined {
  font-size: var(--sn-composer-send-icon-size);
}

.btn-mic[hidden],
.btn-wake-listen[hidden],
.btn-voice-response[hidden],
.btn-voice-command[hidden],
.btn-voice-language[hidden] {
  display: none;
}

.btn-mic {
  order: 60;
}

.btn-wake-listen {
  order: 20;
}

.btn-voice-response {
  order: 30;
}

.btn-voice-command {
  order: 40;
}

.btn-voice-language {
  order: 50;
}

.btn-wake-listen.has-command {
  width: auto;
  max-width: min(var(--sn-composer-wake-command-max, 164px), 36cqi);
  padding: 0 var(--sn-composer-control-gap, 10px);
  gap: var(--sn-composer-footer-gap, 6px);
  border-radius: var(--sn-radius-full);
}

.wake-command-text {
  display: none;
  max-width: var(--sn-composer-voice-label-max, 118px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--sn-composer-voice-label-size, 11px);
  font-weight: 650;
  letter-spacing: 0;
}

.btn-wake-listen.has-command .wake-command-text {
  display: inline;
}

.btn-voice-language {
  width: auto;
  min-width: calc(var(--sn-composer-send-size) * 2.7);
  max-width: min(var(--sn-composer-voice-command-max, 170px), 38cqi);
  overflow: hidden;
  padding: calc(var(--sn-composer-send-size) * 0.0625);
  gap: calc(var(--sn-composer-send-size) * 0.0625);
  border-radius: var(--sn-radius-full);
  font-size: var(--sn-composer-voice-label-size, 11px);
  font-weight: 650;
  letter-spacing: 0;
  color: var(--sn-sys-on-surface-dim);
  background: var(--sn-sys-surface-raised);
}

.voice-language-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: calc(var(--sn-composer-send-size) * 0.75);
  height: calc(var(--sn-composer-send-size) - var(--sn-composer-footer-gap, 4px));
  padding: 0 calc(var(--sn-composer-control-gap, 8px) * 0.875);
  border-radius: var(--sn-radius-full);
  color: var(--sn-sys-on-surface-dim);
  line-height: 1;
}

.voice-language-option.active {
  color: var(--sn-sys-on-surface);
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), var(--sn-sys-surface-raised));
}

.btn-voice-command {
  width: auto;
  max-width: min(var(--sn-composer-voice-command-max, 170px), 36cqi);
  padding: 0 var(--sn-composer-control-gap, 10px);
  gap: var(--sn-composer-footer-gap, 6px);
  border-radius: var(--sn-radius-full);
  background: color-mix(in oklch, var(--sn-sys-on-surface) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised));
  color: var(--sn-sys-on-surface-dim);
}

.btn-voice-command.active {
  color: var(--sn-sys-on-surface);
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), var(--sn-sys-surface-raised));
}

.voice-command-button-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--sn-composer-voice-label-size, 11px);
  font-weight: 650;
  letter-spacing: 0;
}

.btn-mic[disabled],
.btn-wake-listen[disabled],
.btn-voice-response[disabled],
.btn-voice-command[disabled],
.btn-voice-language[disabled] {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-voice-response.active,
.btn-voice-response.speaking {
  color: var(--sn-sys-accent);
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), var(--sn-sys-surface-raised));
}

.btn-wake-listen.listening {
  color: var(--sn-sys-accent);
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), var(--sn-sys-surface-raised));
}

.btn-wake-listen.listening .material-symbols-outlined {
  font-variation-settings: 'FILL' 1;
}

@container composer-body (width <= 960px) {
  .btn-voice-command {
    width: var(--sn-composer-send-size);
    max-width: var(--sn-composer-send-size);
    padding: 0;
    border-radius: 50%;
  }

  .btn-voice-command .voice-command-button-text {
    display: none;
  }

}

@container composer-body (width <= 560px) {
  .btn-wake-listen.has-command {
    width: var(--sn-composer-send-size);
    max-width: var(--sn-composer-send-size);
    padding: 0;
    border-radius: 50%;
  }

  .btn-wake-listen.has-command .wake-command-text {
    display: none;
  }
}

@container chat-composer (width <= 480px) {
  .btn-voice-language {
    min-width: calc(var(--sn-composer-send-size) * 2.2);
    max-width: calc(var(--sn-composer-send-size) * 2.6);
  }

  .voice-language-option {
    min-width: calc(var(--sn-composer-send-size) * 0.62);
    padding-inline: calc(var(--sn-composer-control-gap, 8px) * 0.5);
  }
}

@container composer-body (width <= 340px) {
  .composer-actions {
    justify-self: stretch;
    align-self: end;
    justify-content: flex-end;
  }

  .btn-voice-language {
    width: var(--sn-composer-send-size);
    min-width: var(--sn-composer-send-size);
    max-width: var(--sn-composer-send-size);
    border-radius: 50%;
    padding: 0;
  }

  .btn-voice-language .voice-language-option:not(.active) {
    display: none;
  }
}

.btn-mic.recording {
  color: var(--sn-sys-danger);
  animation: mic-pulse var(--sn-animation-duration-slow) var(--sn-transition-easing) infinite;
  animation-play-state: var(--sn-animation-play-state);
}

.btn-mic.recording .material-symbols-outlined {
  font-variation-settings: 'FILL' 1;
}

.btn-mic.processing {
  color: var(--sn-sys-on-surface-dim);
  pointer-events: none;
}

.btn-mic.processing .material-symbols-outlined {
  animation: mic-spin var(--sn-animation-duration-normal) linear infinite;
  animation-play-state: var(--sn-animation-play-state);
}

@keyframes mic-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes mic-spin {
  100% { transform: rotate(360deg); }
}

/* ── Voice Input — Preview Banner ── */

.voice-preview {
  margin: 0 0 var(--sn-composer-footer-gap, 4px);
  animation: voice-preview-in var(--sn-transition-fast) var(--sn-transition-easing);
  animation-play-state: var(--sn-animation-play-state);
}

.voice-preview[hidden] {
  display: none;
}

@keyframes voice-preview-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.voice-preview.recording {
  background: var(--chat-composer-bg);
}

.voice-preview.processing {
  background: var(--chat-composer-bg);
}

.voice-preview.result {
  background: var(--chat-composer-bg);
}

.voice-preview-body {
  font-size: var(--sn-composer-voice-preview-size, 13px);
  line-height: 1.4;
  color: var(--sn-sys-on-surface);
  min-height: var(--sn-composer-input-min-height);
  padding: var(--sn-composer-input-padding, 4px 0);
  outline: none;
  word-break: break-word;
}

.voice-preview-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.voice-preview-status {
  color: var(--sn-sys-on-surface-dim);
  font-size: var(--sn-composer-voice-status-size, 12px);
  line-height: 1.4;
  font-family: var(--sn-font-mono);
}

.voice-preview.recording .voice-preview-status.voice-preview-elapsed {
  color: var(--sn-sys-danger);
}

.voice-preview-status[hidden],
.voice-preview-body[hidden] {
  display: none;
}

.voice-preview-body[contenteditable="true"] {
  cursor: text;
  border-radius: calc(var(--sn-radius-md, 6px) * var(--sn-theme-radius-scale));
  padding-inline: var(--sn-step-2);
  margin-inline: var(--sn-step-0, -4px);
}

.voice-preview-body[contenteditable="true"]:focus {
  /* editing reveals the field surface — no accent layer (0% state mix) */
  background: color-mix(in oklch, var(--sn-sys-accent) 0%, var(--sn-sys-surface));
}

.voice-command-hints {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sn-composer-footer-gap, 4px);
  margin-top: var(--sn-composer-footer-gap, 6px);
}

.voice-command-hints[hidden] {
  display: none;
}

.voice-command-hint {
  display: inline-flex;
  align-items: center;
  min-height: var(--sn-composer-input-min-height, 20px);
  padding: var(--sn-composer-footer-btn-padding, 2px 7px);
  border-radius: var(--sn-radius-full);
  background: color-mix(in oklab, var(--sn-sys-surface-raised) 86%, var(--sn-sys-on-surface) 14%);
  color: var(--sn-sys-on-surface-dim);
  font-size: var(--sn-composer-voice-label-size, 11px);
  font-weight: 600;
  line-height: 1.2;
}

.voice-preview-actions {
  display: flex;
  align-items: center;
  gap: var(--sn-composer-control-gap);
  flex: 0 0 auto;
}

.voice-preview-btn {
  --sn-button-icon-size: var(--sn-composer-send-size);
  --sn-button-icon-font-size: var(--sn-composer-send-icon-size);
  --sn-button-radius: 50%;
  --sn-button-focus-ring: 2px solid color-mix(in oklab, var(--sn-sys-on-surface-dim) 50%, transparent);
  width: var(--sn-composer-send-size);
  height: var(--sn-composer-send-size);
  min-height: var(--sn-composer-send-size);
  padding: 0;
  border-radius: 50%;
  box-shadow: var(--sn-shadow-sm);
  transition: background var(--sn-transition-fast) var(--sn-transition-easing), border-color var(--sn-transition-fast) var(--sn-transition-easing), box-shadow var(--sn-transition-fast) var(--sn-transition-easing), transform var(--sn-transition-fast) var(--sn-transition-easing);
}

.voice-preview-btn:hover {
  box-shadow: var(--sn-shadow-md);
  transform: scale(1.05);
}

.voice-preview-btn[hidden] {
  display: none;
}

.voice-preview-btn .material-symbols-outlined {
  font-size: var(--sn-composer-send-icon-size, 16px);
}

`;
