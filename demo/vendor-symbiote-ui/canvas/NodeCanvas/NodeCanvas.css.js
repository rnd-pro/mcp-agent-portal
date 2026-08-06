import { css } from '@symbiotejs/symbiote';
import { themedScrollbarStyles } from '../../themes/scrollbar-styles.js';

export let styles = css`
  node-canvas {
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
    background-color: var(--sn-sys-surface);
    background-image: radial-gradient(
      circle,
      var(--sn-grid-dot) 1px,
      transparent 1px
    );
    background-size: var(--sn-grid-size) var(--sn-grid-size);
    cursor: grab;
    touch-action: none;
    user-select: none;
    /* Prevent scrollbar oscillation: canvas manages its own viewport internally.
     - size: SVG overflow:visible children cannot influence parent sizing
     - layout: internal layout changes don't trigger parent reflow
     - paint: clips painting to element box */
    contain: size layout paint;
    ${themedScrollbarStyles}

    &:active {
      cursor: grabbing;
    }

    & .canvas-container {
      width: 100%;
      height: 100%;
      position: relative;
      overflow: hidden;
      outline: none;
      touch-action: none;
    }

    &[data-flow-scroll] {
      background-attachment: local;
    }

    &[data-flow-scroll='vertical'] {
      overflow-y: auto;
      overflow-x: hidden;
      touch-action: pan-y;
    }

    &[data-flow-scroll='horizontal'] {
      overflow-x: auto;
      overflow-y: hidden;
      touch-action: pan-x;
    }

    &[data-flow-scroll] .canvas-container {
      width: max(100%, var(--sn-flow-content-width, 100%));
      height: max(100%, var(--sn-flow-content-height, 100%));
      overflow: visible;
    }

    &[data-flow-scroll] .content {
      width: max(100%, var(--sn-flow-content-width, 100%));
      height: max(100%, var(--sn-flow-content-height, 100%));
    }

    &[data-readonly] {
      cursor: default;
    }

    &[data-chrome-none] .sn-minimap-toggle,
    &[data-chrome-none] node-minimap,
    &[data-chrome-none] node-search,
    &[data-chrome-none] graph-breadcrumb,
    &[data-chrome-none] quick-toolbar,
    &[data-chrome-none] context-menu,
    &[data-chrome-none] inspector-panel {
      display: none !important;
    }

    &[data-panels-none] .sn-minimap-toggle,
    &[data-panels-none] node-minimap,
    &[data-panels-none] node-search,
    &[data-panels-none] graph-breadcrumb,
    &[data-panels-none] inspector-panel {
      display: none !important;
    }

    & .content {
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: 0 0;
    }

    & .sn-connections {
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: all;
      overflow: visible;
      width: 1px;
      height: 1px;
      contain: layout style;
    }

    & .sn-conn-canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    & .sn-nodes {
      position: relative;
    }

    & graph-node[data-svg-shape] {
      background: transparent;
      border: none;
      box-shadow: none;
      border-radius: 0;
      overflow: visible;
    }

    & graph-node[data-svg-shape] > :not(.sn-node-shape-svg):not(.sn-node-media) {
      position: relative;
    }

    & .sn-node-shape-svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 0;
      overflow: visible;
    }

    & .pseudo-svg {
      position: absolute;
      top: 0;
      left: 0;
      overflow: visible;
      width: 1px;
      height: 1px;
      pointer-events: none;
      z-index: 100;
    }

    & .sn-focus-transition-marker {
      --sn-focus-marker-size: 18px;
      position: absolute;
      top: 0;
      left: 0;
      width: var(--sn-focus-marker-size);
      height: var(--sn-focus-marker-size);
      margin:
        calc(var(--sn-focus-marker-size) / -2)
        0
        0
        calc(var(--sn-focus-marker-size) / -2);
      border-radius: var(--sn-radius-full);
      background: var(--sn-sys-accent);
      border: 2px solid var(--sn-sys-surface-raised);
      box-shadow:
        0 0 0 3px color-mix(in oklab, var(--sn-sys-accent) 24%, transparent),
        0 10px 22px color-mix(in oklab, var(--sn-sys-accent) 34%, transparent);
      opacity: 0;
      pointer-events: none;
      z-index: 140;
      will-change: transform, opacity;
    }
  }

  /* Connection paths */
  .sn-conn-path {
    fill: none;
    stroke: var(--sn-conn-color);
    stroke-width: var(--sn-conn-width, 2);
    stroke-linecap: var(--sn-conn-linecap, round);
    stroke-linejoin: var(--sn-conn-linejoin, round);
    opacity: 0.7;
    pointer-events: stroke;
    cursor: pointer;
    /* Prevent sub-pixel anti-aliasing recalcs during parent transform */
    shape-rendering: geometricPrecision;
    vector-effect: non-scaling-stroke;

    &:hover {
      opacity: 1;
      stroke-width: var(--sn-conn-hover-width, 3);
    }

    &[data-selected] {
      stroke: var(--sn-conn-selected);
      stroke-width: var(--sn-conn-selected-width, 3);
      opacity: 1;
    }
  }

  .sn-conn-path[data-active-conn] {
    stroke: var(--sn-sys-accent);
    stroke-width: var(--sn-conn-selected-width, 3);
    opacity: 1;
  }

  .sn-conn-path[data-dimmed] {
    stroke: var(--sn-conn-dimmed, var(--sn-sys-on-surface-dim));
    stroke-width: var(--sn-conn-width, 2);
    opacity: 0.24;
  }

  .sn-conn-drag-proxy {
    stroke: var(--sn-sys-accent);
    stroke-width: var(--sn-conn-selected-width, 3);
    stroke-linecap: var(--sn-conn-linecap, round);
    stroke-linejoin: var(--sn-conn-linejoin, round);
    opacity: 0.95;
    pointer-events: none;
    vector-effect: non-scaling-stroke;
  }

  /* Kill pointer-events on SVG paths during active zoom/pan to prevent
   CSS :hover thrashing (stroke-width transition) from causing flicker */
  node-canvas[data-interacting] .sn-conn-path {
    pointer-events: none;
    transition: none;
  }

  /* Connector endpoint dots — hidden by default, shown only for SVG nodes */
  .sn-conn-dot {
    display: none;
    fill: var(--sn-conn-dot-fill, var(--sn-conn-color));
    stroke: var(--sn-conn-dot-stroke, var(--sn-sys-surface-raised));
    stroke-width: var(--sn-conn-dot-stroke-width, var(--sn-socket-border-width));
    r: var(
      --sn-conn-dot-r,
      calc((var(--sn-socket-size) + var(--sn-socket-border-width)) / 2)
    );
    opacity: 0.9;
    pointer-events: none;
    /* PERF: removed filter:drop-shadow — 672 GPU layers killed Chrome renderer */
  }

  .sn-conn-dot[data-svg-wired] {
    display: initial;
  }

  .sn-conn-dot[data-active-conn] {
    opacity: 1;
    fill: var(--sn-sys-accent);
  }

  .sn-conn-dot[data-dimmed] {
    opacity: 0.3;
  }

  /* Free dots for unconnected SVG ports */
  .sn-free-dot {
    fill: var(--sn-conn-color);
    stroke: var(--sn-sys-surface-raised);
    stroke-width: var(--sn-conn-dot-stroke-width, var(--sn-socket-border-width));
    r: var(
      --sn-conn-dot-r,
      calc((var(--sn-socket-size) + var(--sn-socket-border-width)) / 2)
    );
    opacity: 0.9;
    /* PERF: removed filter:drop-shadow — see .sn-conn-dot */
  }
  .sn-free-dot:hover {
    r: calc(
      var(
          --sn-conn-dot-r,
          calc((var(--sn-socket-size) + var(--sn-socket-border-width)) / 2)
        ) + 1px
    );
  }

  /* Dot highlight during compatible connector drag */
  .sn-dot-hint {
    r: calc(
      var(
          --sn-conn-dot-r,
          calc((var(--sn-socket-size) + var(--sn-socket-border-width)) / 2)
        ) + 1px
    );
    /* PERF: removed filter:drop-shadow — GPU layer per dot */
    animation: sn-dot-pulse var(--sn-animation-duration-fast) var(--sn-transition-easing) infinite;
    animation-play-state: var(--sn-animation-play-state);
  }

  @keyframes sn-dot-pulse {
    0%,
    100% {
      opacity: 0.9;
    }
    50% {
      opacity: 1;
    }
  }

  @keyframes sn-fire-pulse {
    0% {
      box-shadow: 0 0 0 0 color-mix(in oklab, var(--sn-sys-success) 70%, transparent);
    }
    50% {
      box-shadow: 0 0 20px 6px color-mix(in oklab, var(--sn-sys-success) 50%, transparent);
    }
    100% {
      box-shadow: 0 0 0 0 transparent;
    }
  }

  node-canvas graph-node[data-fire-state='pending'] {
    opacity: 0.4;
    transition: opacity var(--sn-transition-fast) var(--sn-transition-easing);
  }

  node-canvas graph-node[data-fire-state='active'] {
    opacity: 1;
    border-color: var(--sn-sys-success);
    animation: sn-fire-pulse var(--sn-animation-duration-fast) var(--sn-transition-easing);
    animation-play-state: var(--sn-animation-play-state);
    z-index: 50;
  }

  node-canvas graph-node[data-fire-state='complete'] {
    border-color: color-mix(in oklch, var(--sn-sys-success) 40%, transparent);
    transition: border-color var(--sn-animation-duration-slower) var(--sn-transition-easing);
  }

  .pseudo-path {
    fill: none;
    stroke: var(--sn-conn-color);
    stroke-width: var(--sn-pseudo-conn-width, 2);
    opacity: 0.5;
    stroke-dasharray: 8 4;
  }

  /* Data flow animation */
  @keyframes sn-flow {
    from {
      stroke-dashoffset: 0;
    }
    to {
      stroke-dashoffset: -20;
    }
  }

  .sn-conn-path[data-flowing] {
    stroke-dasharray: 10 5;
    animation: sn-flow var(--sn-animation-duration-fast) linear infinite;
    animation-play-state: var(--sn-animation-play-state);
    opacity: 0.9;
  }

  /* Plus indicator at connection drag endpoint */
  .plus-indicator {
    circle {
      fill: var(--sn-sys-surface-raised);
      stroke: var(--sn-conn-color);
      stroke-width: var(--sn-plus-indicator-stroke-width, 1.5);
      opacity: 0.9;
    }
    line {
      stroke: var(--sn-conn-color);
      stroke-width: var(--sn-plus-indicator-stroke-width, 1.5);
      stroke-linecap: round;
    }
  }

  /* Socket highlighting during connection drag */
  @keyframes sn-socket-glow {
    0%,
    100% {
      box-shadow: 0 0 4px currentColor;
    }
    50% {
      box-shadow:
        0 0 12px currentColor,
        0 0 20px currentColor;
    }
  }

  .sn-socket[data-compatible] {
    animation: sn-socket-glow var(--sn-animation-duration-normal) var(--sn-transition-easing) infinite;
    animation-play-state: var(--sn-animation-play-state);
    transform: scale(1.3);
    z-index: 10;
  }

  .sn-socket[data-incompatible] {
    opacity: 0.25;
    transform: scale(0.8);
  }

  /* Node lift effect when dragging */
  .sn-node-lifted {
    box-shadow: 0 6px 12px var(--sn-shadow-color);
    border-color: var(--sn-node-active-border) !important;
  }

  /* Connector dot: input vs output side */
  .sn-dot-output {
    fill: var(--sn-dot-output);
  }
  .sn-dot-input {
    fill: var(--sn-dot-input);
  }

  /* Connector dot: socket type overrides */
  .sn-dot-exec {
    fill: var(--sn-dot-exec);
    r: 6;
  }
  .sn-dot-data {
    /* uses side color by default */
  }
  .sn-dot-ctrl {
    fill: var(--sn-dot-ctrl);
    r: 4;
  }

  /* Connection PCB Marker */
  .sn-conn-marker {
    color: var(--sn-conn-marker-color, var(--sn-conn-color));
    opacity: 1;
    pointer-events: none;
  }

  .sn-conn-marker[data-selected] {
    color: color-mix(
      in oklab,
      var(--sn-conn-selected, var(--sn-sys-accent)) 100%,
      var(--sn-sys-surface)
    );
    filter: drop-shadow(0 0 3px var(--sn-sys-accent));
    opacity: 1;
  }

  .sn-conn-marker[data-collision-hidden] {
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  .sn-conn-marker[data-dimmed] {
    color: var(--sn-conn-dimmed, var(--sn-sys-on-surface-dim));
    opacity: 1;
  }

  .sn-conn-marker[data-active-conn] {
    opacity: 1;
    color: color-mix(in oklab, var(--sn-sys-accent) 100%, var(--sn-sys-surface));
  }

  /* Fire trace: sequential node execution highlighting */
  @keyframes sn-fire-pulse {
    0% {
      box-shadow: 0 0 0 0 color-mix(in oklab, var(--sn-sys-success) 60%, transparent);
    }
    50% {
      box-shadow: 0 0 16px 4px color-mix(in oklab, var(--sn-sys-success) 40%, transparent);
    }
    100% {
      box-shadow: 0 0 0 0 color-mix(in oklab, var(--sn-sys-success) 0%, transparent);
    }
  }

  graph-node[data-fire-state='active'] {
    border-color: var(--sn-sys-success) !important;
    animation: sn-fire-pulse var(--sn-animation-duration-fast) var(--sn-transition-easing);
    animation-play-state: var(--sn-animation-play-state);
    z-index: 50;
  }

  graph-node[data-fire-state='done'] {
    border-color: color-mix(in oklab, var(--sn-sys-success) 40%, transparent) !important;
    transition: border-color var(--sn-animation-duration-slower) var(--sn-transition-easing);
  }

   graph-node[data-fire-state='pending'] {
    opacity: 0.5;
    transition: opacity var(--sn-transition-fast) var(--sn-transition-easing);
  }

  .sn-marquee {
    position: absolute;
    border: 1px dashed var(--sn-sys-accent);
    background-color: color-mix(in srgb, var(--sn-sys-accent) 15%, transparent);
    pointer-events: none;
    z-index: 1000;
  }

  .sn-conn-label {
    font-family: var(--sn-font-family, sans-serif);
    font-size: var(--sn-font-size-small, 10px);
    fill: var(--sn-conn-label-color, var(--sn-sys-on-surface-faint));
    pointer-events: none;
    user-select: none;
  }
`;
