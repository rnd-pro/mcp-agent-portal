import { css } from '@symbiotejs/symbiote';
import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';
import { themedScrollbarStyles } from '../../themes/scrollbar-styles.js';

export let styles = css`
  graph-node {
    display: block;
    min-width: var(--sn-node-min-width);
    max-width: var(--sn-node-max-width);
    border-radius: var(--sn-node-radius);
    background: var(--sn-sys-surface-raised);
    border: var(--sn-node-border-width) solid var(--sn-sys-outline);
    box-shadow: var(--sn-node-shadow);
    user-select: none;
    cursor: move;
    transition:
      border-color 0.2s ease-out,
      box-shadow 0.2s ease-out,
      opacity 0.2s ease-out;
    overflow: visible;
    font-family: var(--sn-font);
    font-size: var(--sn-node-font-size);
    -webkit-font-smoothing: antialiased;
    --sn-node-items-max-height: 420px;
    --sn-svg-shape-media-clip: circle(50% at 50% 50%);
    --sn-node-category-accent: var(--sn-cat-default);
    --sn-node-accent: var(--sn-node-type-accent, var(--sn-node-category-accent));
    --sn-node-port-socket-offset: calc((var(--sn-socket-size, 12px) + var(--sn-step-3, 6px)) * -1);
    --sn-node-pill-port-socket-offset: calc((var(--sn-socket-size, 12px) + var(--sn-step-7, 14px)) * -1);

    /* Symbiote animateOut: CSS-driven exit transition */
    &[leaving] {
      opacity: 0;
      transform: scale(0.92);
      transition:
        border-color 0.2s ease-out,
        box-shadow 0.2s ease-out,
        opacity 0.2s ease-out,
        transform 0.2s ease-out;
    }

    &[data-selected] {
      border-color: var(--sn-sys-accent);
      box-shadow: 0 0 20px color-mix(in oklab, var(--sn-sys-accent) 30%, transparent);
    }

    &[data-collapsed] {
      & .controls {
        display: none;
      }
      & .sn-node-body {
        padding: var(--sn-node-collapsed-body-padding, 4px 0);
      }
      & .port-label {
        display: none;
      }
    }

    &[data-muted] {
      opacity: 0.45;
      filter: saturate(0.3);

      & .sn-node-label {
        text-decoration: line-through;
      }
    }

    &[data-header-hidden] .sn-node-header {
      display: none !important;
    }

    &[data-content-hidden] {
      & .sn-node-content,
      & .sn-node-items {
        display: none !important;
      }
    }

    &[data-readonly]:not([data-readonly-node-dragging]),
    node-canvas[data-readonly] &:not([data-readonly-node-dragging]) {
      cursor: default;
    }

    /* Compact mode — hide node body (ports & controls).
     Activated by canvas.setCompactMode(true) which sets data-compact on the canvas.
     SubgraphNodes (node-type="subgraph") keep body visible for inner graph preview. */
    node-canvas[data-compact] &:not([node-type='subgraph']) .sn-node-body {
      display: none;
    }

    /* LOD: medium — strip heavy rendering for performance */
    &[data-lod='medium'] {
      box-shadow: none;
      transition: none;
      will-change: auto;
      pointer-events: auto;

      /* LOD medium suppresses the hover state layer: 0% mix pins the resting outline */
      &:hover {
        border-color: color-mix(in oklch, var(--sn-sys-accent) 0%, var(--sn-sys-outline));
      }

      &[data-selected] {
        box-shadow: none;
      }

      &[data-processing] {
        box-shadow: none;
        animation: none;
      }

      &[data-completed] {
        box-shadow: none;
      }

      &[data-muted] {
        filter: none;
        opacity: 0.5;
      }

      & .controls,
      & .port-label,
      & .sn-subgraph-preview,
      & .error-frame,
      & .sn-quick-toolbar {
        visibility: hidden;
        pointer-events: none;
      }

      & node-socket {
        transition: none;
        cursor: default;

        &:hover {
          transform: none;
          box-shadow: none;
        }
      }
    }

    &[node-type='subgraph'] .sn-subgraph-preview {
      display: block;
      width: 100%;
      height: 80px;
      border-top: 1px solid color-mix(in oklab, currentColor 6%, transparent);
      opacity: 0.7;
    }

    &[data-processing] {
      border-color: var(--sn-node-accent, var(--sn-sys-accent));
      box-shadow:
        0 0 16px color-mix(in oklab, var(--sn-node-accent) 40%, transparent),
        0 0 4px color-mix(in oklab, var(--sn-node-accent) 60%, transparent);
      animation: sn-node-pulse var(--sn-animation-duration-normal) var(--sn-transition-easing) infinite;
      animation-play-state: var(--sn-animation-play-state);
    }

    &[data-completed] {
      border-color: var(--sn-sys-success);
      box-shadow: 0 0 8px color-mix(in oklab, var(--sn-sys-success) 30%, transparent);
    }

    &[data-error] {
      border-color: color-mix(in oklab, var(--sn-sys-danger) 60%, transparent);
      position: relative;
    }

    &[data-error] .sn-node-header {
      background: color-mix(in oklab, var(--sn-sys-danger) 10%, transparent);
    }

    & .error-frame {
      position: absolute;
      bottom: calc(100% + var(--sn-node-error-frame-offset));
      left: 50%;
      transform: translateX(-50%);
      min-width: var(--sn-node-error-frame-min-width);
      max-width: var(--sn-node-error-frame-max-width);
      border: var(--sn-node-error-frame-border-width) solid color-mix(in oklab, var(--sn-sys-danger) 60%, transparent);
      border-radius: var(--sn-node-error-frame-radius);
      background: color-mix(in oklab, var(--sn-sys-danger) 8%, transparent);
      pointer-events: none;
      z-index: 10;
      transition: bottom var(--sn-transition-fast) var(--sn-transition-easing);
    }

    & .error-frame-header {
      display: flex;
      align-items: center;
      gap: var(--sn-node-error-frame-header-gap, 6px);
      padding: var(--sn-node-error-frame-header-padding, 5px 10px);
      font-size: var(--sn-node-error-frame-header-size, 12px);
      font-weight: 600;
      color: color-mix(in oklab, var(--sn-sys-danger) 90%, white);
      border-bottom: 1px solid color-mix(in oklab, var(--sn-sys-danger) 20%, transparent);
      user-select: none;
    }

    & .error-frame-header .material-symbols-outlined {
      font-size: var(--sn-node-error-frame-icon-size, 14px);
      opacity: 0.8;
    }

    & .error-frame-body {
      padding: var(--sn-node-error-frame-body-padding, 6px 10px);
      font-size: var(--sn-node-error-frame-body-size, 11px);
      line-height: 1.4;
      color: color-mix(in oklab, var(--sn-sys-danger) 75%, white);
      word-wrap: break-word;
    }

    & .sn-node-media {
      position: relative;
      inline-size: 100%;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      border-bottom: 1px solid color-mix(in oklab, currentColor 8%, transparent);
      background: color-mix(in oklab, var(--sn-node-accent) 10%, transparent);
    }

    & .sn-node-media-img {
      display: block;
      inline-size: 100%;
      block-size: 100%;
      object-fit: cover;
      pointer-events: none;
      user-select: none;
      -webkit-user-drag: none;
    }

    &[data-media-fit='contain'] .sn-node-media-img {
      object-fit: contain;
    }

    &[data-media-fit='cover'] .sn-node-media-img {
      object-fit: cover;
    }

    & .sn-node-media-activate {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--sn-sys-on-surface);
      cursor: pointer;
      opacity: 1;
    }

    & .sn-node-media-activate::after {
      content: '';
      inline-size: var(--sn-node-media-activate-icon-size, 40px);
      block-size: var(--sn-node-media-activate-icon-size, 40px);
      background: var(--sn-node-media-activate-bg, var(--sn-sys-accent));
      -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cpath fill='black' fill-rule='evenodd' d='M24 2a22 22 0 1 1 0 44 22 22 0 0 1 0-44Zm-5 12.5v19L35 24 19 14.5Z'/%3E%3C/svg%3E") center / contain no-repeat;
      mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cpath fill='black' fill-rule='evenodd' d='M24 2a22 22 0 1 1 0 44 22 22 0 0 1 0-44Zm-5 12.5v19L35 24 19 14.5Z'/%3E%3C/svg%3E") center / contain no-repeat;
      pointer-events: none;
      filter: drop-shadow(0 1px 3px color-mix(in oklab, black 45%, transparent));
    }

    & .sn-node-media-activate[hidden] {
      display: none;
    }

    & .sn-node-media-activate:focus-visible {
      outline: var(--sn-focus-ring-width, 2px) solid var(--sn-sys-accent);
      outline-offset: calc(var(--sn-focus-ring-width, 2px) * -1);
    }
    & .sn-node-content {
      padding: var(--sn-node-content-padding, 8px 12px 10px);
      min-width: 0;
    }

    & .sn-node-summary {
      margin: 0;
      color: var(--sn-sys-on-surface-dim);
      font-size: var(--sn-node-summary-size, 12px);
      line-height: 1.45;
    }

    & .sn-node-link {
      display: inline-flex;
      align-items: center;
      gap: var(--sn-node-link-gap, 5px);
      margin-top: var(--sn-node-link-margin-block-start, 8px);
      color: var(--sn-sys-accent);
      font-size: var(--sn-node-link-size, 12px);
      font-weight: 700;
      text-decoration: none;
    }

    & .sn-node-link:not([href]) {
      display: none;
    }

    & .sn-node-link .material-symbols-outlined {
      font-size: var(--sn-node-link-icon-size, 15px);
    }

    & .sn-node-items {
      display: flex;
      flex-direction: column;
      padding: var(--sn-node-items-padding, 6px);
      gap: var(--sn-node-items-gap, 6px);
      max-block-size: var(--sn-node-items-max-height);
      overflow-y: auto;
      ${themedScrollFadeBlockStyles}
      ${themedScrollbarStyles}
    }

    & .sn-node-item {
      display: flex;
      flex-direction: column;
      gap: var(--sn-node-item-gap, 3px);
      padding: var(--sn-node-item-padding, 8px 9px);
      border: 1px solid var(--sn-node-item-border, color-mix(in oklab, currentColor 8%, transparent));
      border-radius: var(--sn-node-item-radius, 6px);
      background: color-mix(in oklab, var(--sn-node-accent) 8%, transparent);
      color: inherit;
      text-decoration: none;
    }

    & .sn-node-item:hover {
      border-color: color-mix(in oklab, var(--sn-node-accent) 44%, transparent);
      background: color-mix(in oklab, var(--sn-node-accent) 14%, transparent);
    }

    & .sn-node-item-kicker {
      color: var(--sn-node-accent);
      font-size: var(--sn-node-item-kicker-size, 10px);
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    & .sn-node-item-title {
      color: var(--sn-sys-on-surface);
      font-size: var(--sn-node-item-title-size, 13px);
      font-weight: 700;
      line-height: 1.25;
    }

    & .sn-node-item-summary {
      display: -webkit-box;
      overflow: hidden;
      color: var(--sn-sys-on-surface-dim);
      font-size: var(--sn-node-item-summary-size, 11px);
      line-height: 1.35;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    &[data-selected] .error-frame {
      bottom: calc(100% + var(--sn-step-12, 46px));
    }

    &:hover {
      border-color: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-outline));
    }

    &[node-category='server'] {
      --sn-node-category-accent: var(--sn-cat-server);
    }
    &[node-category='instance'] {
      --sn-node-category-accent: var(--sn-cat-instance);
    }
    &[node-category='control'] {
      --sn-node-category-accent: var(--sn-cat-control);
    }
    &[node-category='data'] {
      --sn-node-category-accent: var(--sn-cat-data);
    }
    &[node-category='default'] {
      --sn-node-category-accent: var(--sn-cat-default);
    }
    /* Codebase categories */
    &[node-category='directory'] {
      --sn-node-category-accent: var(--sn-cat-directory);
    }
    &[node-category='file'] {
      --sn-node-category-accent: var(--sn-cat-file);
    }
    &[node-category='function'] {
      --sn-node-category-accent: var(--sn-cat-function);
    }
    &[node-category='class'] {
      --sn-node-category-accent: var(--sn-cat-class);
    }
    &[node-category='module'] {
      --sn-node-category-accent: var(--sn-cat-module);
    }

    /* Shape: pill — compact horizontal capsule */
    &[node-shape='pill'] {
      min-width: 100px;
      max-width: 200px;
      border-radius: var(--sn-radius-full);

      & .sn-node-header {
        display: none;
      }
      & .sn-node-body {
        padding: var(--sn-node-pill-body-padding, 8px 20px);
        align-items: center;
        justify-content: center;
        flex-direction: row;
        gap: var(--sn-node-pill-body-gap, 8px);
      }
      & .inputs,
      & .outputs {
        padding: 0;
      }
      & .sn-port-in node-socket {
        margin-left: var(--sn-node-pill-port-socket-offset);
      }
      & .sn-port-out node-socket {
        margin-right: var(--sn-node-pill-port-socket-offset);
      }
      & .controls {
        display: none;
      }
    }

    /* Shape: circle — hub/connector node */
    &[node-shape='circle'] {
      position: relative;
      inline-size: var(--sn-node-circle-size, 100px);
      min-width: var(--sn-node-circle-size, 100px);
      min-height: var(--sn-node-circle-size, 100px);
      border-radius: 50%;
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;

      & .sn-node-header {
        position: absolute;
        inset: 0;
        z-index: 1;
        background: transparent;
        border-bottom: none;
        align-items: center;
        justify-content: center;
        padding: var(--sn-node-circle-header-padding, 6px);
      }
      & .sn-node-icon {
        font-size: var(--sn-node-circle-icon-size, var(--sn-shape-icon-size, 40px));
      }
      & .sn-node-label {
        display: none;
      }
      & .sn-node-body {
        position: absolute;
        inset: 0;
        z-index: 1;
        padding: var(--sn-node-circle-body-padding, 0);
        display: block;
        gap: 0;
      }
      & .inputs {
        position: absolute;
        left: var(--sn-node-circle-port-offset, -6px);
        top: 50%;
        transform: translateY(-50%);
      }
      & .outputs {
        position: absolute;
        right: var(--sn-node-circle-port-offset, -6px);
        top: 50%;
        transform: translateY(-50%);
      }
      &[data-has-media] .sn-node-media {
        position: absolute;
        inset: 50% auto auto 50%;
        z-index: 0;
        inline-size: var(--sn-node-circle-media-size, 100%);
        block-size: var(--sn-node-circle-media-size, 100%);
        transform: translate(-50%, -50%);
        border: 0;
        border-radius: 50%;
        clip-path: circle(50% at 50% 50%);
      }
      &[data-has-media] .sn-node-media-img {
        inline-size: 100%;
        block-size: 100%;
        aspect-ratio: 1;
        object-fit: var(--sn-node-circle-media-fit, cover);
      }
      &[data-has-media] .sn-node-header {
        opacity: 0;
        pointer-events: none;
      }
      & .port-label {
        display: none;
      }
      & .controls {
        display: none;
      }
    }

    /* Shape: diamond — condition/decision */
    &[node-shape='diamond'] {
      min-width: 100px;
      min-height: 100px;
      border-radius: var(--sn-radius-sm);
      transform-origin: center;
      clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
      display: flex;
      align-items: center;
      justify-content: center;

      & .sn-node-header {
        display: none;
      }
      & .sn-node-body {
        text-align: center;
        padding: 25% 10%;
      }
      & .controls {
        display: none;
      }
    }

    /* Shape: comment — annotation banner */
    &[node-shape='comment'] {
      min-width: 200px;
      max-width: 400px;
      border-radius: var(--sn-comment-radius);
      background: var(--sn-comment-bg);
      border-color: var(--sn-comment-border);
      cursor: default;
      box-shadow: none;

      & .sn-node-header {
        display: none;
      }
      & .sn-node-body {
        padding: var(--sn-node-comment-body-padding, 12px 16px);
      }
      & .inputs,
      & .outputs {
        display: none;
      }
    }

    /* Shape: SVG custom — node with SVG background path */
    &[data-svg-shape] {
      position: relative;
      min-width: 100px;
      min-height: 100px;
      background: transparent;
      border: none;
      box-shadow: none;
      border-radius: 0;
      overflow: visible;
      cursor: default;

      /* Move cursor only over SVG path fill area */
      & > svg {
        pointer-events: none;
        & > path {
          pointer-events: visibleFill;
          cursor: move;
          stroke: var(--sn-shape-stroke, var(--sn-sys-outline));
          stroke-width: var(--sn-shape-stroke-width, 0.4);
          transition: stroke var(--sn-transition-normal) var(--sn-transition-easing);
        }
      }

      &[data-readonly]:not([data-readonly-node-dragging]) > svg > path,
      node-canvas[data-readonly] &:not([data-readonly-node-dragging]) > svg > path {
        cursor: default;
      }

      & .sn-node-header,
      & .sn-node-body {
        display: none;
      }
      /* Hide DOM port items - ConnectionRenderer computes positions mathematically */
      & .inputs,
      & .outputs {
        display: none;
      }
      & .sn-node-shape-icon {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: var(--sn-shape-icon-size, 40px);
        line-height: 1;
        color: var(--sn-node-accent, var(--sn-sys-on-surface-dim));
        pointer-events: none;
        z-index: 1;
      }

      &[data-has-media] {
        overflow: visible !important;
        border-radius: 0 !important;

        & > svg {
          z-index: 1;
        }

        & > svg > path {
          fill: transparent;
        }

        & .sn-node-media {
          position: absolute !important;
          inset: var(--sn-svg-shape-media-top, 0%) auto auto var(--sn-svg-shape-media-left, 0%);
          inline-size: var(--sn-svg-shape-media-width, 100%);
          block-size: var(--sn-svg-shape-media-height, 100%);
          z-index: 0;
          border: 0;
          margin: 0;
          clip-path: var(--sn-svg-shape-media-clip);
        }

        & .sn-node-media-img {
          inline-size: 100%;
          block-size: 100%;
          aspect-ratio: 1;
          object-fit: cover;
        }

        & .sn-node-body {
          display: none;
        }

        & .sn-node-shape-icon {
          display: none;
        }
      }
    }

    &[data-svg-shape][data-node-tone='inverse'] {
      --sn-shape-fill: var(--sn-node-accent);
      --sn-shape-stroke: var(--sn-node-accent);

      & .sn-node-shape-icon {
        color: var(--sn-sys-surface-raised);
      }
    }

    /* SVG shape states — target inline svg > path directly.
     border/box-shadow have no effect on SVG nodes (border: none).
     Only stroke COLOR changes on state — width stays the same as inactive,
     matching HTML nodes where border-width stays 1px on selection. */
    &[data-svg-shape][data-selected] > svg > path {
      stroke: var(--sn-sys-accent);
      transition: stroke var(--sn-transition-normal) var(--sn-transition-easing);
    }

    &[data-svg-shape][data-error] > svg > path {
      stroke: var(--sn-sys-danger);
      transition: stroke var(--sn-transition-normal) var(--sn-transition-easing);
    }

    &[data-svg-shape][data-muted] > svg > path {
      opacity: 0.35;
      filter: saturate(0.2);
      transition:
        opacity 0.2s ease,
        filter 0.2s ease;
    }

    &[data-svg-shape][data-processing] > svg > path {
      stroke: var(--sn-node-accent, var(--sn-sys-accent));
      animation: sn-svg-pulse var(--sn-animation-duration-normal) var(--sn-transition-easing) infinite;
      animation-play-state: var(--sn-animation-play-state);
    }

    &[data-svg-shape][data-completed] > svg > path {
      stroke: var(--sn-sys-success);
      transition: stroke var(--sn-transition-normal) var(--sn-transition-easing);
    }

    & .sn-node-header {
      display: flex;
      align-items: center;
      gap: var(--sn-node-header-gap, 6px);
      padding: var(--sn-node-header-padding, 8px 12px);
      background: var(
        --sn-node-header-bg,
        color-mix(in oklab, var(--sn-node-accent) 15%, transparent)
      );
      border-bottom: 1px solid var(--sn-node-header-border, color-mix(in oklab, currentColor 6%, transparent));
      border-radius: var(--sn-node-radius) var(--sn-node-radius) 0 0;
    }

    & .sn-node-icon {
      font-size: var(--sn-node-icon-size, 18px);
      color: var(--sn-node-accent);
      opacity: 1;
    }

    & .sn-node-label {
      font-weight: 600;
      font-size: var(--sn-node-label-size, inherit);
      color: var(--sn-sys-on-surface);
      opacity: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    & .sn-node-body {
      padding: var(--sn-node-body-padding, 8px 0);
      display: flex;
      flex-direction: column;
      gap: var(--sn-node-body-gap, 4px);
    }

    & .inputs,
    & .outputs {
      display: flex;
      flex-direction: column;
      transition: transform var(--sn-transition-fast) var(--sn-transition-easing);
    }

    /* Port hint: slide ports to nearest side during connector drag */
    &[data-port-hint='right'] .inputs {
      transform: translateX(calc(100% - 12px));
    }

    &[data-port-hint='left'] .outputs {
      transform: translateX(calc(-100% + 12px));
    }

    /* Compatible SVG node during drag: subtle outline hint only — dots handle highlight */
    &[data-svg-shape][data-port-hint] > svg > path {
      stroke: var(--sn-sys-accent);
      stroke-width: var(--sn-shape-port-hint-stroke-width, 0.5);
      opacity: 0.8;
      transition:
        stroke 0.15s ease,
        opacity 0.15s ease;
    }

    /* Incompatible dimming for nodes without compatible ports */
    &[data-port-hint='none'] {
      opacity: 0.4;
      pointer-events: none;
    }

    & .sn-port {
      display: flex;
      align-items: center;
      gap: var(--sn-port-gap, 6px);
      padding: var(--sn-port-padding, 3px 12px);
      min-height: var(--sn-port-min-height, 24px);
    }

    & .sn-port-in {
      flex-direction: row;

      & node-socket {
        margin-left: var(--sn-node-port-socket-offset);
      }
    }

    & .sn-port-out {
      flex-direction: row;
      justify-content: flex-end;

      & node-socket {
        margin-right: var(--sn-node-port-socket-offset);
      }
    }

    & .port-label {
      color: var(--sn-sys-on-surface-dim);
      font-size: var(--sn-port-label-size, 12px);
      white-space: nowrap;
    }

    & .controls {
      padding: var(--sn-node-controls-padding, 0 12px);
    }

    & .sn-control-item {
      display: flex;
      flex-direction: column;
      gap: var(--sn-control-gap, 2px);
      margin: var(--sn-control-margin, 4px 0);
    }

    & .sn-control-label {
      font-size: var(--sn-control-label-size, 10px);
      text-transform: uppercase;
      color: var(--sn-sys-on-surface-dim);
      letter-spacing: 0.5px;
    }

    & .sn-control-input {
      background: color-mix(in oklab, var(--sn-sys-surface) 70%, transparent);
      border: 1px solid var(--sn-control-input-border, color-mix(in oklab, currentColor 10%, transparent));
      border-radius: var(--sn-control-input-radius, 4px);
      padding: var(--sn-control-input-padding, 4px 8px);
      color: var(--sn-sys-on-surface);
      font-size: var(--sn-control-input-size, 12px);
      outline: none;
      font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;

      &:focus {
        border-color: var(--sn-node-accent);
      }

      &[readonly] {
        opacity: 0.6;
        cursor: default;
      }
    }
  }

  graph-node[data-svg-shape] > svg > path {
    stroke: var(--sn-shape-stroke, var(--sn-sys-outline));
    stroke-width: var(--sn-shape-stroke-width, 0.4);
  }

  graph-node[data-svg-shape][data-node-tone='inverse'] > svg > path {
    stroke: var(--sn-node-accent);
  }

  graph-node[data-svg-shape][data-selected] > svg > path {
    stroke: var(--sn-sys-accent);
  }

  graph-node[data-svg-shape][data-error] > svg > path {
    stroke: var(--sn-sys-danger);
  }

  graph-node[data-svg-shape][data-processing] > svg > path {
    stroke: var(--sn-node-accent, var(--sn-sys-accent));
  }

  graph-node[data-svg-shape][data-completed] > svg > path {
    stroke: var(--sn-sys-success);
  }

  graph-node[data-svg-shape][data-port-hint] > svg > path {
    stroke: var(--sn-sys-accent);
    stroke-width: var(--sn-shape-port-hint-stroke-width, 0.5);
  }

  /* Preview Area — image/text preview at bottom of node */
  .sn-preview {
    border-top: 1px solid var(--sn-sys-outline);
    border-radius: 0 0 var(--sn-node-radius) var(--sn-node-radius);
    overflow: hidden;
    max-height: 120px;
    background: color-mix(in oklab, var(--sn-sys-surface) 55%, transparent);

    &[hidden] {
      display: none;
    }

    & img {
      width: 100%;
      height: auto;
      display: block;
      object-fit: cover;
      max-height: 120px;
    }

    & .sn-preview-text {
      padding: var(--sn-node-preview-text-padding, 6px 10px);
      font-size: var(--sn-node-preview-text-size, 11px);
      color: var(--sn-sys-on-surface-dim);
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      white-space: pre-wrap;
      word-break: break-all;
      line-height: 1.4;
    }
  }


  @keyframes sn-node-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }

  @keyframes sn-node-error-pulse {
    0%,
    100% {
      box-shadow:
        0 0 16px color-mix(in oklab, var(--sn-sys-danger) 35%, transparent),
        0 0 4px color-mix(in oklab, var(--sn-sys-danger) 50%, transparent);
    }
    50% {
      box-shadow:
        0 0 24px color-mix(in oklab, var(--sn-sys-danger) 50%, transparent),
        0 0 8px color-mix(in oklab, var(--sn-sys-danger) 70%, transparent);
    }
  }

  @keyframes sn-svg-pulse {
    0%,
    100% {
      opacity: 0.7;
      transform: scale(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.05);
    }
  }

  /* Accessibility: reduced motion */
  @media (prefers-reduced-motion: reduce) {
    graph-node {
      transition: none;
      animation: none;
    }
  }

  @media (forced-colors: active) {
    graph-node .sn-node-media-activate::after {
      background: ButtonText;
      forced-color-adjust: none;
    }
  }
`;
