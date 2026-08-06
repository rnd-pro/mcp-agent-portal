import {
  createPanel,
  createSplit,
  layoutHasBehaviorMetadata,
  normalizeLayoutBehavior,
} from '../layout/LayoutTree.js';
import {
  HTML_IN_CANVAS_RENDERER,
  getHtmlInCanvasSupport,
} from '../canvas/html-in-canvas.js';
import {
  WORKSPACE_VIRTUAL_SEQUENCE_SCHEMA,
  createVirtualSequenceProjection,
} from './virtual-sequence.js';
import { getPrecisionVideoDecodeSupport } from './precision-video-decoder.js';
import { createVideoFrameClock } from './video-frame-clock.js';
import { assertCaptionPlacementTrack } from 'symbiote-engine/render-captions';

export const MEDIA_STUDIO_PANEL_TYPES = Object.freeze({
  source: 'media-source',
  preview: 'media-preview',
  inspector: 'media-inspector',
  timeline: 'media-timeline',
});

export const MEDIA_STUDIO_FRAME_SOURCE_TYPES = Object.freeze({
  virtualSequence: 'virtual-sequence',
  externalBrowser: 'external-browser',
  elementCapture: 'element-capture',
  regionCapture: 'region-capture',
  htmlInCanvas: 'html-in-canvas',
  cachedSequence: 'cached-sequence',
  mediaStream: 'media-stream',
});

export const MEDIA_STUDIO_PREVIEW_MODES = Object.freeze({
  sequence: 'sequence',
  output: 'output',
});

export const MEDIA_PREVIEW_STATES = Object.freeze({
  empty: 'empty',
  loading: 'loading',
  waiting: 'waiting',
  ready: 'ready',
  unsupported: 'unsupported',
  error: 'error',
});

const MEDIA_STUDIO_CAPTION_PROFILES = Object.freeze([
  'youtube',
  'tiktok',
  'square',
  'live',
]);

const MEDIA_STUDIO_CAPTION_PLACEMENTS = Object.freeze([
  'bottom',
  'top',
  'middle',
]);

const NON_CANONICAL_CAPTION_SETTINGS = Object.freeze([
  'captionStyleOptions',
  'captionPlacementOptions',
  'captionHighContrast',
  'captionFontSize',
]);

export const MEDIA_STUDIO_CSS_PARTS = Object.freeze([
  'surface',
  'source-pane',
  'preview',
  'preview-stage',
  'preview-overlay',
  'transport',
  'timeline',
  'inspector-pane',
  'settings',
  'fallback',
  'progress',
]);

export const MEDIA_STUDIO_STYLE_TOKENS = Object.freeze([
  '--sn-media-studio-bg',
  '--sn-media-studio-border',
  '--sn-media-studio-preview-bg',
  '--sn-media-studio-preview-radius',
  '--sn-media-studio-preview-shadow',
  '--sn-media-studio-timeline-bg',
  '--sn-media-studio-pane-bg',
  '--sn-media-studio-pane-width',
  '--sn-media-studio-timeline-height',
  '--sn-media-studio-control-height',
  '--sn-media-studio-progress-color',
  '--sn-media-studio-panel-gap',
  '--sn-media-studio-checker-a',
  '--sn-media-studio-checker-b',
  '--sn-media-studio-track-video-bg',
  '--sn-media-studio-track-audio-bg',
  '--sn-media-studio-playhead-color',
]);

export const MEDIA_STUDIO_SURFACE_STYLES = `
  .sn-media-studio-panel,
  .sn-media-studio-timeline-panel,
  .sn-media-studio-progress-shell,
  .sn-media-studio-side-panel {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    height: 100%;
    min-height: 0;
  }

  .sn-media-studio-panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--sn-media-studio-panel-gap, var(--sn-frame-gap, 0px));
    align-content: stretch;
    border: 0;
    outline: 0;
    box-shadow: none;
    overflow: hidden;
    background: var(--sn-media-studio-bg, var(--sn-media-studio-pane-bg, var(--sn-sys-surface-panel)));
  }

  layout-node:has(.sn-media-studio-panel) .panel-view,
  layout-node:has(.sn-media-studio-timeline-panel) .panel-view {
    border: 0;
    outline: 0;
    box-shadow: none;
    background: transparent;
    overflow: hidden;
  }

  layout-node:has(.sn-media-studio-panel) .panel-content,
  layout-node:has(.sn-media-studio-timeline-panel) .panel-content {
    --sn-scroll-area-padding: 0px;
    --sn-scroll-shadow-size: 0px;
    --sn-scroll-fade-mask: none;
    padding: 0;
    border: 0;
    outline: 0;
    box-shadow: none;
    background: transparent;
    overflow: hidden;
  }

  layout-node:has(.sn-media-studio-panel) .panel-content > sn-scroll-area,
  layout-node:has(.sn-media-studio-timeline-panel) .panel-content > sn-scroll-area {
    --sn-scroll-area-padding: 0px;
    --sn-scroll-shadow-size: 0px;
    --sn-scroll-fade-mask: none;
    display: block;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0;
    margin: 0;
    border: 0;
    outline: 0;
    box-shadow: none;
    background: transparent;
    overflow: hidden;
  }

  .sn-media-studio-side-panel {
    display: grid;
    gap: var(--sn-media-studio-panel-gap, var(--sn-frame-gap, 0px));
    align-content: start;
    padding: calc(10px * var(--sn-theme-density, 1));
    min-inline-size: min(100%, var(--sn-media-studio-pane-width, 260px));
    border: 1px solid var(--sn-media-studio-border, color-mix(in srgb, var(--sn-sys-on-surface) 12%, transparent));
    border-radius: var(--sn-media-studio-preview-radius, var(--sn-node-radius, 0px));
    background: var(--sn-media-studio-pane-bg, color-mix(in srgb, var(--sn-sys-surface-panel) 92%, var(--sn-sys-surface)));
  }

  .sn-media-studio-preview-stage {
    grid-row: 2;
    position: relative;
    display: grid;
    place-items: stretch;
    box-sizing: border-box;
    min-width: 0;
    min-height: 0;
    height: 100%;
    border: 0;
    border-radius: 0;
    background-color: var(--sn-media-studio-checker-a, var(--sn-media-studio-bg, var(--sn-media-studio-preview-bg, color-mix(in srgb, var(--sn-sys-surface) 84%, black))));
    background-image:
      conic-gradient(
        var(--sn-media-studio-checker-b, color-mix(in srgb, var(--sn-sys-surface) 70%, black)) 25%,
        transparent 25%,
        transparent 50%,
        var(--sn-media-studio-checker-b, color-mix(in srgb, var(--sn-sys-surface) 70%, black)) 50%,
        var(--sn-media-studio-checker-b, color-mix(in srgb, var(--sn-sys-surface) 70%, black)) 75%,
        transparent 75%
      );
    background-size: 20px 20px;
    padding: 0;
    overflow: hidden;
  }

  .sn-media-studio-preview-stage > .sn-media-studio-progress-failures {
    position: absolute;
    inset-block-start: 12px;
    inset-inline: 12px;
    z-index: 3;
    max-inline-size: min(560px, calc(100% - 24px));
  }

  .sn-media-studio-preview-window {
    box-sizing: border-box;
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: var(--sn-media-studio-preview-shadow, none);
    container-type: size;
  }

  .sn-media-studio-preview-window::before {
    display: none;
  }

  .sn-media-studio-frame {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    background: transparent;
    box-shadow: none;
  }

  .sn-media-studio-caption-overlay {
    position: absolute;
    inset: 0;
    margin: auto;
    z-index: 2;
    overflow: hidden;
    pointer-events: none;
    container-type: size;
  }

  .sn-media-studio-caption-line {
    position: absolute;
    box-sizing: border-box;
    display: block;
    overflow: hidden;
    font-weight: 700;
    text-align: center;
    letter-spacing: 0;
  }

  .sn-media-studio-caption-row {
    display: block;
    white-space: nowrap;
  }

  .sn-media-studio-caption-word {
    display: inline-block;
    min-inline-size: 0;
    color: inherit;
  }

  .sn-media-studio-caption-word[data-caption-word-state='past'] {
    color: var(--sn-media-studio-caption-primary);
  }

  .sn-media-studio-caption-word[data-caption-word-state='future'] {
    color: var(--sn-media-studio-caption-primary);
    opacity: .82;
  }

  .sn-media-studio-caption-word[data-caption-word-state='active'] {
    color: var(--sn-media-studio-caption-highlight);
  }

  .sn-media-studio-frame-placeholder {
    display: grid;
    place-items: center;
    gap: 8px;
    padding: 18px;
    color: var(--sn-sys-on-surface-dim);
    text-align: center;
    min-width: 0;
  }

  .sn-media-studio-frame-placeholder strong {
    color: var(--sn-sys-on-surface);
    font-size: calc(13px * var(--sn-theme-type-scale, 1));
  }

  .sn-media-studio-frame-placeholder span {
    max-width: 52ch;
    overflow-wrap: anywhere;
    font-size: calc(12px * var(--sn-theme-type-scale, 1));
  }

  .sn-media-studio-preview-stage[data-preview-state='ready'] .sn-media-studio-frame-placeholder {
    display: none;
  }

  .sn-media-studio-timeline-panel {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    gap: 0;
    align-content: stretch;
    min-block-size: var(--sn-media-studio-timeline-height, 172px);
    height: 100%;
    overflow: hidden;
    border: 0;
    outline: 0;
    box-shadow: none;
    background: var(--sn-media-studio-timeline-bg, color-mix(in srgb, var(--sn-sys-surface) 86%, black));
  }

  .sn-media-studio-timeline-editor {
    min-block-size: 0;
    block-size: 100%;
    inline-size: 100%;
    --te-header-width: 112px;
    --te-track-height: var(--sn-media-studio-control-height, 28px);
    --te-ruler-height: var(--sn-media-studio-control-height, 28px);
    --te-transport-height: var(--sn-media-studio-control-height, 28px);
    --te-playhead-color: var(--sn-media-studio-playhead-color, var(--sn-media-studio-progress-color, var(--sn-sys-accent)));
    --te-track-bg: var(--sn-media-studio-timeline-bg, var(--sn-sys-surface));
    --te-track-bg-alt: color-mix(in srgb, var(--sn-media-studio-timeline-bg, var(--sn-sys-surface)) 82%, var(--sn-sys-surface-panel));
    --sn-dom-timeline-clip-video: var(--sn-media-studio-track-video-bg, var(--sn-sys-accent));
    --sn-dom-timeline-clip-audio: var(--sn-media-studio-track-audio-bg, var(--sn-sys-warning));
    border: 0;
    outline: 0;
    box-shadow: none;
  }

  .sn-media-studio-progress-shell {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 128px), 1fr));
    gap: calc(8px * var(--sn-theme-density, 1));
    align-content: start;
  }

  .sn-media-studio-prep-progress {
    display: grid;
    gap: 5px;
    padding: 8px 10px;
    border-block-end: 1px solid color-mix(in srgb, var(--sn-sys-on-surface) 10%, transparent);
    background: color-mix(in srgb, var(--sn-sys-surface-panel) 76%, transparent);
    color: var(--sn-sys-on-surface);
    font-size: calc(12px * var(--sn-theme-type-scale, 1));
  }

  .sn-media-studio-prep-progress-meta {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }

  .sn-media-studio-prep-progress-stage,
  .sn-media-studio-prep-progress-count {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sn-media-studio-prep-progress-count {
    color: var(--sn-sys-on-surface-dim);
    font-family: var(--sn-font-mono, monospace);
  }

  .sn-media-studio-prep-progress-track {
    block-size: 4px;
    overflow: hidden;
    background: color-mix(in srgb, var(--sn-sys-on-surface) 12%, transparent);
  }

  .sn-media-studio-prep-progress-fill {
    display: block;
    block-size: 100%;
    inline-size: var(--sn-media-studio-prep-progress, 0%);
    background: var(--sn-media-studio-progress-color, var(--sn-sys-accent));
  }

  .sn-media-studio-inspector-panel {
    display: grid;
    gap: calc(12px * var(--sn-theme-density, 1));
    align-content: start;
    min-width: 0;
    color: var(--sn-sys-on-surface);
  }

  .sn-media-studio-inspector-section {
    display: grid;
    gap: calc(8px * var(--sn-theme-density, 1));
    min-width: 0;
    padding-block-end: calc(10px * var(--sn-theme-density, 1));
    border-block-end: 1px solid color-mix(in srgb, var(--sn-sys-on-surface) 9%, transparent);
  }

  .sn-media-studio-inspector-section:last-child {
    border-block-end: 0;
  }

  .sn-media-studio-inspector-heading {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    color: var(--sn-sys-on-surface);
    font-size: calc(13px * var(--sn-theme-type-scale, 1));
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .sn-media-studio-inspector-heading .material-symbols-outlined {
    color: var(--sn-media-studio-progress-color, var(--sn-sys-accent));
    font-size: 16px;
  }

  .sn-media-studio-settings-grid {
    display: grid;
    gap: calc(7px * var(--sn-theme-density, 1));
    min-width: 0;
  }

  .sn-media-studio-setting-row {
    display: grid;
    grid-template-columns: minmax(92px, 0.52fr) minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    min-width: 0;
    color: var(--sn-sys-on-surface-dim);
    font-size: calc(12px * var(--sn-theme-type-scale, 1));
  }

  .sn-media-studio-setting-row.is-toggle {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }

  .sn-media-studio-setting-row input[type='checkbox'] {
    inline-size: 16px;
    block-size: 16px;
    accent-color: var(--sn-media-studio-progress-color, var(--sn-sys-accent));
  }

  .sn-media-studio-setting-control {
    box-sizing: border-box;
    min-inline-size: 0;
    inline-size: 100%;
    min-block-size: 28px;
    padding: 4px 8px;
    border: 1px solid color-mix(in srgb, var(--sn-sys-on-surface) 10%, transparent);
    border-radius: var(--sn-node-radius, 0px);
    background: color-mix(in srgb, black 18%, transparent);
    color: var(--sn-sys-on-surface);
    font: inherit;
  }

  .sn-media-studio-setting-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    min-width: 0;
  }

  .sn-media-studio-action-button {
    min-block-size: 30px;
    padding: 5px 10px;
    border: 1px solid color-mix(in srgb, var(--sn-media-studio-progress-color, var(--sn-sys-accent)) 42%, transparent);
    border-radius: var(--sn-node-radius, 0px);
    background: color-mix(in srgb, var(--sn-media-studio-progress-color, var(--sn-sys-accent)) 20%, transparent);
    color: var(--sn-sys-on-surface);
    font: inherit;
    font-weight: 700;
  }

  .sn-media-studio-action-button:disabled {
    opacity: 0.48;
  }

  .sn-media-studio-action-button.is-compact {
    min-block-size: 26px;
    padding: 3px 8px;
    font-size: calc(11px * var(--sn-theme-type-scale, 1));
  }

  .sn-media-studio-voice-list {
    display: grid;
    gap: calc(8px * var(--sn-theme-density, 1));
    min-width: 0;
  }

  .sn-media-studio-voice-provider {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
    color: var(--sn-sys-on-surface-dim);
    font-size: calc(12px * var(--sn-theme-type-scale, 1));
  }

  .sn-media-studio-voice-row {
    display: grid;
    grid-template-columns: minmax(70px, 0.32fr) minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    min-width: 0;
  }

  .sn-media-studio-voice-persona,
  .sn-media-studio-voice-provider strong {
    min-width: 0;
    overflow: hidden;
    color: var(--sn-sys-on-surface);
    font-size: calc(12px * var(--sn-theme-type-scale, 1));
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sn-media-studio-voice-clips {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .sn-media-studio-voice-clip {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    min-width: 0;
    color: var(--sn-sys-on-surface-dim);
    font-size: calc(11px * var(--sn-theme-type-scale, 1));
  }

  .sn-media-studio-voice-clip span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sn-media-studio-field-row {
    display: grid;
    grid-template-columns: minmax(80px, 0.48fr) minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    min-width: 0;
    color: var(--sn-sys-on-surface-dim);
    font-size: calc(12px * var(--sn-theme-type-scale, 1));
  }

  .sn-media-studio-field-value {
    min-width: 0;
    padding: 5px 8px;
    border: 1px solid color-mix(in srgb, var(--sn-sys-on-surface) 8%, transparent);
    border-radius: calc(var(--sn-node-radius, 0px) + 2px);
    background: color-mix(in srgb, black 18%, transparent);
    color: var(--sn-sys-on-surface);
    font-family: var(--sn-font-mono, monospace);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sn-media-studio-progress-shell sn-description-list {
    grid-column: 1 / -1;
    --sn-description-list-columns: minmax(min(9ch, 34%), max-content) minmax(0, 1fr);
  }

  .sn-media-studio-progress-shell sn-metric {
    --sn-metric-value-color: var(--sn-media-studio-progress-color, var(--sn-sys-accent));
  }

  .sn-media-studio-progress-failures {
    grid-column: 1 / -1;
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .sn-media-studio-progress-failure {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    min-width: 0;
    padding: 7px 8px;
    border: 1px solid color-mix(in srgb, var(--sn-sys-error, #ff6b6b) 38%, transparent);
    background: color-mix(in srgb, var(--sn-sys-error, #ff6b6b) 12%, transparent);
    color: var(--sn-sys-on-surface);
    font-size: calc(12px * var(--sn-theme-type-scale, 1));
  }

  .sn-media-studio-progress-failure-text {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .sn-media-studio-progress-failure-stage,
  .sn-media-studio-progress-failure-message {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sn-media-studio-progress-failure-stage {
    font-weight: 700;
  }

  .sn-media-studio-progress-failure-message {
    color: var(--sn-sys-on-surface-dim);
  }

`;

