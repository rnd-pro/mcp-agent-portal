import { Symbiote } from '@symbiotejs/symbiote';
import { stateSync } from '../../state-sync.js';
import { tPortal } from '../../common/localization.js';
import template from './ActiveTasks.tpl.js';
import { sharedUiStyles as cssShared, uiConfirm } from 'symbiote-node/ui';
import css from './ActiveTasks.css.js';
import './TaskCard.js';

export class ActiveTasks extends Symbiote {
  init$ = {
    tasks: [],
    onCancelTask: async (e) => {
      await this.cancelTask(e.currentTarget.dataset.taskId);
    },
    onFinishTask: async (e) => {
      await this.finishTask(e.currentTarget.dataset.taskId);
    },
  };

  _tasksById = {};

  initCallback() {
    this.ref.refreshBtn.onclick = () => this._forceRefresh();

    // Reactive: subscribe to tasks from StateGraph
    this._unsub = stateSync.on('tasks', (tasks) => {
      this._tasksById = tasks || {};
      this.renderGrid();
    });
  }

  disconnectedCallback() {
    if (this._unsub) this._unsub();
  }

  /** Manual refresh — re-fetch from agent-pool AND trigger re-render from graph */
  async _forceRefresh() {
    this.ref.refreshBtn.classList.add('at-refreshing');
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
      let text = data.result?.content?.[0]?.text || data.content?.[0]?.text || '';
      try {
        let parsed = JSON.parse(text);
        let list = Array.isArray(parsed) ? { tasks: parsed, staleProcesses: [] } : parsed;
        let taskList = Array.isArray(list?.tasks) ? list.tasks : [];
        let staleProcesses = Array.isArray(list?.staleProcesses) ? list.staleProcesses : [];
        if (taskList.length > 0 || staleProcesses.length > 0) {
          // Merge into local view if state-sync hasn't caught up yet
          let merged = { ...(this._tasksById || {}) };
          for (let t of taskList) {
            if (!t.id) continue;
            merged[t.id] = {
              ...(merged[t.id] || {}),
              status: t.status,
              prompt: t.prompt,
              pid: t.pid,
              startedAt: t.startedAt,
              completedAt: t.completedAt,
              eventCount: t.eventCount || merged[t.id]?.eventCount || 0,
              approvalMode: t.approvalMode,
              trackedChildren: t.trackedChildren || [],
            };
          }
          for (let p of staleProcesses) {
            if (!p.taskId) continue;
            merged[p.taskId] = {
              ...(merged[p.taskId] || {}),
              status: 'stale',
              prompt: tPortal('text.trackedProcessWithoutTask', { label: p.label || 'process' }),
              pid: p.pid,
              startedAt: p.startTime,
              eventCount: 0,
              trackedChildren: [p],
              isStaleProcess: true,
            };
          }
          this._tasksById = merged;
          this.renderGrid();
        }
      } catch (e) { console.warn('[ActiveTasks] Failed to parse task list:', e.message); }
    } catch (err) {
      console.error('[ActiveTasks] refresh error:', err);
    } finally {
      this.ref.refreshBtn.classList.remove('at-refreshing');
    }
  }

  async cancelTask(taskId) {
    if (!(await uiConfirm(tPortal('text.cancelTaskConfirm', { id: taskId.substring(0, 8) })))) return;
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
      await this._forceRefresh();
    } catch (err) {
      alert(tPortal('text.cancelTaskFailed', { message: err.message }));
    }
  }

  async finishTask(taskId) {
    if (!(await uiConfirm(tPortal('text.finishTaskConfirm', { id: taskId.substring(0, 8) })))) return;
    try {
      await fetch('/api/mcp-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverName: 'agent-pool',
          method: 'tools/call',
          params: { name: 'finish_task', arguments: { task_id: taskId } },
        }),
      });
      await this._forceRefresh();
    } catch (err) {
      alert(tPortal('text.finishTaskFailed', { message: err.message }));
    }
  }

  renderGrid() {
    this.$.tasks = [];
    this.ref.emptyState.hidden = true;

    let tasks = this._tasksById;
    let entries = Object.entries(tasks || {});
    if (entries.length === 0) {
      this.ref.emptyState.hidden = false;
      this.ref.emptyState.textContent = tPortal('text.noActiveTasks');
      return;
    }

    // Sort: running first, then by startedAt desc
    entries.sort(([, a], [, b]) => {
      if (a.status === 'running' && b.status !== 'running') return -1;
      if (b.status === 'running' && a.status !== 'running') return 1;
      return (b.startedAt || 0) - (a.startedAt || 0);
    });

    this.$.tasks = entries.map(([taskId, task]) => {
      let isRunning = task.status === 'running';
      let elapsed = task.startedAt ? Math.floor((Date.now() - task.startedAt) / 1000) : 0;
      let timeStr = elapsed > 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`;

      let badgeVariant = 'info';
      if (task.status === 'running') badgeVariant = 'success';
      else if (task.status === 'error') badgeVariant = 'error';
      else if (task.status === 'cancelled') badgeVariant = 'warning';
      else if (task.status === 'stale') badgeVariant = 'warning';
      else if (task.status === 'done') badgeVariant = 'info';

      let promptText = (task.prompt || '').substring(0, 120);
      if ((task.prompt || '').length > 120) promptText += '…';

      return {
        id: taskId,
        shortId: taskId.substring(0, 8),
        status: task.status,
        badgeVariant,
        slug: task.slug || '',
        description: promptText,
        fullDescription: task.prompt || '',
        duration: timeStr,
        chatName: task.chatName || '',
        pid: task.pid || '',
        events: task.eventCount ? String(task.eventCount) : '',
        trackedChildren: task.trackedChildren?.length ? String(task.trackedChildren.length) : '',
        hidePid: !task.pid,
        hideEvents: !task.eventCount,
        hideTracked: !task.trackedChildren?.length,
        hideCancel: !isRunning,
        hideFinish: false,
      };
    });
  }
}

ActiveTasks.template = template;
ActiveTasks.rootStyles = cssShared + css;
ActiveTasks.reg('pg-active-tasks');

export default ActiveTasks;
