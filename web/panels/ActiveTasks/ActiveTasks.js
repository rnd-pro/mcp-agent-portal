import { Symbiote } from '@symbiotejs/symbiote';
import { stateSync } from '../../state-sync.js';
import template from './ActiveTasks.tpl.js';
import { uiConfirm } from '../../common/ui-dialogs.js';
import css from '../../common/ui-shared.css.js';

export class ActiveTasks extends Symbiote {
  init$ = {
    tasks: {},
  };

  initCallback() {
    this.ref.refreshBtn.onclick = () => this._forceRefresh();

    // Reactive: subscribe to tasks from StateGraph
    this._unsub = stateSync.on('tasks', (tasks) => {
      this.$.tasks = tasks || {};
      this.renderGrid();
    });
  }

  disconnectedCallback() {
    if (this._unsub) this._unsub();
  }

  /** Manual refresh — re-fetch from agent-pool AND trigger re-render from graph */
  async _forceRefresh() {
    this.ref.refreshBtn.style.opacity = '0.5';
    try {
      let res = await fetch('/api/mcp-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverName: 'agent-pool',
          method: 'tools/call',
          params: { name: 'list_tasks', arguments: {} },
        }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      // The MCP call itself triggers notifications which update StateGraph.
      // The reactive subscription above handles the re-render.
      // But for tasks that already exist in agent-pool but not in graph,
      // parse and merge them locally.
      let data = await res.json();
      let text = data.content?.[0]?.text || '';
      try {
        let arr = JSON.parse(text);
        if (Array.isArray(arr) && arr.length > 0) {
          // Merge into local view if state-sync hasn't caught up yet
          let merged = { ...(this.$.tasks || {}) };
          for (let t of arr) {
            if (t.id && !merged[t.id]) {
              merged[t.id] = {
                status: t.status,
                prompt: t.prompt,
                pid: t.pid,
                startedAt: t.startedAt,
                completedAt: t.completedAt,
                eventCount: t.eventCount || 0,
                approvalMode: t.approvalMode,
              };
            }
          }
          this.$.tasks = merged;
          this.renderGrid();
        }
      } catch (e) { console.warn('[ActiveTasks] Failed to parse task list:', e.message); }
    } catch (err) {
      console.error('[ActiveTasks] refresh error:', err);
    } finally {
      this.ref.refreshBtn.style.opacity = '1';
    }
  }

  async cancelTask(taskId) {
    if (!(await uiConfirm(`Cancel task ${taskId.substring(0, 8)}?`))) return;
    try {
      await fetch('/api/mcp-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverName: 'agent-pool',
          method: 'tools/call',
          params: { name: 'cancel_task', arguments: { task_id: taskId } },
        }),
      });
    } catch (err) {
      alert(`Failed to cancel: ${err.message}`);
    }
  }

  renderGrid() {
    let grid = this.ref.contentGrid;
    grid.innerHTML = '';

    let tasks = this.$.tasks;
    let entries = Object.entries(tasks || {});
    if (entries.length === 0) {
      grid.innerHTML = `<div class="ui-empty-state">No active tasks.</div>`;
      return;
    }

    // Sort: running first, then by startedAt desc
    entries.sort(([, a], [, b]) => {
      if (a.status === 'running' && b.status !== 'running') return -1;
      if (b.status === 'running' && a.status !== 'running') return 1;
      return (b.startedAt || 0) - (a.startedAt || 0);
    });

    for (let [taskId, task] of entries) {
      let card = document.createElement('div');
      card.className = 'ui-card';

      let isRunning = task.status === 'running';
      let elapsed = task.startedAt ? Math.floor((Date.now() - task.startedAt) / 1000) : 0;
      let timeStr = elapsed > 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`;

      let badgeClass = 'info';
      if (task.status === 'running') badgeClass = 'success';
      else if (task.status === 'error') badgeClass = 'error';
      else if (task.status === 'cancelled') badgeClass = 'warn';
      else if (task.status === 'done') badgeClass = 'info';

      let promptText = (task.prompt || '').substring(0, 120);
      if ((task.prompt || '').length > 120) promptText += '…';

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div style="font-family:monospace; color:#9ca3af;">${taskId.substring(0, 8)}</div>
          <div class="ui-badge ${badgeClass}">${task.status}</div>
        </div>
        <div>
          <div style="margin-bottom:12px; line-height:1.4;" title="${(task.prompt || '').replace(/"/g, '&quot;')}">${promptText}</div>
          <div style="display:flex; gap:16px; font-size:12px; color:#9ca3af;">
            <span><span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;margin-right:2px">timer</span> ${timeStr}</span>
            ${task.pid ? `<span><span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;margin-right:2px">settings</span> PID: ${task.pid}</span>` : ''}
            ${task.eventCount ? `<span>📊 ${task.eventCount} events</span>` : ''}
          </div>
        </div>
        ${isRunning ? `
        <div style="margin-top:16px; border-top:1px solid #404040; padding-top:16px;">
          <button class="ui-btn danger" data-action="cancel">Cancel</button>
        </div>` : ''}
      `;

      if (isRunning) {
        card.querySelector('[data-action="cancel"]').onclick = () => this.cancelTask(taskId);
      }

      grid.appendChild(card);
    }
  }
}

ActiveTasks.template = template;
ActiveTasks.rootStyles = css;
ActiveTasks.reg('pg-active-tasks');

export default ActiveTasks;
