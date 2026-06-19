import { html } from '@symbiotejs/symbiote';

export default html`
<div class="wb-shell">
  <sn-banner class="wb-status" ref="statusBanner" hidden></sn-banner>

  <section class="wb-controls" aria-label="Workflow board controls">
    <div class="wb-control-meta">
      <sn-badge ref="modeBadge" variant="info">{{modeLabel}}</sn-badge>
      <span ref="scopeLabel">{{scopeLabel}}</span>
      <span class="wb-board-readout" ref="boardReadout"></span>
    </div>
    <div class="wb-control-actions">
      <sn-button
        ref="pauseBoardBtn"
        variant="icon"
        title="Pause board automation"
        aria-label="Pause board automation">
        <span class="material-symbols-outlined">pause</span>
      </sn-button>
      <sn-button
        ref="resumeBoardBtn"
        variant="icon"
        title="Resume board automation"
        aria-label="Resume board automation">
        <span class="material-symbols-outlined">play_arrow</span>
      </sn-button>
      <sn-button
        ref="drainBoardBtn"
        variant="icon"
        title="Drain board automation"
        aria-label="Drain board automation">
        <span class="material-symbols-outlined">hourglass_bottom</span>
      </sn-button>
      <sn-button
        ref="stopBoardBtn"
        variant="icon"
        title="Stop active workflow runs"
        aria-label="Stop active workflow runs">
        <span class="material-symbols-outlined">stop_circle</span>
      </sn-button>
      <sn-button
        ref="importBtn"
        variant="icon"
        title="Import workflow work items"
        aria-label="Import workflow work items">
        <span class="material-symbols-outlined">upload_file</span>
      </sn-button>
      <sn-button
        ref="reconcileBtn"
        variant="icon"
        title="Reconcile workflow recovery"
        aria-label="Reconcile workflow recovery">
        <span class="material-symbols-outlined">sync_problem</span>
      </sn-button>
      <details class="wb-board-settings" ref="boardSettings">
        <summary class="wb-board-settings-summary" title="Board automation settings" aria-label="Board automation settings">
          <span class="material-symbols-outlined" aria-hidden="true">tune</span>
        </summary>
        <div class="wb-board-settings-panel">
          <div class="wb-settings-form">
            <label class="wb-setting-field">
              <span>Mode</span>
              <select class="wb-setting-control" ref="boardModeSelect">
                <option value="armed">Armed</option>
                <option value="manual">Manual</option>
                <option value="paused">Paused</option>
                <option value="draining">Draining</option>
                <option value="stopped">Stopped</option>
                <option value="recovery_only">Recovery Only</option>
                <option value="maintenance">Maintenance</option>
                <option value="passive">Passive</option>
                <option value="autonomous">Autonomous</option>
              </select>
            </label>
            <label class="wb-setting-field">
              <span>Pickup</span>
              <select class="wb-setting-control" ref="boardPickupSelect">
                <option value="auto">Auto</option>
                <option value="manual">Manual</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
            <label class="wb-setting-field">
              <span>Recovery</span>
              <select class="wb-setting-control" ref="boardRecoverySelect">
                <option value="auto">Auto</option>
                <option value="manual">Manual</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
            <label class="wb-setting-field">
              <span>Parallel limit</span>
              <input class="wb-setting-control" ref="boardParallelInput" type="number" min="1" />
            </label>
            <label class="wb-setting-field">
              <span>Approval</span>
              <select class="wb-setting-control" ref="boardApprovalSelect">
                <option value="">Default</option>
                <option value="plan">Plan</option>
                <option value="auto_edit">Auto Edit</option>
                <option value="yolo">Yolo</option>
              </select>
            </label>
            <label class="wb-setting-field">
              <span>Fallback agents</span>
              <input class="wb-setting-control" ref="boardAgentsInput" placeholder="orchestrator, reviewer" />
            </label>
          </div>
          <div class="wb-board-history" ref="boardHistory"></div>
          <div class="wb-action-row">
            <sn-button ref="saveBoardSettingsBtn" variant="primary">
              <span class="material-symbols-outlined">save</span>
              Save board
            </sn-button>
          </div>
        </div>
      </details>
    </div>
  </section>

  <main class="wb-main">
    <section class="wb-board-region" aria-label="Workflow columns">
      <sn-kanban-board
        class="wb-board"
        ref="boardView"
        label="Workflow columns"
        empty-text="No workflow columns are available."></sn-kanban-board>
      <sn-empty-state class="wb-empty" ref="emptyState" hidden>
        No workflow cards in this scope. Import markdown work items or reconcile recovery
        from the board controls.
      </sn-empty-state>
    </section>
  </main>
</div>
`;
