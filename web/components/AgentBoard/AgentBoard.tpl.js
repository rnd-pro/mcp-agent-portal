export default /*html*/ `
  <div class="board-header">
    <div class="board-title">Agent Board</div>
    <div class="board-actions">
      <button class="btn-icon" ${{onclick: 'onRefresh'}} title="Refresh Board">
        <span class="material-symbols-outlined">refresh</span>
      </button>
      <button class="btn-icon" ${{onclick: 'onToggleCollapse'}} title="Toggle Board">
        <span class="material-symbols-outlined">{{collapseIcon}}</span>
      </button>
    </div>
  </div>

  <div class="board-content" ${{hidden: 'isCollapsed'}}>
    <div class="board-columns">
      <!-- Queued Column -->
      <div class="board-col">
        <div class="col-header">
          <span>Queued</span>
          <span class="col-count">{{queuedCount}}</span>
        </div>
        <div class="col-cards" itemize="queuedNodes">
          <div class="agent-card status-queued" ${{onclick: 'onCardClick', 'data-chat': 'chatId'}} style="cursor: pointer;">
            <div class="card-header">
              <span class="agent-slug">{{agentSlug}}</span>
              <span class="material-symbols-outlined">schedule</span>
            </div>
            <div class="card-desc">{{description}}</div>
            <div class="card-footer">
              <span class="time-elapsed">{{elapsedText}}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Running Column -->
      <div class="board-col">
        <div class="col-header">
          <span>Running</span>
          <span class="col-count">{{runningCount}}</span>
        </div>
        <div class="col-cards" itemize="runningNodes">
          <div class="agent-card status-running" ${{onclick: 'onCardClick', 'data-chat': 'chatId'}} style="cursor: pointer;">
            <div class="card-header">
              <span class="agent-slug">{{agentSlug}}</span>
              <span class="material-symbols-outlined spin-icon">autorenew</span>
            </div>
            <div class="card-desc">{{description}}</div>
            <div class="card-footer">
              <span class="time-elapsed">{{elapsedText}}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Done Column -->
      <div class="board-col">
        <div class="col-header">
          <span>Done</span>
          <span class="col-count">{{doneCount}}</span>
        </div>
        <div class="col-cards" itemize="doneNodes">
          <div class="agent-card status-done" ${{onclick: 'onCardClick', 'data-chat': 'chatId'}} style="cursor: pointer;">
            <div class="card-header">
              <span class="agent-slug">{{agentSlug}}</span>
              <span class="material-symbols-outlined">check_circle</span>
            </div>
            <div class="card-desc">{{description}}</div>
            <div class="card-footer">
              <span class="time-elapsed">{{elapsedText}}</span>
              <span class="metrics" ${{hidden: 'hideMetrics'}}>{{cost}} | {{tokens}}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Error Column -->
      <div class="board-col">
        <div class="col-header">
          <span>Error</span>
          <span class="col-count">{{errorCount}}</span>
        </div>
        <div class="col-cards" itemize="errorNodes">
          <div class="agent-card status-error" ${{onclick: 'onCardClick', 'data-chat': 'chatId'}} style="cursor: pointer;">
            <div class="card-header">
              <span class="agent-slug">{{agentSlug}}</span>
              <span class="material-symbols-outlined">error</span>
            </div>
            <div class="card-desc">{{description}}</div>
            <div class="card-footer">
              <span class="time-elapsed">{{elapsedText}}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
`;