const MEDIA_STUDIO_PANEL_BEHAVIORS = Object.freeze({
  root: normalizeLayoutBehavior({
    importance: 100,
    minInlineSize: 640,
    minBlockSize: 420,
    collapse: 'never',
    overflow: 'scroll',
    responsiveMode: 'drawer',
    responsiveBreakpoint: 760,
    mobileDock: 'primary',
    swipeControl: 'edge',
  }),
  row: normalizeLayoutBehavior({
    importance: 90,
    minInlineSize: 480,
    minBlockSize: 260,
    collapse: 'never',
    overflow: 'scroll-inline',
    responsiveMode: 'drawer',
    responsiveBreakpoint: 760,
    mobileDock: 'primary',
  }),
  preview: normalizeLayoutBehavior({
    importance: 100,
    minInlineSize: 420,
    minBlockSize: 240,
    collapse: 'never',
    overflow: 'scroll',
    responsiveMode: 'preserve',
    mobileDock: 'primary',
  }),
  side: normalizeLayoutBehavior({
    importance: 42,
    minInlineSize: 260,
    minBlockSize: 220,
    collapse: 'manual',
    overflow: 'scroll',
    responsiveMode: 'drawer',
    mobileDock: 'start',
    drawerHoverOpen: true,
  }),
  timeline: normalizeLayoutBehavior({
    importance: 78,
    minInlineSize: 420,
    minBlockSize: 132,
    collapse: 'manual',
    overflow: 'scroll-inline',
    responsiveMode: 'stack',
    mobileDock: 'end',
  }),
});

const DEFAULT_PANEL_TITLES = Object.freeze({
  [MEDIA_STUDIO_PANEL_TYPES.source]: 'Source',
  [MEDIA_STUDIO_PANEL_TYPES.preview]: 'Preview',
  [MEDIA_STUDIO_PANEL_TYPES.inspector]: 'Inspector',
  [MEDIA_STUDIO_PANEL_TYPES.timeline]: 'Timeline',
});

const DEFAULT_PANEL_ICONS = Object.freeze({
  [MEDIA_STUDIO_PANEL_TYPES.source]: 'input',
  [MEDIA_STUDIO_PANEL_TYPES.preview]: 'smart_display',
  [MEDIA_STUDIO_PANEL_TYPES.inspector]: 'tune',
  [MEDIA_STUDIO_PANEL_TYPES.timeline]: 'view_timeline',
});

export const MEDIA_FRAME_SOURCE_PROVIDER_METADATA = Object.freeze([
  Object.freeze({
    id: MEDIA_STUDIO_FRAME_SOURCE_TYPES.virtualSequence,
    label: 'Virtual sequence',
    status: 'draft',
    runtime: 'browser-api',
    schemaVersion: WORKSPACE_VIRTUAL_SEQUENCE_SCHEMA,
    sourceKinds: [WORKSPACE_VIRTUAL_SEQUENCE_SCHEMA, 'playback-proxy', 'scrub-proxy'],
    outputKinds: ['html-video-playback', 'scrub-proxy', 'precision-frame'],
    capabilities: [
      'html-video-playback',
      'request-video-frame-callback',
      'bounded-precision-decode',
      'scrub-proxy',
      'sprite-thumbnails',
      'keyframe-index',
      'partial-rerender',
    ],
    supportKey: 'virtualSequence',
    fallback: {
      state: MEDIA_PREVIEW_STATES.waiting,
      reason: 'missing-virtual-sequence',
    },
  }),
  Object.freeze({
    id: MEDIA_STUDIO_FRAME_SOURCE_TYPES.externalBrowser,
    label: 'External browser frames',
    status: 'service-required',
    runtime: 'external-service',
    sourceKinds: ['url', 'route', 'workspace-surface'],
    outputKinds: ['frame-stream', 'cached-sequence', 'progress'],
    capabilities: ['real-browser-pixels', 'shadow-dom', 'canvas', 'css-animation', 'overlay-capture'],
    supportKey: 'externalBrowserFrameSource',
    fallback: {
      state: MEDIA_PREVIEW_STATES.unsupported,
      reason: 'missing-frame-source-service',
    },
  }),
  Object.freeze({
    id: MEDIA_STUDIO_FRAME_SOURCE_TYPES.elementCapture,
    label: 'Element Capture',
    status: 'experimental',
    runtime: 'browser-api',
    sourceKinds: ['element'],
    outputKinds: ['media-stream'],
    capabilities: ['live-preview', 'element-subtree-capture', 'user-mediated-capture'],
    supportKey: 'elementCapture',
    fallback: {
      state: MEDIA_PREVIEW_STATES.unsupported,
      reason: 'element-capture-unavailable',
    },
  }),
  Object.freeze({
    id: MEDIA_STUDIO_FRAME_SOURCE_TYPES.regionCapture,
    label: 'Region Capture',
    status: 'experimental',
    runtime: 'browser-api',
    sourceKinds: ['element-bounds', 'current-tab'],
    outputKinds: ['media-stream'],
    capabilities: ['live-preview', 'cropped-tab-capture', 'user-mediated-capture'],
    supportKey: 'regionCapture',
    fallback: {
      state: MEDIA_PREVIEW_STATES.unsupported,
      reason: 'region-capture-unavailable',
    },
  }),
  Object.freeze({
    id: MEDIA_STUDIO_FRAME_SOURCE_TYPES.htmlInCanvas,
    label: 'HTML in Canvas',
    status: HTML_IN_CANVAS_RENDERER.status,
    runtime: 'browser-api',
    sourceKinds: ['element', 'canvas'],
    outputKinds: ['canvas-frame', 'texture'],
    capabilities: HTML_IN_CANVAS_RENDERER.capabilities,
    supportKey: 'htmlInCanvas',
    fallback: {
      state: MEDIA_PREVIEW_STATES.unsupported,
      reason: 'html-in-canvas-unavailable',
    },
  }),
  Object.freeze({
    id: MEDIA_STUDIO_FRAME_SOURCE_TYPES.cachedSequence,
    label: 'Bitmap preview cache',
    status: 'draft',
    runtime: 'library',
    sourceKinds: ['sprite-sheet', 'thumbnail', 'scrub-proxy-frame'],
    outputKinds: ['sprite-preview', 'thumbnail-preview', 'filmstrip'],
    capabilities: ['bounded-bitmap-window', 'sprite-preview', 'thumbnail', 'filmstrip'],
    supportKey: 'cachedSequence',
    fallback: {
      state: MEDIA_PREVIEW_STATES.empty,
      reason: 'missing-bitmap-preview',
    },
  }),
  Object.freeze({
    id: MEDIA_STUDIO_FRAME_SOURCE_TYPES.mediaStream,
    label: 'MediaStream',
    status: 'draft',
    runtime: 'browser-api',
    sourceKinds: ['media-stream', 'display-media'],
    outputKinds: ['live-preview'],
    capabilities: ['live-preview', 'user-mediated-capture'],
    supportKey: 'displayMedia',
    fallback: {
      state: MEDIA_PREVIEW_STATES.unsupported,
      reason: 'display-media-unavailable',
    },
  }),
]);

export const MEDIA_STUDIO_SURFACE_CONTRACT = Object.freeze({
  name: 'media-studio-surface',
  specifier: 'symbiote-ui/ui',
  status: 'draft',
  schemaVersion: 'media-studio-surface-v1',
  topology: {
    preview: 'center',
    timeline: 'bottom',
    sidePanes: ['source', 'inspector'],
    sidePaneDefault: { source: 'collapsed', inspector: 'expanded' },
  },
  panelTypes: MEDIA_STUDIO_PANEL_TYPES,
  frameSourceTypes: MEDIA_STUDIO_FRAME_SOURCE_TYPES,
  capabilities: [
    'nle-editor-topology',
    'central-preview',
    'bottom-timeline',
    'collapsible-side-panes',
    'expanded-inspector',
    'replaceable-frame-sources',
    'preview-fallback-state',
    'virtual-sequence-projection',
    'html-video-playback',
    'bounded-precision-decode',
  ],
  primaryPlayback: {
    frameSource: MEDIA_STUDIO_FRAME_SOURCE_TYPES.virtualSequence,
    schemaVersion: WORKSPACE_VIRTUAL_SEQUENCE_SCHEMA,
    playback: 'html-video',
    frameClock: 'request-video-frame-callback',
    precisionDecode: 'bounded-webcodecs',
  },
  parts: MEDIA_STUDIO_CSS_PARTS,
  themeAliases: MEDIA_STUDIO_STYLE_TOKENS,
});

function clonePlain(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clonePlain);
  return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, clonePlain(val)]));
}

