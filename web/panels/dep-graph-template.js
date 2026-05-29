import { tPortal } from '../common/localization.js';

export default `
  <graph-explorer-shell>
  <div slot="toolbar" class="graph-explorer-toolbar">
    <sn-button class="graph-explorer-btn" data-action="fit" title="${tPortal('text.fitView')}">
      <span class="material-symbols-outlined">fit_screen</span>
      FIT
    </sn-button>
    <div class="graph-explorer-toolbar-sep"></div>
    <sn-button
      class="graph-explorer-btn label-mode-btn graph-explorer-structured-only"
      data-mode="always"
      data-active
      title="${tPortal('text.alwaysShowLabels')}"
    >LBL:ALW</sn-button>
    <sn-button
      class="graph-explorer-btn label-mode-btn graph-explorer-structured-only"
      data-mode="hover"
      title="${tPortal('text.hoverLabels')}"
    >LBL:HOV</sn-button>
    <sn-button
      class="graph-explorer-btn label-mode-btn graph-explorer-structured-only"
      data-mode="focus"
      title="${tPortal('text.focusLabels')}"
    >LBL:FOC</sn-button>
    <div class="graph-explorer-toolbar-sep graph-explorer-structured-only"></div>
    <sn-button
      class="graph-explorer-btn graph-explorer-layer-btn graph-explorer-structured-only"
      data-layer="zones"
      data-active
      title="${tPortal('text.toggleDirectoryZones')}"
    >ZONES</sn-button>
    <sn-button
      class="graph-explorer-btn graph-explorer-layer-btn graph-explorer-structured-only"
      data-layer="vias"
      title="${tPortal('text.toggleViaMarkers')}"
    >VIAS</sn-button>
    <div class="graph-explorer-toolbar-sep"></div>
    <sn-button class="graph-explorer-btn" data-action="view-mode" title="${tPortal('text.toggleGraphView')}">
      <span class="material-symbols-outlined">account_tree</span>
      FLAT
    </sn-button>
    <sn-button class="graph-explorer-btn graph-explorer-structured-only" data-action="path-style" title="${tPortal('text.toggleGraphLines')}">
      <span class="material-symbols-outlined">route</span>
      PCB
    </sn-button>
    <sn-button class="graph-explorer-btn" data-action="graph-metadata" title="${tPortal('text.editGraphMetadata')}">
      <span class="material-symbols-outlined">edit_note</span>
      META
    </sn-button>
    <sn-button class="graph-explorer-btn graph-explorer-flat-only" data-action="cluster-legend" title="${tPortal('text.showSemanticColorLegend')}" hidden>
      <span class="material-symbols-outlined">palette</span>
      COLORS
    </sn-button>
  </div>
  <div slot="legend" class="pcb-clusters" aria-label="${tPortal('text.semanticColorLegend')}" hidden></div>
  <dialog slot="overlay" class="pcb-metadata-dialog" aria-labelledby="graph-metadata-title">
    <form method="dialog">
      <header>
        <h3 id="graph-metadata-title">${tPortal('text.graphMetadata')}</h3>
        <sn-button class="pcb-icon-btn" variant="icon" data-action="close-graph-metadata" title="${tPortal('text.close')}" aria-label="${tPortal('text.close')}">
          <span class="material-symbols-outlined">close</span>
        </sn-button>
      </header>
      <textarea spellcheck="false" aria-label="${tPortal('text.graphMetadataJson')}" autocomplete="off"></textarea>
      <footer>
        <span class="pcb-metadata-status" role="status" aria-live="polite"></span>
        <sn-button class="graph-explorer-btn" data-action="close-graph-metadata">
          ${tPortal('text.cancel')}
        </sn-button>
        <sn-button
          class="graph-explorer-btn"
          data-action="save-graph-metadata"
          aria-label="${tPortal('text.saveGraphMetadata')}"
        >
          <span class="material-symbols-outlined">save</span>
          ${tPortal('text.save')}
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
