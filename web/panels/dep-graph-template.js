export default `
  <graph-explorer-shell>
  <div slot="toolbar" class="graph-explorer-toolbar">
    <sn-button class="graph-explorer-btn" data-action="fit" title="Fit view">
      <span class="material-symbols-outlined">fit_screen</span>
      FIT
    </sn-button>
    <div class="graph-explorer-toolbar-sep"></div>
    <sn-button
      class="graph-explorer-btn label-mode-btn graph-explorer-structured-only"
      data-mode="always"
      data-active
      title="Always show labels"
    >LBL:ALW</sn-button>
    <sn-button
      class="graph-explorer-btn label-mode-btn graph-explorer-structured-only"
      data-mode="hover"
      title="Hover labels"
    >LBL:HOV</sn-button>
    <sn-button
      class="graph-explorer-btn label-mode-btn graph-explorer-structured-only"
      data-mode="focus"
      title="Focus labels"
    >LBL:FOC</sn-button>
    <div class="graph-explorer-toolbar-sep graph-explorer-structured-only"></div>
    <sn-button
      class="graph-explorer-btn graph-explorer-layer-btn graph-explorer-structured-only"
      data-layer="zones"
      data-active
      title="Toggle directory zones"
    >ZONES</sn-button>
    <sn-button
      class="graph-explorer-btn graph-explorer-layer-btn graph-explorer-structured-only"
      data-layer="vias"
      title="Toggle via markers"
    >VIAS</sn-button>
    <div class="graph-explorer-toolbar-sep"></div>
    <sn-button class="graph-explorer-btn" data-action="view-mode" title="Toggle view: Flat <-> Structured">
      <span class="material-symbols-outlined">account_tree</span>
      FLAT
    </sn-button>
    <sn-button class="graph-explorer-btn graph-explorer-structured-only" data-action="path-style" title="Toggle lines: PCB <-> Bezier">
      <span class="material-symbols-outlined">route</span>
      PCB
    </sn-button>
    <sn-button class="graph-explorer-btn" data-action="graph-metadata" title="Edit graph metadata">
      <span class="material-symbols-outlined">edit_note</span>
      META
    </sn-button>
    <sn-button class="graph-explorer-btn graph-explorer-flat-only" data-action="cluster-legend" title="Show semantic color legend" hidden>
      <span class="material-symbols-outlined">palette</span>
      COLORS
    </sn-button>
  </div>
  <div slot="legend" class="pcb-clusters" aria-label="Semantic color legend" hidden></div>
  <dialog slot="overlay" class="pcb-metadata-dialog" aria-labelledby="graph-metadata-title">
    <form method="dialog">
      <header>
        <h3 id="graph-metadata-title">Graph Metadata</h3>
        <sn-button class="pcb-icon-btn" variant="icon" data-action="close-graph-metadata" title="Close" aria-label="Close">
          <span class="material-symbols-outlined">close</span>
        </sn-button>
      </header>
      <textarea spellcheck="false" aria-label="Graph metadata JSON" autocomplete="off"></textarea>
      <footer>
        <span class="pcb-metadata-status" role="status" aria-live="polite"></span>
        <sn-button class="graph-explorer-btn" data-action="close-graph-metadata">
          Cancel
        </sn-button>
        <sn-button
          class="graph-explorer-btn"
          data-action="save-graph-metadata"
          aria-label="Save graph metadata"
        >
          <span class="material-symbols-outlined">save</span>
          Save
        </sn-button>
      </footer>
    </form>
  </dialog>
  <sn-loading-overlay slot="overlay" ref="loader"></sn-loading-overlay>
  <node-canvas slot="canvas" connection-engine="canvas"></node-canvas>
  <canvas-graph slot="canvas"></canvas-graph>
  <div slot="stats" class="graph-explorer-stats pcb-stats"></div>
  </graph-explorer-shell>
`;
