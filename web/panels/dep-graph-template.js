export default `
  <graph-explorer-shell>
  <div slot="toolbar" class="graph-explorer-toolbar">
    <button class="graph-explorer-btn" data-action="fit" title="Fit view">
      <span class="material-symbols-outlined">fit_screen</span>
      FIT
    </button>
    <div class="graph-explorer-toolbar-sep"></div>
    <button
      class="graph-explorer-btn label-mode-btn graph-explorer-structured-only"
      data-mode="always"
      data-active
      title="Always show labels"
    >LBL:ALW</button>
    <button
      class="graph-explorer-btn label-mode-btn graph-explorer-structured-only"
      data-mode="hover"
      title="Hover labels"
    >LBL:HOV</button>
    <button
      class="graph-explorer-btn label-mode-btn graph-explorer-structured-only"
      data-mode="focus"
      title="Focus labels"
    >LBL:FOC</button>
    <div class="graph-explorer-toolbar-sep graph-explorer-structured-only"></div>
    <button
      class="graph-explorer-btn graph-explorer-layer-btn graph-explorer-structured-only"
      data-layer="zones"
      data-active
      title="Toggle directory zones"
    >ZONES</button>
    <button
      class="graph-explorer-btn graph-explorer-layer-btn graph-explorer-structured-only"
      data-layer="vias"
      title="Toggle via markers"
    >VIAS</button>
    <div class="graph-explorer-toolbar-sep"></div>
    <button class="graph-explorer-btn" data-action="view-mode" title="Toggle view: Flat <-> Structured">
      <span class="material-symbols-outlined">account_tree</span>
      FLAT
    </button>
    <button class="graph-explorer-btn graph-explorer-structured-only" data-action="path-style" title="Toggle lines: PCB <-> Bezier">
      <span class="material-symbols-outlined">route</span>
      PCB
    </button>
    <button class="graph-explorer-btn" data-action="graph-metadata" title="Edit graph metadata">
      <span class="material-symbols-outlined">edit_note</span>
      META
    </button>
    <button class="graph-explorer-btn graph-explorer-flat-only" data-action="cluster-legend" title="Show semantic color legend" hidden>
      <span class="material-symbols-outlined">palette</span>
      COLORS
    </button>
  </div>
  <div slot="legend" class="pcb-clusters" aria-label="Semantic color legend" hidden></div>
  <dialog slot="overlay" class="pcb-metadata-dialog" aria-labelledby="graph-metadata-title">
    <form method="dialog">
      <header>
        <h3 id="graph-metadata-title">Graph Metadata</h3>
        <button class="pcb-icon-btn" value="cancel" type="submit" title="Close" aria-label="Close">
          <span class="material-symbols-outlined">close</span>
        </button>
      </header>
      <textarea spellcheck="false" aria-label="Graph metadata JSON" autocomplete="off"></textarea>
      <footer>
        <span class="pcb-metadata-status" role="status" aria-live="polite"></span>
        <button class="graph-explorer-btn" value="cancel" type="submit" data-action="close-graph-metadata">
          Cancel
        </button>
        <button
          class="graph-explorer-btn"
          data-action="save-graph-metadata"
          value="save"
          type="button"
          aria-label="Save graph metadata"
        >
          <span class="material-symbols-outlined">save</span>
          Save
        </button>
      </footer>
    </form>
  </dialog>
  <sn-loading-overlay
    slot="overlay"
    ref="loader"
    style="--sn-loading-bar-bg: linear-gradient(90deg, #c87533, #d4a04a); --sn-loading-bar-shadow: 0 0 8px rgba(212, 160, 74, 0.5);"
  ></sn-loading-overlay>
  <node-canvas slot="canvas" connection-engine="canvas"></node-canvas>
  <pg-canvas-graph slot="canvas"></pg-canvas-graph>
  <div slot="stats" class="graph-explorer-stats pcb-stats"></div>
  </graph-explorer-shell>
`;
