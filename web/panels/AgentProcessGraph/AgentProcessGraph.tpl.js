import { tPortal } from '../../common/localization.js';

export default `
  <graph-explorer-shell>
    <div slot="toolbar" class="graph-explorer-toolbar apg-toolbar">
      <sn-button class="graph-explorer-btn" data-action="fit" title="${tPortal('text.fitView')}">
        <span class="material-symbols-outlined">fit_screen</span>
        FIT
      </sn-button>
      <sn-button class="graph-explorer-btn" data-action="refresh" title="${tPortal('text.refresh')}">
        <span class="material-symbols-outlined">refresh</span>
        LIVE
      </sn-button>
      <div class="graph-explorer-toolbar-sep"></div>
      <span class="apg-title">${tPortal('text.agentProcessGraph')}</span>
    </div>
    <canvas-graph slot="canvas"></canvas-graph>
    <div slot="overlay" class="apg-empty" data-empty>
      <span class="material-symbols-outlined">account_tree</span>
      <span ref="emptyText"></span>
    </div>
    <div slot="stats" class="graph-explorer-stats apg-stats" ref="stats"></div>
  </graph-explorer-shell>
`;
