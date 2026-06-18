import { html } from '@symbiotejs/symbiote';

export default html`
<div class="chat-shell">
  <chat-sidebar></chat-sidebar>

  <chat-workspace class="chat-workspace-view" ref="workspace" sidebar="hidden"></chat-workspace>
  <div class="composer-action-menu" ref="composerActionMenu" hidden>
    <div class="composer-action-menu-surface">
      <button type="button" class="composer-action-item" data-action="planning" aria-pressed="false" ${{ onclick: 'onComposerActionClick' }}>
        <span class="material-symbols-outlined">checklist</span>
        <span class="composer-action-label">{{actionMenuPlanningTitle}}</span>
        <span class="composer-action-switch" data-active="false">
          <span></span>
        </span>
      </button>
      <button type="button" class="composer-action-item" data-action="goal" aria-pressed="false" ${{ onclick: 'onComposerActionClick' }}>
        <span class="material-symbols-outlined">track_changes</span>
        <span class="composer-action-label">{{actionMenuGoalTitle}}</span>
        <span class="composer-action-switch" data-active="false">
          <span></span>
        </span>
      </button>
    </div>
  </div>
  <div class="goal-status" ref="goalStatus" hidden>
    <div class="goal-status-surface">
      <span class="material-symbols-outlined goal-status-icon" ref="goalStatusIcon">track_changes</span>
      <span class="goal-status-main">
        <span class="goal-status-title" ref="goalStatusTitle"></span>
        <span class="goal-status-meta" ref="goalStatusMeta"></span>
        <span class="goal-status-workflow" ref="goalWorkflowMeta" hidden></span>
      </span>
      <div class="goal-status-queue" ref="goalQueuePanel" hidden>
        <span class="goal-status-queue-label" ref="goalQueueLabel"></span>
        <button type="button" class="goal-status-action mode" data-goal-action="queue-goal" ref="goalQueueNowButton" aria-pressed="false" ${{ title: 'goalQueueNowTitle', onclick: 'onGoalLifecycleClick' }}>
          <span class="material-symbols-outlined">bolt</span>
        </button>
        <button type="button" class="goal-status-action mode" data-goal-action="queue-after" ref="goalQueueAfterButton" aria-pressed="true" ${{ title: 'goalQueueAfterTitle', onclick: 'onGoalLifecycleClick' }}>
          <span class="material-symbols-outlined">playlist_add</span>
        </button>
        <button type="button" class="goal-status-action" data-goal-action="clear-queue" ref="goalQueueClearButton" ${{ title: 'goalQueueClearTitle', onclick: 'onGoalLifecycleClick' }}>
          <span class="material-symbols-outlined">playlist_remove</span>
        </button>
      </div>
      <div class="goal-status-actions">
        <button type="button" class="goal-status-action" data-goal-action="open-workflow-board" ref="goalWorkflowButton" ${{ title: 'goalWorkflowTitle', onclick: 'onGoalLifecycleClick' }}>
          <span class="material-symbols-outlined">view_kanban</span>
        </button>
        <button type="button" class="goal-status-action" data-goal-action="cancel-intent" ref="goalCancelButton" ${{ title: 'goalCancelTitle', onclick: 'onGoalLifecycleClick' }}>
          <span class="material-symbols-outlined">close</span>
        </button>
        <button type="button" class="goal-status-action" data-goal-action="pause" ref="goalPauseButton" ${{ title: 'goalPauseTitle', onclick: 'onGoalLifecycleClick' }}>
          <span class="material-symbols-outlined">pause</span>
        </button>
        <button type="button" class="goal-status-action" data-goal-action="resume" ref="goalResumeButton" ${{ title: 'goalResumeTitle', onclick: 'onGoalLifecycleClick' }}>
          <span class="material-symbols-outlined">play_arrow</span>
        </button>
        <button type="button" class="goal-status-action" data-goal-action="stop" ref="goalStopButton" ${{ title: 'goalStopTitle', onclick: 'onGoalLifecycleClick' }}>
          <span class="material-symbols-outlined">stop</span>
        </button>
        <button type="button" class="goal-status-action danger" data-goal-action="delete" ref="goalDeleteButton" ${{ title: 'goalDeleteTitle', onclick: 'onGoalLifecycleClick' }}>
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>
    </div>
  </div>
</div>
`;
