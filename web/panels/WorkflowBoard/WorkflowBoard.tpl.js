import { html } from '@symbiotejs/symbiote';

export default html`
<div class="wb-shell">
  <header class="wb-header">
    <div class="wb-heading">
      <div class="wb-eyebrow">Workflow Control</div>
      <h2>{{boardTitle}}</h2>
      <p>{{boardDescription}}</p>
    </div>
    <div class="wb-header-meta">
      <sn-badge ref="modeBadge" variant="info">{{modeLabel}}</sn-badge>
      <span ref="scopeLabel">{{scopeLabel}}</span>
      <sn-button ref="reconcileBtn" variant="icon" title="Reconcile workflow recovery" aria-label="Reconcile workflow recovery">
        <span class="material-symbols-outlined">sync_problem</span>
      </sn-button>
      <sn-button ref="refreshBtn" variant="icon" title="Refresh workflow board" aria-label="Refresh workflow board">
        <span class="material-symbols-outlined">refresh</span>
      </sn-button>
    </div>
  </header>

  <sn-banner class="wb-status" ref="statusBanner" hidden></sn-banner>

  <section class="wb-summary" ref="summaryGrid" aria-label="Workflow board counters"></section>

  <section class="wb-filters" aria-label="Workflow board filters">
    <label class="wb-filter">
      <span>Project</span>
      <select ref="projectFilter" aria-label="Filter workflow cards by project"></select>
    </label>
    <div class="wb-filter-readout" ref="filterReadout"></div>
  </section>

  <main class="wb-main">
    <section class="wb-board-region" aria-label="Workflow columns">
      <div class="wb-columns" ref="columns"></div>
      <sn-empty-state class="wb-empty" ref="emptyState" hidden>No workflow cards match this board scope.</sn-empty-state>
    </section>

    <aside class="wb-inspector" aria-label="Selected workflow card" ref="inspector">
      <sn-empty-state class="wb-inspector-empty">Select a workflow card to inspect gates, checks, files, and actions.</sn-empty-state>
    </aside>
  </main>
</div>
`;