function finiteNumber(value, fallback, min = -Infinity, max = Infinity) {
  let number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function cleanText(value, fallback = '') {
  let text = String(value ?? '').trim();
  return text ? text : fallback;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function globalDocument() {
  return typeof document !== 'undefined' ? document : null;
}

function panelTitle(panelType, options = {}) {
  let titles = options.titles && typeof options.titles === 'object' ? options.titles : {};
  return cleanText(titles[panelType], DEFAULT_PANEL_TITLES[panelType] || panelType);
}

function createMediaPanel(panelType, options = {}) {
  let state = {
    region: options.region || panelType,
    title: panelTitle(panelType, options),
    icon: DEFAULT_PANEL_ICONS[panelType] || 'dashboard',
    ...clonePlain(options.panelState || {}),
  };
  let panel = createPanel(panelType, state, options.behavior);
  panel.collapsed = Boolean(options.collapsed);
  if (options.id) panel.id = String(options.id);
  return panel;
}

function containsPanelType(node, panelType) {
  if (!node) return false;
  if (node.type === 'panel') return node.panelType === panelType;
  return containsPanelType(node.first, panelType) || containsPanelType(node.second, panelType);
}

function collectPanels(node, panels = []) {
  if (!node) return panels;
  if (node.type === 'panel') {
    panels.push(node);
    return panels;
  }
  collectPanels(node.first, panels);
  collectPanels(node.second, panels);
  return panels;
}

function panelConfig(panelType, behavior, options = {}) {
  return {
    title: panelTitle(panelType, options),
    icon: DEFAULT_PANEL_ICONS[panelType] || 'dashboard',
    region: options.region || panelType,
    collapsible: behavior.collapse !== 'never',
    behavior: clonePlain(behavior),
  };
}

export function createMediaStudioPanelTypes(options = {}) {
  return {
    [MEDIA_STUDIO_PANEL_TYPES.source]: panelConfig(MEDIA_STUDIO_PANEL_TYPES.source, MEDIA_STUDIO_PANEL_BEHAVIORS.side, {
      ...options,
      region: 'start',
    }),
    [MEDIA_STUDIO_PANEL_TYPES.preview]: panelConfig(MEDIA_STUDIO_PANEL_TYPES.preview, MEDIA_STUDIO_PANEL_BEHAVIORS.preview, {
      ...options,
      region: 'center',
    }),
    [MEDIA_STUDIO_PANEL_TYPES.inspector]: panelConfig(MEDIA_STUDIO_PANEL_TYPES.inspector, MEDIA_STUDIO_PANEL_BEHAVIORS.side, {
      ...options,
      region: 'end',
    }),
    [MEDIA_STUDIO_PANEL_TYPES.timeline]: panelConfig(MEDIA_STUDIO_PANEL_TYPES.timeline, MEDIA_STUDIO_PANEL_BEHAVIORS.timeline, {
      ...options,
      region: 'bottom',
    }),
  };
}

export function createMediaStudioLayout(options = {}) {
  let ids = options.ids && typeof options.ids === 'object' ? options.ids : {};
  let source = createMediaPanel(MEDIA_STUDIO_PANEL_TYPES.source, {
    ...options,
    id: ids.source,
    region: 'start',
    behavior: MEDIA_STUDIO_PANEL_BEHAVIORS.side,
    collapsed: options.sourceCollapsed ?? true,
  });
  let preview = createMediaPanel(MEDIA_STUDIO_PANEL_TYPES.preview, {
    ...options,
    id: ids.preview,
    region: 'center',
    behavior: MEDIA_STUDIO_PANEL_BEHAVIORS.preview,
  });
  let inspector = createMediaPanel(MEDIA_STUDIO_PANEL_TYPES.inspector, {
    ...options,
    id: ids.inspector,
    region: 'end',
    behavior: MEDIA_STUDIO_PANEL_BEHAVIORS.side,
    collapsed: options.inspectorCollapsed ?? false,
  });
  let timeline = createMediaPanel(MEDIA_STUDIO_PANEL_TYPES.timeline, {
    ...options,
    id: ids.timeline,
    region: 'bottom',
    behavior: MEDIA_STUDIO_PANEL_BEHAVIORS.timeline,
    collapsed: options.timelineCollapsed ?? false,
  });

  let previewInspectorRatio = finiteNumber(options.previewInspectorRatio, 0.74, 0.35, 0.92);
  let sourcePreviewRatio = finiteNumber(options.sourcePreviewRatio, 0.16, 0.08, 0.45);
  let previewTimelineRatio = finiteNumber(options.previewTimelineRatio, 0.72, 0.42, 0.88);
  let previewWithInspector = createSplit('horizontal', preview, inspector, previewInspectorRatio, MEDIA_STUDIO_PANEL_BEHAVIORS.row);
  let editorRow = createSplit('horizontal', source, previewWithInspector, sourcePreviewRatio, MEDIA_STUDIO_PANEL_BEHAVIORS.row);
  return createSplit('vertical', editorRow, timeline, previewTimelineRatio, MEDIA_STUDIO_PANEL_BEHAVIORS.root);
}

export function getMediaStudioTopology(layoutTree) {
  let panels = collectPanels(layoutTree);
  let panelTypes = panels.map((panel) => panel.panelType);
  let source = panels.find((panel) => panel.panelType === MEDIA_STUDIO_PANEL_TYPES.source);
  let preview = panels.find((panel) => panel.panelType === MEDIA_STUDIO_PANEL_TYPES.preview);
  let inspector = panels.find((panel) => panel.panelType === MEDIA_STUDIO_PANEL_TYPES.inspector);
  let timeline = panels.find((panel) => panel.panelType === MEDIA_STUDIO_PANEL_TYPES.timeline);
  let timelineIsBottom = layoutTree?.type === 'split' &&
    layoutTree.direction === 'vertical' &&
    containsPanelType(layoutTree.second, MEDIA_STUDIO_PANEL_TYPES.timeline);
  let previewIsCentral = layoutTree?.type === 'split' &&
    containsPanelType(layoutTree.first, MEDIA_STUDIO_PANEL_TYPES.preview);
  let sidePanes = [source, inspector].filter(Boolean);
  let sidePanesCollapsible = sidePanes.every((panel) => panel.behavior?.collapse !== 'never');
  let sidePanesCollapsed = sidePanes.every((panel) => panel.collapsed === true);
  let sourceCollapsed = source?.collapsed === true;
  let inspectorExpanded = inspector?.collapsed !== true;

  return {
    panelTypes,
    previewPanelId: preview?.id || null,
    timelinePanelId: timeline?.id || null,
    sourcePanelId: source?.id || null,
    inspectorPanelId: inspector?.id || null,
    previewIsCentral,
    timelineIsBottom,
    sidePanesCollapsed,
    sourceCollapsed,
    inspectorExpanded,
    sidePanesCollapsible,
    behaviorMetadata: layoutHasBehaviorMetadata(layoutTree),
    valid: Boolean(preview && timeline && timelineIsBottom && previewIsCentral && sidePanesCollapsible),
  };
}

export function hasMediaStudioTopology(layoutTree) {
  return getMediaStudioTopology(layoutTree).valid;
}

function getTarget(options = {}) {
  return options.globalThis || options.target || globalThis;
}

function hasFn(source, name) {
  return typeof source?.[name] === 'function';
}

function hasDisplayMedia(target, options = {}) {
  let navigatorRef = options.navigator || target?.navigator;
  return hasFn(navigatorRef?.mediaDevices, 'getDisplayMedia');
}

function hasRegionCapture(target, options = {}) {
  let CropTarget = options.CropTarget || target?.CropTarget;
  let Track = options.MediaStreamTrack || target?.MediaStreamTrack;
  return hasFn(CropTarget, 'fromElement') && hasFn(Track?.prototype, 'cropTo');
}

function hasElementCapture(target, options = {}) {
  let RestrictionTarget = options.RestrictionTarget || target?.RestrictionTarget;
  let Track = options.MediaStreamTrack || target?.MediaStreamTrack;
  return hasFn(RestrictionTarget, 'fromElement') && hasFn(Track?.prototype, 'restrictTo');
}

function hasVideoFrameCallback(target, options = {}) {
  let VideoElement = options.HTMLVideoElement || target?.HTMLVideoElement;
  return hasFn(VideoElement?.prototype, 'requestVideoFrameCallback')
    && hasFn(VideoElement?.prototype, 'cancelVideoFrameCallback');
}

export function getMediaFrameSourceSupport(options = {}) {
  let target = getTarget(options);
  let htmlInCanvas = getHtmlInCanvasSupport(target);
  let cachedSequence = Boolean(options.cachedSequence || options.frameCache || options.sequenceCache || options.cachedFrames);
  let precisionVideoDecode = getPrecisionVideoDecodeSupport({
    VideoDecoder: options.VideoDecoder || target?.VideoDecoder,
    EncodedVideoChunk: options.EncodedVideoChunk || target?.EncodedVideoChunk,
    secureContext: options.secureContext ?? target?.isSecureContext,
  });
  // Virtual-sequence playback is HTML video + requestVideoFrameCallback; report it
  // from the actual video-frame-callback surface. Precision WebCodecs is separate.
  let virtualSequence = typeof options.virtualSequence === 'boolean'
    ? options.virtualSequence
    : hasVideoFrameCallback(target, options);
  return {
    virtualSequence,
    externalBrowserFrameSource: Boolean(options.externalBrowserFrameSource || options.browserFrameSourceService),
    displayMedia: hasDisplayMedia(target, options),
    elementCapture: hasElementCapture(target, options),
    regionCapture: hasRegionCapture(target, options),
    htmlInCanvas: Boolean(htmlInCanvas.supported),
    cachedSequence,
    precisionVideoDecode: precisionVideoDecode.supported,
    htmlInCanvasDetail: htmlInCanvas,
    precisionVideoDecodeDetail: precisionVideoDecode,
  };
}

export { WORKSPACE_VIRTUAL_SEQUENCE_SCHEMA };

/**
 * @param {object} sequence A producer-validated `workspace-virtual-sequence-v1` artifact.
 * @param {{ resolvePath: (path: string) => string }} options
 * @returns {ReturnType<typeof createVirtualSequenceProjection>}
 */
export function createMediaStudioVirtualSequence(sequence, options = {}) {
  return createVirtualSequenceProjection(sequence, options);
}

export function getMediaFrameSourceProvider(providerId) {
  let id = cleanText(providerId);
  return MEDIA_FRAME_SOURCE_PROVIDER_METADATA.find((provider) => provider.id === id) || null;
}

export function listMediaFrameSourceProviders(options = {}) {
  let support = options.support && typeof options.support === 'object'
    ? options.support
    : getMediaFrameSourceSupport(options);
  return MEDIA_FRAME_SOURCE_PROVIDER_METADATA.map((provider) => {
    let supported = Boolean(support[provider.supportKey]);
    return {
      ...clonePlain(provider),
      supported,
      fallback: supported ? null : clonePlain(provider.fallback),
    };
  });
}

export function normalizeMediaFrameSource(source = {}, options = {}) {
  let input = source && typeof source === 'object' ? source : {};
  let providerId = cleanText(
    input.providerId || input.provider || input.type || input.id,
    MEDIA_STUDIO_FRAME_SOURCE_TYPES.virtualSequence
  );
  let provider = getMediaFrameSourceProvider(providerId) ||
    getMediaFrameSourceProvider(MEDIA_STUDIO_FRAME_SOURCE_TYPES.virtualSequence);
  let providerState = listMediaFrameSourceProviders(options).find((item) => item.id === provider.id);
  let status = cleanText(input.status, providerState.supported ? 'ready' : 'unavailable');

  return {
    id: cleanText(input.id, provider.id),
    providerId: provider.id,
    label: cleanText(input.label, provider.label),
    status,
    source: input.source || input.url || input.route || input.surfaceId || null,
    target: input.target || input.element || input.region || null,
    cacheKey: input.cacheKey || input.sequenceId || null,
    playbackUrl: cleanText(input.playbackUrl || input.playbackProxyUrl || input.playback?.url, ''),
    outputUrl: cleanText(input.outputUrl || input.output?.url || input.videoUrl, ''),
    output: input.output && typeof input.output === 'object' ? clonePlain(input.output) : null,
    captionsUrl: cleanText(input.captionsUrl || input.captions?.url, ''),
    progress: normalizeMediaProgress(input.progress),
    provider: providerState,
    capabilities: [...provider.capabilities],
    fallback: status === 'unavailable' || !providerState.supported ? clonePlain(providerState.fallback) : null,
  };
}

function normalizeMediaProgress(value) {
  if (value === undefined || value === null || value === '') return null;
  let number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number > 1) number = number / 100;
  return Math.min(1, Math.max(0, number));
}

function hasRenderablePreview(input, frameSource = null) {
  return Boolean(
    input.playbackUrl ||
    input.playbackProxyUrl ||
    input.videoUrl ||
    input.outputUrl ||
    input.output?.url ||
    input.src ||
    input.url ||
    input.blob ||
    input.stream ||
    input.currentFrame ||
    input.frame ||
    (Array.isArray(input.frames) && input.frames.length) ||
    frameSource?.playbackUrl ||
    frameSource?.outputUrl ||
    frameSource?.output?.url
  );
}

export function normalizeMediaPreviewState(preview = {}, options = {}) {
  let input = preview && typeof preview === 'object' ? preview : {};
  let frameSource = input.frameSource
    ? normalizeMediaFrameSource(input.frameSource, options)
    : null;
  let status = cleanText(input.status || frameSource?.status);
  let progress = normalizeMediaProgress(input.progress ?? frameSource?.progress);

  if (input.error || status === MEDIA_PREVIEW_STATES.error) {
    return {
      state: MEDIA_PREVIEW_STATES.error,
      reason: cleanText(input.reason, 'preview-error'),
      error: input.error || null,
      progress,
      fallback: {
        state: MEDIA_PREVIEW_STATES.error,
        reason: cleanText(input.reason, 'preview-error'),
      },
    };
  }

  if (frameSource?.fallback && (status === 'unavailable' || status === MEDIA_PREVIEW_STATES.unsupported || !hasRenderablePreview(input, frameSource))) {
    return {
      state: frameSource.fallback.state,
      reason: frameSource.fallback.reason,
      frameSource,
      progress,
      fallback: clonePlain(frameSource.fallback),
    };
  }

  if (['queued', 'loading', 'capturing', 'rendering', 'buffering'].includes(status)) {
    return {
      state: MEDIA_PREVIEW_STATES.loading,
      reason: status,
      frameSource,
      progress,
      fallback: null,
    };
  }

  if (hasRenderablePreview(input, frameSource)) {
    let hasVideo = Boolean(
      input.playbackUrl || input.playbackProxyUrl || input.videoUrl || input.outputUrl || input.output?.url ||
      frameSource?.playbackUrl || frameSource?.outputUrl || frameSource?.output?.url
    );
    let hasFrames = Array.isArray(input.frames) && input.frames.length;
    return {
      state: MEDIA_PREVIEW_STATES.ready,
      reason: hasVideo ? 'video-ready' : hasFrames ? 'bitmap-preview-ready' : 'preview-ready',
      mode: hasVideo ? 'live' : hasFrames ? MEDIA_STUDIO_FRAME_SOURCE_TYPES.cachedSequence : 'live',
      frameSource,
      progress: progress ?? 1,
      fallback: null,
    };
  }

  if (frameSource) {
    return {
      state: MEDIA_PREVIEW_STATES.waiting,
      reason: 'waiting-for-frames',
      frameSource,
      progress,
      fallback: {
        state: MEDIA_PREVIEW_STATES.waiting,
        reason: 'waiting-for-frames',
      },
    };
  }

  return {
    state: MEDIA_PREVIEW_STATES.empty,
    reason: 'missing-source',
    frameSource: null,
    progress,
    fallback: {
      state: MEDIA_PREVIEW_STATES.empty,
      reason: 'missing-source',
    },
  };
}

export function ensureMediaStudioSurfaceStyles(target = globalDocument()) {
  let doc = target?.ownerDocument || target;
  if (!doc?.createElement || !doc?.head) return null;
  let existing = doc.head.querySelector?.('style[data-symbiote-ui="media-studio-surface"]');
  if (existing) return existing;
  let style = doc.createElement('style');
  style.setAttribute('data-symbiote-ui', 'media-studio-surface');
  style.textContent = MEDIA_STUDIO_SURFACE_STYLES;
  doc.head.appendChild(style);
  return style;
}

function firstFrameUrl(input = {}) {
  let frame = input.currentFrame || input.frame || (Array.isArray(input.frames) ? input.frames[0] : null);
  if (typeof frame === 'string') return frame;
  return frame?.url || frame?.src || frame?.href || input.src || input.url || '';
}

function previewPlaybackProxyUrl(input = {}, frameSource = null) {
  return cleanText(input.playbackUrl || input.playbackProxyUrl || input.playback?.url || frameSource?.playbackUrl, '');
}

function previewFinalOutputUrl(input = {}, frameSource = null) {
  return cleanText(
    input.videoUrl ||
    input.outputUrl ||
    input.output?.url ||
    frameSource?.outputUrl ||
    frameSource?.output?.url,
    ''
  );
}

function normalizeMediaStudioPreviewMode(value, fallback = '') {
  let text = cleanText(value, '').toLowerCase();
  if (
    text === MEDIA_STUDIO_PREVIEW_MODES.sequence ||
    text === MEDIA_STUDIO_FRAME_SOURCE_TYPES.cachedSequence ||
    text === 'image' || text === 'sprite' || text === 'thumbnail' || text === 'filmstrip'
  ) {
    return MEDIA_STUDIO_PREVIEW_MODES.sequence;
  }
  if (text === MEDIA_STUDIO_PREVIEW_MODES.output || text === 'final' || text === 'video' || text === 'playback') {
    return MEDIA_STUDIO_PREVIEW_MODES.output;
  }
  return fallback;
}

// Locked primary path: prefer encoded video whenever a virtual-sequence/video URL
// exists. An image is used only on an explicit sequence/sprite/thumbnail request
// or when no video URL is available.
function resolveMediaStudioPreviewMode(input = {}, frameUrl = '', videoUrl = '', previewState = {}) {
  let requested = normalizeMediaStudioPreviewMode(
    input.previewMode || input.mode || input.viewMode || input.previewSource,
    ''
  );
  if (requested === MEDIA_STUDIO_PREVIEW_MODES.sequence && frameUrl) return MEDIA_STUDIO_PREVIEW_MODES.sequence;
  if (requested === MEDIA_STUDIO_PREVIEW_MODES.output && videoUrl) return MEDIA_STUDIO_PREVIEW_MODES.output;
  if (videoUrl) return MEDIA_STUDIO_PREVIEW_MODES.output;
  if (frameUrl) return MEDIA_STUDIO_PREVIEW_MODES.sequence;
  return normalizeMediaStudioPreviewMode(previewState.mode, MEDIA_STUDIO_PREVIEW_MODES.sequence);
}

function captionWordState(word = {}, currentTimeSec = 0) {
  if (!Number.isFinite(word.startSec) || !Number.isFinite(word.endSec)) return 'plain';
  if (currentTimeSec < word.startSec) return 'future';
  if (currentTimeSec < word.endSec) return 'active';
  return 'past';
}

function mediaStudioCaptionTrack(options = {}, preview = {}) {
  let candidate = preview.captionTrack
    || options.captionTrack
    || options.frameSource?.captionTrack
    || null;
  if (!candidate) return null;
  return assertCaptionPlacementTrack(candidate);
}

function normalizedCaptionToken(value) {
  return String(value || '')
    .toLocaleLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

export function normalizeMediaStudioCaptionOverlayState(options = {}) {
  let preview = options.preview && typeof options.preview === 'object' ? options.preview : {};
  let renderSettings = normalizeMediaStudioRenderSettings(options);
  let track = mediaStudioCaptionTrack(options, preview);
  let currentTimeSec = finiteNumber(
    preview.currentTimeSec ?? preview.timeSec ?? options.currentTimeSec ?? options.timeSec,
    finiteNumber(preview.currentTimeMs ?? options.currentTimeMs, 0, 0) / 1000,
    0
  );
  let activeCues = (track?.cues || [])
    .filter((cue) => currentTimeSec >= cue.startSec && currentTimeSec < cue.endSec)
    .map((cue) => ({
      ...cue,
      wordEntries: cue.wordTimings.map((word) => ({
        ...word,
        state: captionWordState(word, currentTimeSec),
      })),
    }));
  let enabled = renderSettings.captionsEnabled !== false && renderSettings.captionsMode !== 'off';
  return {
    enabled: enabled && activeCues.length > 0,
    currentTimeSec,
    activeCues,
    track,
    profile: track?.profile || null,
  };
}

export function renderMediaStudioCaptionLineMarkup(cue = {}, options = {}) {
  let currentTimeSec = finiteNumber(options.currentTimeSec ?? options.timeSec, 0, 0);
  if (!Array.isArray(cue.wrappedLines) || !cue.wrappedLines.length || !Array.isArray(cue.wordTimings)) {
    throw new TypeError('media studio caption markup requires an engine placement cue');
  }
  let timingIndex = 0;
  let tokenIndex = 0;
  return cue.wrappedLines.map((lineText) => {
    let tokens = String(lineText).split(/\s+/).filter(Boolean);
    let markup = tokens.map((token) => {
      let timing = cue.wordTimings[timingIndex];
      let matches = timing
        && normalizedCaptionToken(timing.text) === normalizedCaptionToken(token);
      let state = matches ? captionWordState(timing, currentTimeSec) : 'plain';
      if (matches) timingIndex += 1;
      let index = tokenIndex;
      tokenIndex += 1;
      return `<span class="sn-media-studio-caption-word"`
        + ` data-caption-word-index="${index}"`
        + ` data-caption-word-state="${state}">${escapeHtml(token)}</span>`;
    }).join(' ');
    return `<span class="sn-media-studio-caption-row">${markup}</span>`;
  }).join('');
}

function frameCount(input = {}) {
  if (Array.isArray(input.frames)) return input.frames.length;
  let count = Number(input.frameCount || input.cacheFrameCount || input.manifest?.frameCount);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function percentLabel(progress) {
  let value = normalizeMediaProgress(progress);
  if (value === null) return 'ready';
  return `${Math.round(value * 100)}%`;
}

function boolSetting(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  let text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(text)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(text)) return false;
  return fallback;
}

function positiveIntegerSetting(value, fallback, min = 1, max = 16384) {
  let number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function canonicalCaptionChoice(value, fallback, choices, label) {
  let choice = cleanText(value, fallback).toLowerCase();
  if (choices.includes(choice)) return choice;
  throw new TypeError(
    `${label} must be a canonical caption value. Supported: ${choices.join(', ')}.`,
  );
}

function assertCanonicalCaptionSettings(...sources) {
  for (let source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (let name of NON_CANONICAL_CAPTION_SETTINGS) {
      if (Object.prototype.hasOwnProperty.call(source, name)) {
        throw new TypeError(
          `${name} is not a canonical caption setting. Use captionStyle profile fields instead.`,
        );
      }
    }
  }
}

function normalizeCaptionPreferredZones(value) {
  if (!Array.isArray(value) || !value.length) {
    throw new TypeError(
      `captionStyle.preferredZones must contain: ${MEDIA_STUDIO_CAPTION_PLACEMENTS.join(', ')}.`,
    );
  }
  let zones = value.map((zone) => canonicalCaptionChoice(
    zone,
    '',
    MEDIA_STUDIO_CAPTION_PLACEMENTS,
    'captionStyle.preferredZones entry',
  ));
  if (new Set(zones).size !== zones.length) {
    throw new TypeError('captionStyle.preferredZones must not contain duplicates.');
  }
  return zones;
}

export function normalizeMediaStudioRenderSettings(options = {}) {
  let source = options.renderSettings
    || options.settings
    || options.state?.renderSettings
    || options.state?.settings
    || {};
  assertCanonicalCaptionSettings(source, options);
  let orientationInput = cleanText(source.orientation || options.orientation).toLowerCase();
  let aspectInput = cleanText(source.aspectRatio || options.aspectRatio);
  let vertical = boolSetting(
    source.vertical ?? options.vertical,
    orientationInput === 'vertical' || aspectInput === '9:16',
  );
  let orientation = vertical || orientationInput === 'vertical' ? 'vertical' : 'horizontal';
  let width = positiveIntegerSetting(source.width ?? options.width, orientation === 'vertical' ? 1080 : 1920);
  let height = positiveIntegerSetting(
    source.height ?? options.height,
    orientation === 'vertical' ? 1920 : 1080,
  );
  let rawCaptionStyle = source.captionStyle ?? options.captionStyle ?? {};
  if (!rawCaptionStyle || typeof rawCaptionStyle !== 'object' || Array.isArray(rawCaptionStyle)) {
    throw new TypeError('captionStyle must be a canonical caption profile object.');
  }
  let captionStyle = clonePlain(rawCaptionStyle);
  let captionProfile = canonicalCaptionChoice(
    source.captionProfile ?? options.captionProfile ?? captionStyle.preset,
    orientation === 'vertical' ? 'tiktok' : 'youtube',
    MEDIA_STUDIO_CAPTION_PROFILES,
    'captionProfile',
  );
  let requestedPlacement = source.captionPlacement ?? options.captionPlacement;
  let preferredZones = captionStyle.preferredZones === undefined
    ? null
    : normalizeCaptionPreferredZones(captionStyle.preferredZones);
  let captionPlacement = canonicalCaptionChoice(
    requestedPlacement ?? preferredZones?.[0],
    'bottom',
    MEDIA_STUDIO_CAPTION_PLACEMENTS,
    'captionPlacement',
  );
  if (requestedPlacement !== undefined && preferredZones?.[0] !== captionPlacement) {
    preferredZones = [
      captionPlacement,
      ...MEDIA_STUDIO_CAPTION_PLACEMENTS.filter((zone) => zone !== captionPlacement),
    ];
  }
  captionStyle.preset = captionProfile;
  if (preferredZones) captionStyle.preferredZones = preferredZones;
  let captionsEnabled = boolSetting(
    source.captionsEnabled ?? options.captionsEnabled,
    cleanText(source.captionsMode || options.captionsMode, 'on') !== 'off',
  );
  return {
    autoRender: boolSetting(source.autoRender ?? options.autoRender, true),
    captionsEnabled,
    captionsMode: cleanText(
      source.captionsMode || options.captionsMode,
      captionsEnabled ? 'on' : 'off',
    ),
    orientation,
    aspectRatio: cleanText(
      source.aspectRatio || options.aspectRatio,
      orientation === 'vertical' ? '9:16' : '16:9',
    ),
    width,
    height,
    fps: positiveIntegerSetting(source.fps ?? options.fps, 30, 1, 120),
    providerId: cleanText(
      source.providerId || source.audioProviderId || options.providerId || options.audioProviderId,
    ),
    voiceRefs: clonePlain(source.voiceRefs || options.voiceRefs || {}),
    outputFormat: cleanText(
      source.outputFormat || source.format || options.outputFormat || options.format,
      'MP4',
    ),
    captionProfile,
    captionPlacement,
    captionStyle,
  };
}

function normalizeAudioProviderOption(input = {}, index = 0) {
  let source = input && typeof input === 'object' ? input : { id: input };
  let id = cleanText(source.id || source.providerId || source.value || source.key, `provider-${index + 1}`);
  return {
    id,
    label: cleanText(source.label || source.name || source.title, id),
    disabled: source.disabled === true || source.available === false,
  };
}

function normalizeMediaStudioAudioProviderOptions(options = {}, selectedProviderId = '') {
  let source = options.audioProviders || options.audioProviderOptions || options.voiceProviders || [];
  let providers = (Array.isArray(source) ? source : [])
    .map(normalizeAudioProviderOption)
    .filter((provider) => provider.id);
  let selected = cleanText(selectedProviderId);
  if (selected && !providers.some((provider) => provider.id === selected)) {
    providers.unshift({ id: selected, label: selected, disabled: false });
  }
  return providers;
}

function normalizeVoiceItem(input = {}, index = 0) {
  let source = input && typeof input === 'object' ? input : { id: input };
  let id = cleanText(source.id || source.voiceRef || source.ref || source.value, `voice-${index + 1}`);
  return {
    id,
    label: cleanText(source.label || source.name || source.title, id),
    persona: cleanText(source.persona || source.role || source.speaker),
    language: cleanText(source.language || source.locale || source.lang),
    disabled: source.disabled === true,
  };
}

function normalizeSpeakerLayer(input = {}, index = 0) {
  let source = input && typeof input === 'object' ? input : {};
  let persona = cleanText(source.persona || source.speaker || source.id, `speaker-${index + 1}`);
  return {
    persona,
    label: cleanText(source.label || source.title, persona),
    voiceRef: cleanText(source.voiceRef || source.voice || source.providerVoiceRef),
    clips: (Array.isArray(source.clips) ? source.clips : []).map((clip = {}, clipIndex) => ({
      id: cleanText(clip.id || clip.turnId || clip.artifactId, `${persona}-${clipIndex + 1}`),
      turnId: cleanText(clip.turnId || clip.id),
      persona: cleanText(clip.persona || source.persona || source.speaker, persona),
      label: cleanText(clip.label || clip.text || clip.title, `segment ${clipIndex + 1}`),
      startMs: finiteNumber(clip.startMs, 0, 0),
      endMs: finiteNumber(clip.endMs, finiteNumber(clip.startMs, 0, 0) + finiteNumber(clip.durationMs, 0, 0), 0),
    })),
  };
}

function normalizePersonaList({ personas = [], layers = [], turns = [], voiceRefs = {} } = {}) {
  let ids = new Set();
  for (let value of personas) {
    let id = cleanText(typeof value === 'string' ? value : value?.id || value?.persona || value?.speaker);
    if (id) ids.add(id);
  }
  for (let layer of layers) if (layer.persona) ids.add(layer.persona);
  for (let turn of Array.isArray(turns) ? turns : []) {
    let id = cleanText(turn?.persona || turn?.speaker || turn?.role);
    if (id) ids.add(id);
  }
  for (let id of Object.keys(voiceRefs || {})) {
    if (cleanText(id)) ids.add(cleanText(id));
  }
  if (!ids.size) ids.add('guide');
  return [...ids].map((persona) => ({
    id: persona,
    label: cleanText(persona).replace(/[-_]+/g, ' '),
  }));
}

export function normalizeMediaStudioVoiceProviderState(options = {}) {
  let renderSettings = normalizeMediaStudioRenderSettings(options);
  let source = options.voiceProvider || options.audioProvider || options.provider || options.state?.voiceProvider || {};
  if (typeof source === 'string') source = { id: source, label: source };
  let voiceRefs = {
    ...(source.voiceRefs && typeof source.voiceRefs === 'object' ? source.voiceRefs : {}),
    ...(renderSettings.voiceRefs && typeof renderSettings.voiceRefs === 'object' ? renderSettings.voiceRefs : {}),
  };
  let voices = (Array.isArray(source.voices) ? source.voices : Array.isArray(options.voices) ? options.voices : [])
    .map(normalizeVoiceItem)
    .filter((voice) => voice.id);
  let layers = (Array.isArray(source.speakerLayers) ? source.speakerLayers : Array.isArray(options.speakerLayers) ? options.speakerLayers : [])
    .map(normalizeSpeakerLayer)
    .filter((layer) => layer.persona);
  for (let layer of layers) {
    if (layer.voiceRef && !voiceRefs[layer.persona]) voiceRefs[layer.persona] = layer.voiceRef;
  }
  let capabilities = Array.isArray(source.capabilities) ? source.capabilities.map((capability) => cleanText(capability)).filter(Boolean) : [];
  let canCreateVoice = source.canCreateVoice === false
    ? false
    : source.canCreateVoice === true ||
      capabilities.includes('voice.create') ||
      capabilities.includes('voice.clone');
  return {
    providerId: cleanText(source.providerId || source.id || renderSettings.providerId),
    label: cleanText(source.label || source.name || renderSettings.providerId, renderSettings.providerId || 'audio provider'),
    status: cleanText(source.status, renderSettings.providerId ? 'ready' : 'unavailable'),
    canCreateVoice,
    capabilities,
    voiceRefs,
    voices,
    personas: normalizePersonaList({
      personas: source.personas || options.personas,
      layers,
      turns: options.turns || options.state?.turns,
      voiceRefs,
    }),
    speakerLayers: layers,
  };
}

function checkedAttr(value) {
  return value ? ' checked' : '';
}

function selectedAttr(value) {
  return value ? ' selected' : '';
}

function renderMediaStudioRenderSettingsControls(options = {}) {
  let settings = normalizeMediaStudioRenderSettings(options);
  let audioProviders = normalizeMediaStudioAudioProviderOptions(options, settings.providerId);
  let canManualRender = options.canManualRender !== false;
  return `
      <section class="sn-media-studio-inspector-section" data-media-render-settings data-auto-render="${settings.autoRender ? 'true' : 'false'}" data-orientation="${escapeHtml(settings.orientation)}">
        <h3 class="sn-media-studio-inspector-heading"><i class="material-symbols-outlined">tune</i> Settings</h3>
        <div class="sn-media-studio-settings-grid">
          <label class="sn-media-studio-setting-row is-toggle">
            <span>Auto render</span>
            <input type="checkbox" data-media-setting="autoRender"${checkedAttr(settings.autoRender)}>
          </label>
          <label class="sn-media-studio-setting-row is-toggle">
            <span>Captions</span>
            <input type="checkbox" data-media-setting="captionsEnabled"${checkedAttr(settings.captionsEnabled)}>
          </label>
          <label class="sn-media-studio-setting-row">
            <span>Caption Profile</span>
            <select class="sn-media-studio-setting-control" data-media-setting="captionProfile">
              <option value="youtube"${selectedAttr(settings.captionProfile === 'youtube')}>YouTube</option>
              <option value="tiktok"${selectedAttr(settings.captionProfile === 'tiktok')}>TikTok</option>
              <option value="square"${selectedAttr(settings.captionProfile === 'square')}>Square</option>
              <option value="live"${selectedAttr(settings.captionProfile === 'live')}>Live</option>
            </select>
          </label>
          <label class="sn-media-studio-setting-row">
            <span>Caption Placement</span>
            <select class="sn-media-studio-setting-control" data-media-setting="captionPlacement">
              <option value="bottom"${selectedAttr(settings.captionPlacement === 'bottom')}>Bottom</option>
              <option value="top"${selectedAttr(settings.captionPlacement === 'top')}>Top</option>
              <option value="middle"${selectedAttr(settings.captionPlacement === 'middle')}>Middle</option>
            </select>
          </label>
          <label class="sn-media-studio-setting-row">
            <span>Orientation</span>
            <select class="sn-media-studio-setting-control" data-media-setting="orientation">
              <option value="horizontal"${selectedAttr(settings.orientation === 'horizontal')}>Horizontal 16:9</option>
              <option value="vertical"${selectedAttr(settings.orientation === 'vertical')}>Vertical 9:16</option>
            </select>
          </label>
          <label class="sn-media-studio-setting-row">
            <span>Width</span>
            <input class="sn-media-studio-setting-control" type="number" min="1" max="16384" step="1" data-media-setting="width" value="${escapeHtml(settings.width)}">
          </label>
          <label class="sn-media-studio-setting-row">
            <span>Height</span>
            <input class="sn-media-studio-setting-control" type="number" min="1" max="16384" step="1" data-media-setting="height" value="${escapeHtml(settings.height)}">
          </label>
          <label class="sn-media-studio-setting-row">
            <span>FPS</span>
            <input class="sn-media-studio-setting-control" type="number" min="1" max="120" step="1" data-media-setting="fps" value="${escapeHtml(settings.fps)}">
          </label>
          <label class="sn-media-studio-setting-row">
            <span>Provider</span>
            ${audioProviders.length ? `
            <select class="sn-media-studio-setting-control" data-media-setting="providerId">
              ${audioProviders.map((provider) => `
              <option value="${escapeHtml(provider.id)}"${selectedAttr(provider.id === settings.providerId)}${provider.disabled ? ' disabled' : ''}>${escapeHtml(provider.label)}</option>`).join('')}
            </select>` : `
            <input class="sn-media-studio-setting-control" type="text" data-media-setting="providerId" value="${escapeHtml(settings.providerId)}">`}
          </label>
          <div class="sn-media-studio-setting-actions">
            <button class="sn-media-studio-action-button" type="button" data-media-action="render-final"${canManualRender ? '' : ' disabled'}>${escapeHtml(settings.outputFormat)} render</button>
          </div>
        </div>
      </section>`;
}

function renderVoiceOptions(voices = [], selectedVoiceRef = '') {
  let selected = cleanText(selectedVoiceRef);
  let options = voices.slice();
  if (selected && !options.some((voice) => voice.id === selected)) {
    options.unshift({ id: selected, label: selected, disabled: false });
  }
  if (!options.length) options.push({ id: '', label: 'No provider voices', disabled: true });
  return options.map((voice) => `
              <option value="${escapeHtml(voice.id)}"${selectedAttr(voice.id === selected)}${voice.disabled ? ' disabled' : ''}>${escapeHtml(voice.label)}</option>`).join('');
}

function clipsForPersona(provider, persona) {
  return provider.speakerLayers
    .filter((layer) => layer.persona === persona)
    .flatMap((layer) => layer.clips || []);
}

function renderMediaStudioVoiceProviderControls(options = {}) {
  let provider = normalizeMediaStudioVoiceProviderState(options);
  if (!provider.providerId && !provider.voices.length && !provider.speakerLayers.length) return '';
  let hasVoices = provider.voices.length > 0;
  return `
      <section class="sn-media-studio-inspector-section" data-media-voice-provider data-provider-id="${escapeHtml(provider.providerId)}" data-provider-status="${escapeHtml(provider.status)}" data-provider-voices="${escapeHtml(provider.voices.length)}">
        <h3 class="sn-media-studio-inspector-heading"><i class="material-symbols-outlined">record_voice_over</i> Voice</h3>
        <div class="sn-media-studio-voice-list">
          <div class="sn-media-studio-voice-provider">
            <strong>${escapeHtml(provider.label)}</strong>
            <span>${escapeHtml(provider.status)}</span>
          </div>
          ${provider.personas.map((persona) => {
            let clips = clipsForPersona(provider, persona.id);
            let selectedVoice = provider.voiceRefs?.[persona.id] || '';
            return `
          <div class="sn-media-studio-voice-row" data-media-voice-persona="${escapeHtml(persona.id)}">
            <span class="sn-media-studio-voice-persona">${escapeHtml(persona.label)}</span>
            <select class="sn-media-studio-setting-control" data-media-voice-ref data-media-voice-persona="${escapeHtml(persona.id)}"${hasVoices ? '' : ' disabled'}>
              ${renderVoiceOptions(provider.voices, selectedVoice)}
            </select>
            <button class="sn-media-studio-action-button is-compact" type="button" data-media-action="rerender-voice" data-media-voice-persona="${escapeHtml(persona.id)}"${clips.length ? '' : ' disabled'}>Rerender</button>
          </div>
          ${clips.length ? `
          <div class="sn-media-studio-voice-clips">
            ${clips.map((clip) => `
            <div class="sn-media-studio-voice-clip" data-media-voice-clip="${escapeHtml(clip.id)}">
              <span>${escapeHtml(clip.label)}</span>
              <button class="sn-media-studio-action-button is-compact" type="button" data-media-action="rerender-voice" data-media-voice-persona="${escapeHtml(persona.id)}" data-media-turn-id="${escapeHtml(clip.turnId || clip.id)}">Rerender</button>
            </div>`).join('')}
          </div>` : ''}`;
          }).join('')}
          <div class="sn-media-studio-setting-actions">
            <button class="sn-media-studio-action-button" type="button" data-media-action="create-voice"${provider.canCreateVoice ? '' : ' disabled'}>Create voice</button>
          </div>
        </div>
      </section>`;
}

function normalizeMediaReadinessState(input = {}) {
  let source = input && typeof input === 'object' ? input : {};
  let expectedFiles = Math.max(0, Math.round(Number(source.expectedFiles || source.expected || 0) || 0));
  let completedFiles = Math.max(0, Math.round(Number(source.completedFiles || source.completed || 0) || 0));
  let progress = normalizeMediaProgress(source.progress ?? (expectedFiles ? completedFiles / expectedFiles : undefined));
  return {
    status: cleanText(source.status, progress === 1 ? 'ready' : 'preparing'),
    stage: cleanText(source.stage || source.stageLabel, 'Preparing files'),
    progress,
    expectedFiles,
    completedFiles: Math.min(completedFiles, expectedFiles || completedFiles),
  };
}

function renderMediaPreparationProgress(options = {}) {
  let readiness = options.readiness || options.renderState || options.preparation || options.state?.renderState;
  if (!readiness || typeof readiness !== 'object') return '';
  let state = normalizeMediaReadinessState(readiness);
  let progress = state.progress ?? 0;
  let percent = Math.round(progress * 100);
  let count = state.expectedFiles > 0
    ? `${state.completedFiles}/${state.expectedFiles} files`
    : percentLabel(state.progress);
  return `
      <div class="sn-media-studio-prep-progress" data-media-prep-progress data-prep-status="${escapeHtml(state.status)}" data-prep-stage="${escapeHtml(state.stage)}" style="--sn-media-studio-prep-progress: ${percent}%">
        <div class="sn-media-studio-prep-progress-meta">
          <span class="sn-media-studio-prep-progress-stage">${escapeHtml(state.stage)}</span>
          <span class="sn-media-studio-prep-progress-count">${escapeHtml(count)} · ${escapeHtml(percentLabel(state.progress))}</span>
        </div>
        <div class="sn-media-studio-prep-progress-track" aria-hidden="true">
          <span class="sn-media-studio-prep-progress-fill"></span>
        </div>
      </div>`;
}

function normalizeMediaStudioFailures(input = []) {
  if (!Array.isArray(input)) return [];
  return input
    .map((failure, index) => {
      if (!failure || typeof failure !== 'object') return null;
      let stage = cleanText(failure.stage || failure.status || failure.id, `failure-${index + 1}`);
      return {
        stage,
        message: cleanText(failure.message || failure.error || failure.reason, 'Render stage failed'),
        recoverable: failure.recoverable !== false,
      };
    })
    .filter(Boolean);
}

function renderMediaStudioFailureRows(failures = []) {
  let rows = normalizeMediaStudioFailures(failures);
  if (!rows.length) return '';
  return `
      <section class="sn-media-studio-progress-failures" data-media-failures>
        ${rows.map((failure) => `
        <div class="sn-media-studio-progress-failure" data-media-failure-stage="${escapeHtml(failure.stage)}" data-media-failure-recoverable="${failure.recoverable ? 'true' : 'false'}">
          <span class="sn-media-studio-progress-failure-text">
            <span class="sn-media-studio-progress-failure-stage">${escapeHtml(failure.stage)}</span>
            <span class="sn-media-studio-progress-failure-message">${escapeHtml(failure.message)}</span>
          </span>
          <button class="sn-media-studio-action-button is-compact" type="button" data-media-action="retry-render-stage" data-media-retry-stage="${escapeHtml(failure.stage)}"${failure.recoverable ? '' : ' disabled'}>Retry</button>
        </div>`).join('')}
      </section>`;
}

function mediaStudioCaptionLineStyle(cue, profile) {
  let rect = cue.measuredRect;
  let pct = (value, total) => `${(value / total) * 100}%`;
  let fontName = cleanText(profile.fontName, 'Arial')
    .replace(/[^A-Za-z0-9 _,-]/g, '') || 'Arial';
  let outline = (100 / profile.height) * 0.75;
  let textShadow = [
    `${outline}cqh 0 ${profile.outlineColor}`,
    `-${outline}cqh 0 ${profile.outlineColor}`,
    `0 ${outline}cqh ${profile.outlineColor}`,
    `0 -${outline}cqh ${profile.outlineColor}`,
  ].join(',');
  return [
    `inset-inline-start:${pct(rect.x, profile.width)}`,
    `inset-block-start:${pct(rect.y, profile.height)}`,
    `inline-size:${pct(rect.width, profile.width)}`,
    `block-size:${pct(rect.height, profile.height)}`,
    `font-family:${fontName}`,
    `font-size:${(profile.fontSize / profile.height) * 100}cqh`,
    `line-height:${(profile.lineHeight / profile.height) * 100}cqh`,
    `color:${profile.primaryColor}`,
    `background:${profile.backColor}`,
    `--sn-media-studio-caption-primary:${profile.primaryColor}`,
    `--sn-media-studio-caption-highlight:${profile.highlightColor}`,
    `text-shadow:${textShadow}`,
  ].join(';');
}

function renderMediaStudioCaptionCueMarkup(cue, state) {
  return '<span class="sn-media-studio-caption-line"'
    + ` data-caption-cue-id="${escapeHtml(cue.cueId)}"`
    + ` data-caption-placement-zone="${escapeHtml(cue.placement.zone)}"`
    + ` style="${mediaStudioCaptionLineStyle(cue, state.profile)}">`
    + renderMediaStudioCaptionLineMarkup(cue, { currentTimeSec: state.currentTimeSec })
    + '</span>';
}

export function renderMediaStudioCaptionOverlayMarkup(options = {}) {
  let state = normalizeMediaStudioCaptionOverlayState(options);
  if (!state.enabled) return '';
  let { activeCues, profile, track } = state;
  let ratio = profile.width / profile.height;
  let canvasStyle = [
    `inline-size:min(100cqw, ${ratio * 100}cqh)`,
    `block-size:min(100cqh, ${(1 / ratio) * 100}cqw)`,
    `aspect-ratio:${profile.width}/${profile.height}`,
  ].join(';');

  return `
          <div class="sn-media-studio-caption-overlay" data-media-caption-overlay
            data-caption-track="${escapeHtml(track.schemaVersion)}"
            data-caption-style="${escapeHtml(profile.preset)}" aria-hidden="true"
            style="${canvasStyle}">
            ${activeCues.map((cue) => renderMediaStudioCaptionCueMarkup(cue, state)).join('')}
          </div>`;
}

function msToFrame(value, fps) {
  return Math.round((Math.max(0, finiteNumber(value, 0)) / 1000) * fps);
}

const DEFAULT_MEDIA_STUDIO_DECODED_WIDTH = 1920;
const DEFAULT_MEDIA_STUDIO_DECODED_HEIGHT = 1080;
const DEFAULT_MEDIA_STUDIO_MAX_DECODED_BYTES = 256 * 1024 * 1024;

function mediaStudioSequenceFrameUrl(frame = {}) {
  return cleanText(
    frame.proxy?.url
      || frame.proxy?.src
      || frame.proxyUrl
      || frame.url
      || frame.src
      || frame.href
      || frame.path,
    '',
  );
}

function mediaStudioSequenceDimensions(options = {}) {
  let manifest = options.manifest && typeof options.manifest === 'object' ? options.manifest : {};
  let proxy = options.proxy
    || options.previewProxy
    || manifest.proxy
    || manifest.previewProxy
    || manifest.preview?.proxy
    || manifest.preview
    || {};
  let width = finiteNumber(
    options.proxyWidth
      ?? options.decodedWidth
      ?? options.frameWidth
      ?? proxy.width
      ?? proxy.frameWidth
      ?? manifest.frameWidth
      ?? manifest.width,
    DEFAULT_MEDIA_STUDIO_DECODED_WIDTH,
    1,
  );
  let height = finiteNumber(
    options.proxyHeight
      ?? options.decodedHeight
      ?? options.frameHeight
      ?? proxy.height
      ?? proxy.frameHeight
      ?? manifest.frameHeight
      ?? manifest.height,
    DEFAULT_MEDIA_STUDIO_DECODED_HEIGHT,
    1,
  );
  return { width: Math.round(width), height: Math.round(height) };
}

function mediaStudioDecodedBytes(width, height) {
  return Math.ceil(Math.max(1, width) * Math.max(1, height) * 4);
}

function normalizeMediaStudioSequenceFrames(frames = [], options = {}) {
  let fallbackDimensions = mediaStudioSequenceDimensions(options);
  return (Array.isArray(frames) ? frames : [])
    .map((frame, index) => {
      let frameIndex = Math.round(finiteNumber(frame?.index ?? frame?.frame ?? frame?.frameNumber, index, 0));
      let url = mediaStudioSequenceFrameUrl(frame);
      let decodedWidth = Math.round(finiteNumber(
        frame?.proxy?.width ?? frame?.proxyWidth ?? frame?.decodedWidth ?? frame?.width,
        fallbackDimensions.width,
        1,
      ));
      let decodedHeight = Math.round(finiteNumber(
        frame?.proxy?.height ?? frame?.proxyHeight ?? frame?.decodedHeight ?? frame?.height,
        fallbackDimensions.height,
        1,
      ));
      return url ? {
        ...frame,
        index: frameIndex,
        url,
        decodedWidth,
        decodedHeight,
        decodedBytes: mediaStudioDecodedBytes(decodedWidth, decodedHeight),
      } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index);
}

function mediaStudioSequenceFrameCount(frames = [], requested = undefined) {
  let maxFrame = frames.reduce((max, frame) => Math.max(max, Math.round(finiteNumber(frame.index, 0))), -1);
  return Math.max(1, Math.round(finiteNumber(requested, Math.max(frames.length, maxFrame + 1), 1)));
}

function mediaStudioSequenceFrameAt(frames = [], frame = 0) {
  if (!frames.length) return null;
  let target = Math.max(0, Math.round(finiteNumber(frame, 0)));
  let exact = frames.find((item) => item.index === target);
  if (exact) return exact;
  let nearest = frames[0];
  let nearestDistance = Math.abs((nearest?.index || 0) - target);
  for (let item of frames.slice(1)) {
    let distance = Math.abs((item?.index || 0) - target);
    if (distance < nearestDistance) {
      nearest = item;
      nearestDistance = distance;
    }
  }
  return nearest || null;
}

export function mediaStudioFrameIndexForTime(timeSec = 0, options = {}) {
  let fps = Math.max(1, Math.round(finiteNumber(options.fps, 30, 1, 240)));
  let frameCount = Math.max(1, Math.round(finiteNumber(options.frameCount ?? options.durationFrames, 1, 1)));
  let rounding = cleanText(options.rounding, 'round');
  let raw = Math.max(0, finiteNumber(timeSec, 0)) * fps;
  let frame = rounding === 'round' ? Math.round(raw) : Math.floor(raw);
  return Math.max(0, Math.min(frame, frameCount - 1));
}

export function normalizeMediaStudioSequencePlaybackState(options = {}) {
  let frames = normalizeMediaStudioSequenceFrames(options.frames, options);
  let fps = Math.max(1, Math.round(finiteNumber(options.fps, 30, 1, 240)));
  let frameCount = mediaStudioSequenceFrameCount(frames, options.frameCount ?? options.durationFrames);
  let currentFrame = mediaStudioFrameIndexForTime(options.currentTimeSec, { fps, frameCount });
  if (options.currentFrame != null) {
    currentFrame = Math.max(0, Math.min(Math.round(finiteNumber(options.currentFrame, currentFrame)), frameCount - 1));
  }
  let preloadBehindSec = finiteNumber(options.preloadBehindSec, 1, 0, 30);
  let preloadAheadSec = finiteNumber(options.preloadAheadSec, 2, 0, 30);
  let defaultCacheSize = Math.ceil(fps * Math.max(1, preloadBehindSec + preloadAheadSec + 1));
  let maxCachedFrames = Math.max(1, Math.round(finiteNumber(options.maxCachedFrames, defaultCacheSize, 1, 600)));
  let maxDecodedBytes = Math.max(1, Math.round(finiteNumber(
    options.maxDecodedBytes,
    DEFAULT_MEDIA_STUDIO_MAX_DECODED_BYTES,
    1,
    Number.MAX_SAFE_INTEGER,
  )));
  return {
    frames,
    fps,
    frameCount,
    durationSec: frameCount / fps,
    currentFrame,
    audioUrl: cleanText(options.audioUrl, ''),
    preloadBehindSec,
    preloadAheadSec,
    maxCachedFrames,
    maxDecodedBytes,
  };
}

function releaseMediaStudioFrame(value) {
  if (!value || typeof value !== 'object') return;
  if ('src' in value) {
    try { value.src = ''; } catch {}
  }
  try { value.close?.(); } catch {}
}

function defaultMediaStudioFrameLoader(frame = {}) {
  let url = mediaStudioSequenceFrameUrl(frame);
  if (!url) return null;
  if (typeof globalThis.fetch === 'function' && typeof globalThis.createImageBitmap === 'function') {
    let controller = typeof globalThis.AbortController === 'function'
      ? new globalThis.AbortController()
      : null;
    let cancelled = false;
    let promise = globalThis.fetch(url, controller ? { signal: controller.signal } : undefined)
      .then((response) => {
        if (response?.ok === false) throw new Error(`Unable to load frame: ${response.status || 'request failed'}`);
        if (typeof response?.blob !== 'function') throw new TypeError('Frame response must provide blob()');
        return response.blob();
      })
      .then((blob) => globalThis.createImageBitmap(blob))
      .then((bitmap) => {
        if (!cancelled) return bitmap;
        releaseMediaStudioFrame(bitmap);
        return null;
      });
    return {
      promise,
      cancel() {
        cancelled = true;
        controller?.abort();
      },
    };
  }
  if (typeof globalThis.Image !== 'function') return url;
  let image = new globalThis.Image();
  let cancelled = false;
  image.decoding = 'async';
  image.src = url;
  let promise = typeof image.decode === 'function'
    ? image.decode().then(() => image)
    : Promise.resolve(image);
  return {
    promise: promise.then((value) => {
      if (cancelled) {
        releaseMediaStudioFrame(value);
        return null;
      }
      return value;
    }),
    cancel() {
      cancelled = true;
      releaseMediaStudioFrame(image);
    },
  };
}

export function createMediaStudioSequenceFrameWindow(options = {}) {
  let state = normalizeMediaStudioSequencePlaybackState(options);
  let cache = new Map();
  let accessSequence = 0;
  let cachedDecodedBytes = 0;
  let reservedDecodedBytes = 0;
  let evictions = 0;
  let loadFrame = typeof options.loadFrame === 'function' ? options.loadFrame : defaultMediaStudioFrameLoader;
  let disposeFrame = typeof options.disposeFrame === 'function' ? options.disposeFrame : releaseMediaStudioFrame;
  let touchRecord = (record) => {
    if (!record) return null;
    record.lastAccess = ++accessSequence;
    return record;
  };
  let diagnostics = () => ({
    cachedFrames: cache.size,
    readyFrames: Array.from(cache.values()).filter((record) => record.status === 'ready').length,
    loadingFrames: Array.from(cache.values()).filter((record) => record.status === 'loading').length,
    cachedDecodedBytes,
    reservedDecodedBytes,
    totalDecodedBytes: cachedDecodedBytes + reservedDecodedBytes,
    evictions,
    maxCachedFrames: state.maxCachedFrames,
    maxDecodedBytes: state.maxDecodedBytes,
  });
  let evictRecord = (record, { count = true, evictedFrames = null } = {}) => {
    if (!record || record.cancelled) return false;
    record.cancelled = true;
    if (record.reservedDecodedBytes > 0) {
      reservedDecodedBytes = Math.max(0, reservedDecodedBytes - record.reservedDecodedBytes);
      record.reservedDecodedBytes = 0;
    }
    if (record.decodedBytes > 0) {
      cachedDecodedBytes = Math.max(0, cachedDecodedBytes - record.decodedBytes);
      record.decodedBytes = 0;
    }
    try { record.cancel?.(); } catch {}
    if (record.status === 'ready') disposeFrame(record.resource);
    if (cache.get(record.key) === record) cache.delete(record.key);
    if (count) {
      evictions += 1;
      evictedFrames?.push(record.frame);
    }
    return true;
  };
  let leastRecentlyUsedRecord = (exclude = null) => Array.from(cache.values())
    .filter((record) => record !== exclude && !record.cancelled)
    .sort((a, b) => a.lastAccess - b.lastAccess)[0] || null;
  let makeRoom = (decodedBytes, { evict = false, evictedFrames = null, exclude = null } = {}) => {
    if (decodedBytes > state.maxDecodedBytes) return false;
    while (
      cache.size >= state.maxCachedFrames
      || cachedDecodedBytes + reservedDecodedBytes + decodedBytes > state.maxDecodedBytes
    ) {
      if (!evict) return false;
      let record = leastRecentlyUsedRecord(exclude);
      if (!record) return false;
      evictRecord(record, { evictedFrames });
    }
    return true;
  };
  let requestFrame = (frameOrIndex, requestOptions = {}) => {
    let frame = typeof frameOrIndex === 'object'
      ? frameOrIndex
      : mediaStudioSequenceFrameAt(state.frames, frameOrIndex);
    if (!frame) return null;
    let key = String(frame.index);
    if (cache.has(key)) return touchRecord(cache.get(key));
    let estimatedDecodedBytes = frame.decodedBytes;
    if (!makeRoom(estimatedDecodedBytes, requestOptions)) return null;
    if (!cache.has(key)) {
      let record = {
        key,
        frame: frame.index,
        url: frame.url,
        estimatedDecodedBytes,
        decodedBytes: 0,
        reservedDecodedBytes: estimatedDecodedBytes,
        status: 'loading',
        value: null,
        resource: null,
        error: null,
        cancelled: false,
        cancel: null,
        lastAccess: ++accessSequence,
      };
      cache.set(key, record);
      reservedDecodedBytes += estimatedDecodedBytes;
      try {
        let result = loadFrame(frame, frame.url, frame.index);
        let loadValue = result;
        if (result && typeof result === 'object' && 'promise' in result) {
          loadValue = result.promise;
          record.cancel = typeof result.cancel === 'function' ? result.cancel : null;
        }
        record.value = Promise.resolve(loadValue)
          .then((value) => {
            if (record.cancelled) {
              disposeFrame(value);
              return null;
            }
            reservedDecodedBytes = Math.max(0, reservedDecodedBytes - record.reservedDecodedBytes);
            record.reservedDecodedBytes = 0;
            let decodedBytes = value && typeof value === 'object'
              && Number.isFinite(value.width) && Number.isFinite(value.height)
              ? mediaStudioDecodedBytes(value.width, value.height)
              : record.estimatedDecodedBytes;
            while (cachedDecodedBytes + reservedDecodedBytes + decodedBytes > state.maxDecodedBytes) {
              let candidate = leastRecentlyUsedRecord(record);
              if (!candidate) break;
              evictRecord(candidate);
            }
            if (decodedBytes > state.maxDecodedBytes
              || cachedDecodedBytes + reservedDecodedBytes + decodedBytes > state.maxDecodedBytes) {
              disposeFrame(value);
              record.status = 'error';
              record.error = new RangeError('Decoded frame exceeds maxDecodedBytes');
              record.value = null;
              return null;
            }
            record.status = 'ready';
            record.resource = value;
            record.decodedBytes = decodedBytes;
            cachedDecodedBytes += decodedBytes;
            record.value = value;
            return value;
          })
          .catch((error) => {
            if (record.cancelled) return null;
            reservedDecodedBytes = Math.max(0, reservedDecodedBytes - record.reservedDecodedBytes);
            record.reservedDecodedBytes = 0;
            record.status = 'error';
            record.error = error;
            return null;
          });
      } catch (error) {
        reservedDecodedBytes = Math.max(0, reservedDecodedBytes - record.reservedDecodedBytes);
        record.reservedDecodedBytes = 0;
        record.status = 'error';
        record.error = error;
      }
    }
    return touchRecord(cache.get(key));
  };
  return {
    update(centerFrame = state.currentFrame) {
      let center = Math.max(0, Math.min(Math.round(finiteNumber(centerFrame, state.currentFrame)), state.frameCount - 1));
      let behind = Math.round(state.fps * state.preloadBehindSec);
      let ahead = Math.round(state.fps * state.preloadAheadSec);
      let start = Math.max(0, center - behind);
      let end = Math.min(state.frameCount - 1, center + ahead);
      let activeFrames = new Map();
      for (let frame = start; frame <= end; frame += 1) {
        let item = mediaStudioSequenceFrameAt(state.frames, frame);
        if (item) activeFrames.set(String(item.index), item);
      }
      let evicted = [];
      for (let key of Array.from(cache.keys())) {
        if (activeFrames.has(key)) continue;
        evictRecord(cache.get(key), { evictedFrames: evicted });
      }
      let current = mediaStudioSequenceFrameAt(state.frames, center);
      if (current) requestFrame(current, { evict: true, evictedFrames: evicted });
      let candidates = Array.from(activeFrames.values())
        .filter((frame) => !cache.has(String(frame.index)))
        .sort((a, b) => Math.abs(a.index - center) - Math.abs(b.index - center) || a.index - b.index);
      for (let frame of candidates) requestFrame(frame);
      let requested = Array.from(cache.values())
        .filter((record) => activeFrames.has(record.key))
        .map((record) => record.frame)
        .sort((a, b) => a - b);
      return {
        centerFrame: center,
        startFrame: start,
        endFrame: end,
        requestedFrames: requested,
        evictedFrames: evicted.sort((a, b) => a - b),
        ...diagnostics(),
      };
    },
    has(frameIndex) {
      return cache.has(String(Math.round(finiteNumber(frameIndex, 0))));
    },
    get(frameIndex) {
      return touchRecord(cache.get(String(Math.round(finiteNumber(frameIndex, 0))))) || null;
    },
    dispose() {
      for (let record of Array.from(cache.values())) evictRecord(record, { count: false });
      cache.clear();
    },
    get size() {
      return cache.size;
    },
    get state() {
      return { ...state, frames: state.frames.slice() };
    },
    get diagnostics() {
      return diagnostics();
    },
  };
}

function timelineClip(input = {}, index = 0, { duration = 1, fps = 30 } = {}) {
  let hasPercent = input.startPercent != null
    || input.sizePercent != null
    || input.durationPercent != null;
  let start;
  let end;
  if (hasPercent) {
    let startPercent = finiteNumber(input.startPercent ?? input.start, Math.min(index * 8, 40), 0, 96);
    let sizePercent = finiteNumber(input.sizePercent ?? input.size ?? input.durationPercent, Math.max(20, 72 - index * 8), 4, 100);
    start = Math.round((startPercent / 100) * duration);
    end = Math.max(start + 1, Math.round(((startPercent + Math.min(sizePercent, 100 - startPercent)) / 100) * duration));
  } else if (input.startMs != null || input.endMs != null || input.durationMs != null) {
    start = msToFrame(input.startMs ?? input.start ?? input.from, fps);
    end = input.endMs == null
      ? start + Math.max(1, msToFrame(input.durationMs ?? input.duration, fps))
      : msToFrame(input.endMs, fps);
  } else {
    start = Math.round(finiteNumber(input.startFrame ?? input.frameStart ?? input.start ?? input.from, 0, 0, duration));
    end = input.endFrame == null && input.end == null
      ? start + Math.round(finiteNumber(input.durationFrames ?? input.duration ?? input.frames, Math.max(1, duration - start), 1, duration))
      : Math.round(finiteNumber(input.endFrame ?? input.end, start + 1, start + 1, duration));
  }
  start = Math.max(0, Math.min(start, duration));
  end = Math.max(start + 1, Math.min(end, duration));
  return {
    id: cleanText(input.id || input.clipId || input.turnId),
    lane: cleanText(input.lane || input.track || input.name, index === 0 ? 'video' : `track ${index + 1}`),
    label: cleanText(input.label || input.title || input.text, `clip ${index + 1}`),
    start,
    end,
    kind: cleanText(input.kind || input.type),
    frameCount: Math.max(0, Math.round(finiteNumber(input.frameCount, 0))),
    sampleCount: Math.max(0, Math.round(finiteNumber(input.sampleCount, Array.isArray(input.samples) ? input.samples.length : 0))),
    sequenceFormat: cleanText(input.sequenceFormat || input.format),
    samples: Array.isArray(input.samples) ? input.samples : [],
  };
}

function timelineTrackType(lane = '') {
  let value = String(lane || '').toLowerCase();
  if (value.includes('voice') || value.includes('audio') || value.includes('sound') || value.includes('narration')) return 'audio';
  if (value.includes('caption') || value.includes('subtitle') || value.includes('title') || value.includes('text')) return 'text';
  if (value.includes('effect') || value.includes('action') || value.includes('sync')) return 'effect';
  return 'video';
}

export function normalizeMediaStudioTimelineData(options = {}) {
  let fps = Math.max(1, Math.round(finiteNumber(options.fps, 30, 1, 120)));
  let durationFromMs = options.durationMs == null ? 0 : msToFrame(options.durationMs, fps);
  let sourceClips = Array.isArray(options.clips) ? options.clips : [];
  let durationFallback = durationFromMs || (sourceClips.length ? fps * 15 : 1);
  let duration = Math.max(1, Math.round(finiteNumber(options.durationFrames ?? options.duration, durationFallback, 1, fps * 3600)));
  let clips = sourceClips.map((clip, index) => timelineClip(clip, index, { duration, fps }));
  let clipDuration = clips.reduce((max, clip) => Math.max(max, clip.end || 0), 0);
  duration = Math.max(duration, clipDuration);
  let tracks = [];
  let trackByLane = new Map();

  clips.forEach((clip, index) => {
    let laneId = clip.lane.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `track-${index + 1}`;
    let track = trackByLane.get(laneId);
    if (!track) {
      track = {
        id: laneId,
        type: timelineTrackType(clip.lane),
        label: clip.lane,
        clips: [],
      };
      trackByLane.set(laneId, track);
      tracks.push(track);
    }
    track.clips.push({
      id: clip.id || `${laneId}-${track.clips.length + 1}`,
      start: clip.start,
      end: Math.min(clip.end, duration),
      label: clip.label,
      kind: clip.kind,
      frameCount: clip.frameCount,
      sampleCount: clip.sampleCount,
      sequenceFormat: clip.sequenceFormat,
      samples: clip.samples,
    });
  });
  let requestedFocusFrame = options.focusFrame ?? options.timelineFocusFrame;
  if (requestedFocusFrame == null && options.focusTimeMs != null) requestedFocusFrame = msToFrame(options.focusTimeMs, fps);
  if (requestedFocusFrame == null && options.focusTimeSec != null) requestedFocusFrame = Math.round(finiteNumber(options.focusTimeSec, 0) * fps);
  let focusFrame = Number.isFinite(Number(requestedFocusFrame))
    ? Math.max(0, Math.min(Math.round(Number(requestedFocusFrame)), duration))
    : null;
  let selectedClipId = cleanText(options.selectedClipId || options.focusClipId || options.timelineFocusClipId, '');

  return {
    fps,
    duration,
    tracks,
    markers: Array.isArray(options.markers) ? options.markers : [],
    focusFrame,
    selectedClipId,
  };
}

export function renderMediaStudioPreviewPanelMarkup(options = {}) {
  let preview = options.preview && typeof options.preview === 'object' ? options.preview : {};
  let previewState = normalizeMediaPreviewState({
    ...preview,
    status: options.status ?? preview.status,
    progress: options.progress ?? preview.progress,
    frameSource: options.frameSource || preview.frameSource,
  }, options.support || options);
  let frameUrl = firstFrameUrl(preview);
  let playbackProxyUrl = previewPlaybackProxyUrl(preview, previewState.frameSource);
  let finalOutputUrl = previewFinalOutputUrl(preview, previewState.frameSource);
  let videoUrl = playbackProxyUrl || finalOutputUrl;
  let requestedSource = cleanText(
    preview.previewMode || preview.mode || preview.viewMode || preview.previewSource,
    ''
  ).toLowerCase();
  let requestedMode = normalizeMediaStudioPreviewMode(requestedSource, '');
  let previewMode = resolveMediaStudioPreviewMode(preview, frameUrl, videoUrl, previewState);
  let showVideo = previewMode === MEDIA_STUDIO_PREVIEW_MODES.output && Boolean(videoUrl);
  let useFinalOutput = Boolean(finalOutputUrl)
    && (!playbackProxyUrl || ['output', 'final', 'video'].includes(requestedSource));
  let videoSrc = showVideo ? (useFinalOutput ? finalOutputUrl : playbackProxyUrl) : '';
  let videoKind = useFinalOutput ? 'final-output' : 'playback-proxy';
  let videoProof = useFinalOutput ? 'final-output-video' : 'virtual-sequence-playback-proxy';
  let previewProof = showVideo ? videoProof : 'frame-source-cache';
  let sourceTitle = cleanText(options.sourceTitle || preview.sourceTitle, 'Workspace source');
  let defaultProvider = showVideo && !useFinalOutput
    ? MEDIA_STUDIO_FRAME_SOURCE_TYPES.virtualSequence
    : MEDIA_STUDIO_FRAME_SOURCE_TYPES.externalBrowser;
  let provider = cleanText(previewState.frameSource?.providerId || options.provider, defaultProvider);
  let cacheKey = cleanText(previewState.frameSource?.cacheKey || options.cacheKey, '');
  let failures = normalizeMediaStudioFailures(preview.failures || options.failures || options.renderState?.failures);
  return `
    <div class="sn-media-studio-panel" data-media-studio-role="preview" data-preview-state="${escapeHtml(previewState.state)}" data-preview-mode="${escapeHtml(previewMode)}" data-frame-source-provider="${escapeHtml(provider)}" data-frame-cache-key="${escapeHtml(cacheKey)}">
      ${renderMediaPreparationProgress(options)}
      <div class="sn-media-studio-preview-stage" aria-label="FrameSource preview" data-preview-state="${escapeHtml(previewState.state)}" data-preview-mode="${escapeHtml(previewMode)}" data-frame-progress="${escapeHtml(percentLabel(previewState.progress))}">
        <div class="sn-media-studio-preview-window" data-render-proof="${escapeHtml(previewProof)}" data-preview-mode="${escapeHtml(previewMode)}">
          ${showVideo ? `<video class="sn-media-studio-frame sn-media-studio-video" data-media-preview-video data-video-source="${escapeHtml(videoKind)}" data-render-proof="${escapeHtml(videoProof)}" src="${escapeHtml(videoSrc)}"${frameUrl ? ` poster="${escapeHtml(frameUrl)}"` : ''} preload="metadata" playsinline aria-label="${escapeHtml(sourceTitle)} video preview"></video>` : frameUrl ? `<img class="sn-media-studio-frame" data-media-preview-sequence data-render-proof="cached-frame-sequence" src="${escapeHtml(frameUrl)}" alt="${escapeHtml(sourceTitle)} frame">` : `
            <div class="sn-media-studio-frame-placeholder" data-frame-source-state="${escapeHtml(previewState.state)}">
              <strong>${escapeHtml(previewState.state)}</strong>
              <span>${escapeHtml(previewState.reason || 'waiting-for-frames')}</span>
            </div>`}
          ${renderMediaStudioCaptionOverlayMarkup({ ...options, preview })}
        </div>
        ${renderMediaStudioFailureRows(failures)}
      </div>
    </div>`;
}

export function renderMediaStudioTimelinePanelMarkup(options = {}) {
  let data = normalizeMediaStudioTimelineData(options);
  return `
    <div class="sn-media-studio-timeline-panel" data-media-studio-role="timeline">
      <sn-timeline-editor class="sn-media-studio-timeline-editor" data-media-studio-timeline-editor data-track-count="${data.tracks.length}" data-duration-frames="${data.duration}"></sn-timeline-editor>
    </div>`;
}

function resolvePreviewVideoElement(root) {
  if (!root) return null;
  if (typeof root.matches === 'function' && root.matches('video')) return root;
  if (root.tagName === 'VIDEO') return root;
  return root.querySelector?.('[data-media-preview-video]') || root.querySelector?.('video') || null;
}

function resolvePreviewTimelineElement(root, options) {
  if (options.timeline) return options.timeline;
  return root?.querySelector?.('[data-media-studio-timeline-editor]') || null;
}

/**
 * @typedef {object} MediaStudioPreviewHydration
 * @property {HTMLVideoElement|null} video
 * @property {object|null} clock
 * @property {() => void} dispose
 */

/**
 * Connect the preview `<video>` to one authoritative video-frame clock; derives
 * frame/tick via an injected projection and optionally advances a timeline.
 *
 * @param {ParentNode|HTMLVideoElement} root
 * @param {{ projection?: object, timeline?: object, onFrame?: (detail: object) => void }} [options]
 * @returns {MediaStudioPreviewHydration}
 */
export function hydrateMediaStudioPreviewPanel(root, options = {}) {
  let video = resolvePreviewVideoElement(root);
  let previous = video?.__snMediaStudioPreviewClock;
  if (previous) {
    previous.dispose();
    video.__snMediaStudioPreviewClock = null;
  }
  if (!video) {
    return { video: null, clock: null, dispose() {} };
  }

  let projection = options.projection && typeof options.projection === 'object' ? options.projection : null;
  let timeline = resolvePreviewTimelineElement(root, options);
  let onFrame = typeof options.onFrame === 'function' ? options.onFrame : null;

  let clock = createVideoFrameClock(video, {
    onFrame: (detail) => {
      let frame = null;
      let tick = null;
      if (projection) {
        if (typeof projection.timeToTick === 'function') tick = projection.timeToTick(detail.mediaTime);
        if (typeof projection.timeToFrame === 'function') frame = projection.timeToFrame(detail.mediaTime);
        if (frame !== null && timeline && typeof timeline.setFrame === 'function') {
          timeline.setFrame(frame, { silent: true });
        }
      }
      onFrame?.({ ...detail, frame, tick });
    },
  });
  clock.start();

  let controller = {
    video,
    clock,
    dispose() {
      clock.dispose();
      if (video.__snMediaStudioPreviewClock === controller) video.__snMediaStudioPreviewClock = null;
    },
  };
  video.__snMediaStudioPreviewClock = controller;
  return controller;
}

export function hydrateMediaStudioTimelinePanel(root, options = {}) {
  let host = root?.matches?.('[data-media-studio-timeline-editor]')
    ? root
    : root?.querySelector?.('[data-media-studio-timeline-editor]');
  if (!host) return null;
  let hydrationEpoch = Math.max(0, Number(host.__snMediaStudioTimelineEpoch) || 0) + 1;
  host.__snMediaStudioTimelineEpoch = hydrationEpoch;
  let isCurrent = () => host.__snMediaStudioTimelineEpoch === hydrationEpoch;
  let data = normalizeMediaStudioTimelineData(options);
  let currentFrame = Math.round(finiteNumber(options.currentFrame ?? options.frame, 0, 0, data.duration));
  let bindEvents = () => {
    if (typeof host.addEventListener !== 'function') return;
    let previous = host.__snMediaStudioTimelineHandlers || {};
    if (previous.playhead && typeof host.removeEventListener === 'function') {
      host.removeEventListener('playhead-change', previous.playhead);
    }
    if (previous.transport && typeof host.removeEventListener === 'function') {
      host.removeEventListener('transport-change', previous.transport);
    }
    let next = {};
    if (typeof options.onPlayheadChange === 'function') {
      next.playhead = (event) => options.onPlayheadChange(event?.detail || {}, event);
      host.addEventListener('playhead-change', next.playhead);
    }
    if (typeof options.onTransportChange === 'function') {
      next.transport = (event) => options.onTransportChange(event?.detail || {}, event);
      host.addEventListener('transport-change', next.transport);
    }
    host.__snMediaStudioTimelineHandlers = next;
  };
  let load = () => {
    if (!isCurrent() || typeof host.loadTimeline !== 'function') return false;
    bindEvents();
    host.loadTimeline(data);
    try { host.setFrame?.(currentFrame, { silent: true }); } catch {}
    if (data.focusFrame !== null) {
      try { host.focusFrame?.(data.focusFrame); } catch {}
    }
    return true;
  };
  if (load()) return data;
  try {
    import('../timeline/TimelineEditor/TimelineEditor.js')
      .then(() => {
        if (!isCurrent()) return false;
        let registry = globalThis.customElements || globalThis.window?.customElements;
        let ready = registry?.whenDefined?.('sn-timeline-editor');
        if (ready && typeof ready.then === 'function') return ready.then(() => load());
        return load();
      })
      .then((loaded) => {
        if (!loaded && isCurrent()) globalThis.setTimeout?.(load, 0);
      })
      .catch(() => {});
  } catch {}
  return data;
}

function inspectorRows(rows = []) {
  return rows.map((row) => `
    <div class="sn-media-studio-field-row">
      <span>${escapeHtml(row.label)}</span>
      <span class="sn-media-studio-field-value">${escapeHtml(row.value)}</span>
    </div>`).join('');
}

export function renderMediaStudioInspectorPanelMarkup(options = {}) {
  let state = options.state && typeof options.state === 'object' ? options.state : {};
  let status = cleanText(options.status || state.status, 'idle');
  let progress = normalizeMediaProgress(options.progress ?? state.progress);
  let source = cleanText(options.source || state.source, MEDIA_STUDIO_FRAME_SOURCE_TYPES.externalBrowser);
  let frames = Number(state.frameCount || options.frameCount || 0);
  let output = cleanText(options.output || state.output || 'workspace-tour.mp4');
  let formatRows = options.formatRows || [
    { label: 'Aspect ratio', value: cleanText(options.aspectRatio || state.aspectRatio, '16:9') },
    { label: 'Source', value: source },
  ];
  let renderRows = options.renderRows || [
    { label: 'Status', value: status },
    { label: 'Progress', value: percentLabel(progress) },
    { label: 'Frames', value: Number.isFinite(frames) && frames > 0 ? String(frames) : 'pending' },
  ];
  let outputRows = options.outputRows || [
    { label: 'Codec', value: cleanText(options.codec || state.codec, 'H.264') },
    { label: 'Format', value: cleanText(options.format || state.format, 'MP4') },
    { label: 'Output', value: output },
  ];

  return `
    <div class="sn-media-studio-inspector-panel" data-media-studio-role="inspector" data-render-status="${escapeHtml(status)}">
      ${renderMediaStudioRenderSettingsControls(options)}
      ${renderMediaStudioVoiceProviderControls(options)}
      <section class="sn-media-studio-inspector-section">
        <h3 class="sn-media-studio-inspector-heading"><i class="material-symbols-outlined">aspect_ratio</i> Format</h3>
        ${inspectorRows(formatRows)}
      </section>
      <section class="sn-media-studio-inspector-section">
        <h3 class="sn-media-studio-inspector-heading"><i class="material-symbols-outlined">movie_filter</i> Render</h3>
        ${inspectorRows(renderRows)}
      </section>
      <section class="sn-media-studio-inspector-section">
        <h3 class="sn-media-studio-inspector-heading"><i class="material-symbols-outlined">drive_folder_upload</i> Output</h3>
        ${inspectorRows(outputRows)}
      </section>
      ${renderMediaStudioProgressPanelMarkup(options)}
    </div>`;
}

export function renderMediaStudioProgressPanelMarkup(options = {}) {
  let state = options.state && typeof options.state === 'object' ? options.state : {};
  let status = cleanText(options.status || state.status, 'idle');
  let progress = normalizeMediaProgress(options.progress ?? state.progress);
  let channel = cleanText(options.progressChannel || state.progressChannel, 'media.frame-source.progress');
  let source = cleanText(options.source || state.source, MEDIA_STUDIO_FRAME_SOURCE_TYPES.externalBrowser);
  let frames = Number(state.frameCount || options.frameCount || 0);
  let failures = normalizeMediaStudioFailures(
    state.failures || options.failures || state.renderState?.failures || options.renderState?.failures,
  );
  return `
    <div class="sn-media-studio-progress-shell" data-render-status="${escapeHtml(status)}" data-progress-channel="${escapeHtml(channel)}">
      <sn-metric>
        <span slot="label">Status</span>
        <span slot="value">${escapeHtml(status)}</span>
      </sn-metric>
      <sn-metric>
        <span slot="label">Frames</span>
        <span slot="value">${Number.isFinite(frames) && frames > 0 ? String(frames) : percentLabel(progress)}</span>
      </sn-metric>
      <sn-description-list>
        <sn-description-item label="Channel">${escapeHtml(channel)}</sn-description-item>
        <sn-description-item label="Source">${escapeHtml(source)}</sn-description-item>
        ${state.cacheKey || options.cacheKey ? `<sn-description-item label="Cache">${escapeHtml(state.cacheKey || options.cacheKey)}</sn-description-item>` : ''}
        ${state.error ? `<sn-description-item label="Error">${escapeHtml(state.error)}</sn-description-item>` : ''}
      </sn-description-list>
      ${renderMediaStudioFailureRows(failures)}
    </div>`;
}
