let css = /*css*/`
  sn-timeline-editor {
    display: flex;
    flex-direction: column;
    min-height: 120px;
    height: 100%;
    background: var(--sn-sys-surface-panel);
    color: var(--sn-sys-on-surface);
    font-family: var(--sn-font);
    font-size: var(--sn-text-xs);
    overflow: hidden;
    user-select: none;
    --te-track-height: 36px;
    --te-ruler-height: 28px;
    --te-transport-height: 28px;
    --te-header-width: 140px;
    --te-playhead-color: var(--sn-sys-danger);
    --te-clip-radius: calc(3px * var(--sn-theme-radius-scale, 1));
    --te-border: var(--sn-sys-outline);
    --te-track-bg: var(--sn-sys-surface);
    --te-track-bg-alt: color-mix(in oklch, var(--sn-sys-surface) 85%, var(--sn-sys-surface-panel));
    --te-marker-color: var(--sn-sys-warning);
    --te-selection: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), transparent);
    --sn-dom-timeline-clip-video: var(--sn-sys-accent);
    --sn-dom-timeline-clip-audio: var(--sn-sys-warning);
    --sn-dom-timeline-clip-text: var(--sn-sys-success);
    --sn-dom-timeline-clip-effect: var(--sn-sys-info);
    --sn-dom-timeline-clip-default: var(--sn-sys-outline-strong);
  }

  .te-transport {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: var(--sn-step-4);
    height: var(--te-transport-height);
    min-height: var(--te-transport-height);
    padding: 0 var(--sn-step-4);
    background: var(--sn-sys-surface-panel);
    border-bottom: 1px solid var(--te-border);
    flex-shrink: 0;
    min-width: 0;
  }

  .te-transport-group {
    display: flex;
    align-items: center;
    gap: var(--sn-step-3);
    min-width: 0;
  }

  .te-transport-time {
    justify-content: flex-start;
  }

  .te-transport-playback {
    justify-content: center;
  }

  .te-transport-tools {
    justify-content: flex-end;
  }

  .te-transport button {
    display: inline-grid;
    place-items: center;
    width: calc(var(--te-transport-height) - 6px);
    height: calc(var(--te-transport-height) - 6px);
    min-width: calc(var(--te-transport-height) - 6px);
    background: var(--sn-sys-surface-raised);
    border: 1px solid var(--te-border);
    color: var(--sn-sys-on-surface-dim);
    padding: 0;
    border-radius: calc(var(--sn-radius-xs, 3px) * var(--sn-theme-radius-scale, 1));
    cursor: pointer;
    font-family: inherit;
    font-size: var(--sn-text-xs);
    line-height: 1;
    transition: var(--sn-effect-hover-transition);
  }

  .te-transport button:hover {
    background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised));
    color: var(--sn-sys-on-surface);
  }

  .te-transport button[data-active] {
    background: var(--te-playhead-color);
    border-color: var(--te-playhead-color);
    color: var(--sn-sys-on-status);
  }

  .te-transport .material-symbols-outlined {
    font-size: calc(var(--te-transport-height) - var(--sn-step-6));
    line-height: 1;
  }

  .te-transport .te-time {
    font-family: var(--sn-font-mono);
    font-size: var(--sn-text-xs);
    color: var(--sn-sys-on-surface);
    min-width: 80px;
    text-align: center;
  }

  .te-transport .te-zoom-label {
    font-size: var(--sn-text-2xs);
    color: var(--sn-sys-on-surface-dim);
    white-space: nowrap;
  }

  .te-body {
    display: grid;
    grid-template-columns: var(--te-header-width) minmax(0, 1fr);
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--sn-sys-surface-panel);
  }

  .te-headers {
    grid-column: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    border-right: 1px solid var(--te-border);
    overflow: hidden;
  }

  .te-headers-ruler-pad {
    height: var(--te-ruler-height);
    min-height: var(--te-ruler-height);
    border-bottom: 1px solid var(--te-border);
    display: flex;
    align-items: center;
    padding: 0 var(--sn-step-4);
    font-size: var(--sn-text-2xs);
    color: var(--sn-sys-on-surface-dim);
    background: var(--sn-sys-surface-panel);
  }

  .te-headers-scroll {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  .te-headers-list {
    position: relative;
    min-width: 0;
    will-change: transform;
  }

  .te-header-track {
    height: var(--te-track-height);
    min-height: var(--te-track-height);
    display: flex;
    align-items: center;
    padding: 0 var(--sn-step-4);
    gap: var(--sn-step-3);
    border-bottom: 1px solid var(--te-border);
    cursor: default;
  }

  .te-header-track:nth-child(odd) {
    background: var(--te-track-bg);
  }

  .te-header-track:nth-child(even) {
    background: var(--te-track-bg-alt);
  }

  .te-header-icon {
    width: 14px;
    height: 14px;
    border-radius: var(--sn-radius-xs);
    flex-shrink: 0;
    background: var(--sn-dom-timeline-clip-default);
    overflow: hidden;
    color: transparent;
    font-size: 0;
  }

  .te-header-icon[data-track-type="video"] {
    background: var(--sn-dom-timeline-clip-video);
  }

  .te-header-icon[data-track-type="audio"],
  .te-header-icon[data-track-type="voice"] {
    background: var(--sn-dom-timeline-clip-audio);
  }

  .te-header-icon[data-track-type="text"],
  .te-header-icon[data-track-type="captions"],
  .te-header-icon[data-track-type="caption"] {
    background: var(--sn-dom-timeline-clip-text);
  }

  .te-header-icon[data-track-type="effect"],
  .te-header-icon[data-track-type="actions"],
  .te-header-icon[data-track-type="action"] {
    background: var(--sn-dom-timeline-clip-effect);
  }

  .te-header-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--sn-text-xs);
  }

  .te-header-mute {
    display: inline-grid;
    place-items: center;
    width: 16px;
    height: 16px;
    min-width: 16px;
    border: none;
    background: none;
    color: var(--sn-sys-on-surface-dim);
    cursor: pointer;
    font-size: var(--sn-text-sm);
    padding: 0;
    opacity: 0.5;
    transition: opacity var(--sn-transition-fast);
  }

  .te-header-mute .material-symbols-outlined {
    font-size: var(--sn-text-lg);
    line-height: 1;
  }

  .te-header-mute:hover {
    opacity: 1;
  }

  .te-timeline-viewport {
    grid-column: 2;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    position: relative;
    scrollbar-color: var(--sn-scrollbar-thumb) var(--sn-scrollbar-track);
    scrollbar-width: var(--sn-scrollbar-width, thin);
    background: var(--sn-sys-surface);
  }

  .te-timeline-content {
    position: relative;
    min-width: 100%;
    min-height: 100%;
  }

  .te-ruler-canvas {
    position: sticky;
    top: 0;
    z-index: 4;
    display: block;
    height: var(--te-ruler-height);
    background: var(--sn-sys-surface-panel);
    border-bottom: 1px solid var(--te-border);
  }

  .te-tracks-canvas {
    position: absolute;
    left: 0;
    z-index: 1;
    display: block;
  }

  .te-playhead {
    position: absolute;
    top: 0;
    width: 1px;
    background: var(--te-playhead-color);
    pointer-events: none;
    z-index: 5;
    transition: left var(--sn-transition-fast, 0.03s) linear;
  }

  .te-playhead::before {
    content: '';
    position: absolute;
    top: 0;
    left: var(--te-playhead-cap-offset, calc(-1 * var(--sn-step-3)));
    width: 11px;
    height: 8px;
    background: var(--te-playhead-color);
    clip-path: polygon(0 0, 100% 0, 50% 100%);
  }

  sn-timeline-editor[playing] .te-playhead {
    width: 2px;
    box-shadow: 0 0 0 1px color-mix(in oklch, var(--te-playhead-color) 24%, transparent);
  }

  .te-empty {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--sn-sys-on-surface-dim);
    font-size: var(--sn-text-sm);
    font-style: italic;
    opacity: 0.5;
  }

  .te-empty[hidden],
  .te-headers[hidden],
  .te-timeline-viewport[hidden] {
    display: none;
  }
`;

export default css;
