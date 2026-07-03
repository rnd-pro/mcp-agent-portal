import { html } from '@symbiotejs/symbiote';

// UI-chrome strings (tooltips, aria-labels, field labels, option labels, empty states) are applied
// at init from portal.workflow.* localization keys — see WorkflowBoard.js #localizeChrome().
export default html`
<div class="wb-shell">
  <sn-banner class="wb-status" ref="statusBanner" hidden></sn-banner>

  <section class="wb-controls">
    <div class="wb-control-meta">
      <sn-badge ref="modeBadge" variant="info">{{modeLabel}}</sn-badge>
      <span ref="scopeLabel">{{scopeLabel}}</span>
      <span class="wb-board-readout" ref="boardReadout"></span>
    </div>
    <div class="wb-control-actions">
      <div class="wb-view-toggle" role="group">
        <sn-button
          ref="kanbanViewBtn"
          variant="icon"
          class="wb-view-toggle-btn"
          data-view="kanban"
          aria-pressed="true">
          <span class="material-symbols-outlined">view_kanban</span>
        </sn-button>
        <sn-button
          ref="graphViewBtn"
          variant="icon"
          class="wb-view-toggle-btn"
          data-view="graph"
          aria-pressed="false">
          <span class="material-symbols-outlined">account_tree</span>
        </sn-button>
      </div>
      <sn-button ref="pauseBoardBtn" variant="icon">
        <span class="material-symbols-outlined">pause</span>
      </sn-button>
      <sn-button ref="resumeBoardBtn" variant="icon">
        <span class="material-symbols-outlined">play_arrow</span>
      </sn-button>
      <sn-button ref="drainBoardBtn" variant="icon">
        <span class="material-symbols-outlined">hourglass_bottom</span>
      </sn-button>
      <sn-button ref="stopBoardBtn" variant="icon">
        <span class="material-symbols-outlined">stop_circle</span>
      </sn-button>
      <sn-button ref="importBtn" variant="icon">
        <span class="material-symbols-outlined">upload_file</span>
      </sn-button>
      <sn-button ref="reconcileBtn" variant="icon">
        <span class="material-symbols-outlined">sync_problem</span>
      </sn-button>
      <details class="wb-board-settings" ref="boardSettings">
        <summary class="wb-board-settings-summary">
          <span class="material-symbols-outlined" aria-hidden="true">tune</span>
        </summary>
        <div class="wb-board-settings-panel">
          <div class="wb-settings-form">
            <label class="wb-setting-field">
              <span ref="lblBoardMode"></span>
              <select class="wb-setting-control" ref="boardModeSelect">
                <option value="armed"></option>
                <option value="manual"></option>
                <option value="paused"></option>
                <option value="draining"></option>
                <option value="stopped"></option>
                <option value="recovery_only"></option>
                <option value="maintenance"></option>
                <option value="passive"></option>
                <option value="autonomous"></option>
              </select>
            </label>
            <label class="wb-setting-field">
              <span ref="lblBoardPickup"></span>
              <select class="wb-setting-control" ref="boardPickupSelect">
                <option value="auto"></option>
                <option value="manual"></option>
                <option value="disabled"></option>
              </select>
            </label>
            <label class="wb-setting-field">
              <span ref="lblBoardRecovery"></span>
              <select class="wb-setting-control" ref="boardRecoverySelect">
                <option value="auto"></option>
                <option value="manual"></option>
                <option value="disabled"></option>
              </select>
            </label>
            <label class="wb-setting-field">
              <span ref="lblBoardParallel"></span>
              <input class="wb-setting-control" ref="boardParallelInput" type="number" min="1" />
            </label>
            <label class="wb-setting-field">
              <span ref="lblBoardApproval"></span>
              <select class="wb-setting-control" ref="boardApprovalSelect">
                <option value=""></option>
                <option value="plan"></option>
                <option value="auto_edit"></option>
                <option value="yolo"></option>
              </select>
            </label>
            <label class="wb-setting-field">
              <span ref="lblBoardAgents"></span>
              <input class="wb-setting-control" ref="boardAgentsInput" placeholder="orchestrator, reviewer" />
            </label>
          </div>
          <div class="wb-board-history" ref="boardHistory"></div>
          <div class="wb-action-row">
            <sn-button ref="saveBoardSettingsBtn" variant="primary">
              <span class="material-symbols-outlined">save</span>
              <span ref="saveBoardLabel"></span>
            </sn-button>
          </div>
        </div>
      </details>
    </div>
  </section>

  <main class="wb-main">
    <section class="wb-board-region" ref="kanbanRegion">
      <sn-kanban-board class="wb-board" ref="boardView"></sn-kanban-board>
      <sn-empty-state class="wb-empty" ref="emptyState" hidden></sn-empty-state>
    </section>
    <section class="wb-graph-region" ref="graphRegion" hidden>
      <div class="wb-graph-toolbar">
        <sn-button class="wb-graph-btn" ref="graphFitBtn" variant="icon">
          <span class="material-symbols-outlined">fit_screen</span>
        </sn-button>
        <span class="wb-graph-stats" ref="graphStats"></span>
      </div>
      <canvas-graph class="wb-graph-canvas" ref="graphCanvas"></canvas-graph>
      <sn-empty-state class="wb-graph-empty" ref="graphEmpty" hidden></sn-empty-state>
    </section>
  </main>
</div>
`;
