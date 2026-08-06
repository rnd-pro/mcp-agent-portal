import { html } from '@symbiotejs/symbiote';

export let template = html`
  <div ref="canvasContainer" class="canvas-container" tabindex="0">
    <div ref="marquee" class="sn-marquee" hidden></div>
    <canvas ref="connCanvas" class="sn-conn-canvas"></canvas>
    <div ref="content" class="content">
      <svg ref="connections" class="sn-connections"></svg>
      <div ref="framesLayer" class="sn-frames"></div>
      <div ref="nodesLayer" class="sn-nodes"></div>
      <svg ref="pseudoSvg" class="pseudo-svg"></svg>
    </div>
    <div ref="focusTransitionMarker" class="sn-focus-transition-marker" aria-hidden="true"></div>
    <quick-toolbar ref="quickToolbar" hidden></quick-toolbar>
    <context-menu ref="contextMenu" hidden></context-menu>
    <node-minimap ref="minimap" hidden></node-minimap>
    <button ref="minimapToggle" class="sn-minimap-toggle" ${{ title: 'minimapToggleTitle' }}>
      <span class="material-symbols-outlined">map</span>
    </button>
    <node-search ref="nodeSearch" hidden></node-search>
    <graph-breadcrumb ref="breadcrumb" hidden></graph-breadcrumb>
  </div>
  <inspector-panel ref="inspector" hidden></inspector-panel>
`;
