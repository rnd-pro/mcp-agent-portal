export default `
  <div class="pcb-toolbar">
    <button class="pcb-btn" data-action="fit" title="Fit view">
      <span class="material-symbols-outlined">fit_screen</span>
      FIT
    </button>
    <div class="pcb-toolbar-sep"></div>
    <button class="pcb-btn label-mode-btn pcb-structured-only" data-mode="always" data-active title="Always show labels">LBL:ALW</button>
    <button class="pcb-btn label-mode-btn pcb-structured-only" data-mode="hover" title="Hover labels">LBL:HOV</button>
    <button class="pcb-btn label-mode-btn pcb-structured-only" data-mode="focus" title="Focus labels">LBL:FOC</button>
    <div class="pcb-toolbar-sep pcb-structured-only"></div>
    <button class="pcb-btn pcb-layer-btn pcb-structured-only" data-layer="zones" data-active title="Toggle directory zones">ZONES</button>
    <button class="pcb-btn pcb-layer-btn pcb-structured-only" data-layer="vias" data-active title="Toggle via markers">VIAS</button>
    <div class="pcb-toolbar-sep"></div>
    <button class="pcb-btn" data-action="view-mode" title="Toggle view: Flat <-> Structured">
      <span class="material-symbols-outlined">account_tree</span>
      FLAT
    </button>
    <button class="pcb-btn pcb-structured-only" data-action="path-style" title="Toggle lines: PCB <-> Bezier">
      <span class="material-symbols-outlined">route</span>
      PCB
    </button>
  </div>
  <loading-overlay ref="loader"></loading-overlay>
  <node-canvas connection-engine="canvas"></node-canvas>
  <pg-canvas-graph></pg-canvas-graph>
  <div class="pcb-stats"></div>
`;
