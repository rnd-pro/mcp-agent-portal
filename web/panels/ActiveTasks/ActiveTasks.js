import { Symbiote } from '@symbiotejs/symbiote';
import { api } from '../../app.js';
import template from './ActiveTasks.tpl.js';
import css from '../../common/ui-shared.css.js';

export class ActiveTasks extends Symbiote {
  init$ = {
    tasks: [],
  };

  initCallback() {
    this.ref.refreshBtn.onclick = () => this.loadTasks();
    
    // Initial load
    this.loadTasks();
    
    // Auto-refresh every 5 seconds if panel is connected
    this._interval = setInterval(() => {
      if (this.isConnected) {
        this.loadTasks(true); // silent reload
      }
    }, 5000);
  }
  
  disconnectedCallback() {
    clearInterval(this._interval);
  }

  async loadTasks(silent = false) {
    if (!silent) {
      this.ref.refreshBtn.style.opacity = '0.5';
    }
    
    try {
      let res = await api('/api/mcp-call', {
        serverName: 'agent-pool',
        method: 'tools/call',
        params: { name: 'list_tasks', arguments: {} }
      }, 'POST');
      
      // Handle array format or stringified JSON format from our new tool
      let tasksData = [];
      if (Array.isArray(res)) {
        tasksData = res;
      } else if (typeof res === 'string') {
        try {
          tasksData = JSON.parse(res);
        } catch(e) {
          console.error("Failed to parse list_tasks output:", res);
        }
      }
      
      this.$.tasks = tasksData || [];
      this.renderGrid();
    } catch (err) {
      console.error('Failed to load active tasks:', err);
      if (!silent) {
        this.ref.contentGrid.innerHTML = `<div class="ui-empty-state">Error loading tasks: ${err.message}</div>`;
      }
    } finally {
      this.ref.refreshBtn.style.opacity = '1';
    }
  }
  
  // Custom fetch wrapper because app.js api() might not do generic POST calls well
  async _mcpCall(toolName, args) {
    const res = await fetch("/api/mcp-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serverName: "agent-pool",
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args
        }
      })
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    if (data.isError) throw new Error(data.content?.[0]?.text || data.error || "Tool error");
    
    const resultText = data.content?.[0]?.text || data.text || data.response;
    try {
      return JSON.parse(resultText);
    } catch {
      return resultText;
    }
  }

  async cancelTask(taskId) {
    if (!confirm(`Are you sure you want to cancel task ${taskId.substring(0,8)}?`)) return;
    
    try {
      await this._mcpCall('cancel_task', { task_id: taskId });
      // Reload instantly to show it was cancelled
      this.loadTasks();
    } catch (err) {
      alert(`Failed to cancel task: ${err.message}`);
    }
  }

  renderGrid() {
    const grid = this.ref.contentGrid;
    grid.innerHTML = '';
    
    const tasks = this.$.tasks;
    if (!tasks || tasks.length === 0) {
      grid.innerHTML = `<div class="ui-empty-state">No background tasks found in memory.</div>`;
      return;
    }
    
    // Sort so running tasks are first, then sorted by newest
    const sortedTasks = [...tasks].sort((a, b) => {
      if (a.status === 'running' && b.status !== 'running') return -1;
      if (b.status === 'running' && a.status !== 'running') return 1;
      return b.startedAt - a.startedAt;
    });

    sortedTasks.forEach(task => {
      const card = document.createElement('div');
      card.className = 'ui-card';
      
      const isRunning = task.status === 'running';
      const elapsedSec = Math.floor(task.elapsedMs / 1000);
      const timeStr = elapsedSec > 60 ? `${Math.floor(elapsedSec/60)}m ${elapsedSec%60}s` : `${elapsedSec}s`;
      
      let badgeClass = 'info';
      if (task.status === 'running') badgeClass = 'success';
      if (task.status === 'error') badgeClass = 'error';
      
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
          <div style="font-family:monospace; color:#9ca3af;">${task.id.substring(0, 8)}</div>
          <div class="ui-badge ${badgeClass}">${task.status}</div>
        </div>
        <div>
          <div style="margin-bottom:12px; line-height:1.4;" title="${task.prompt.replace(/"/g, '&quot;')}">${task.prompt}</div>
          <div style="display:flex; gap:16px; font-size:12px; color:#9ca3af;">
            <span>⏱️ ${timeStr}</span>
            ${task.pid ? `<span>⚙️ PID: ${task.pid}</span>` : ''}
            ${task.runner && task.runner !== 'local' ? `<span>🚀 Runner: ${task.runner}</span>` : ''}
          </div>
        </div>
        ${isRunning ? `
        <div style="margin-top:16px; border-top:1px solid #404040; padding-top:16px;">
          <button class="ui-btn danger" data-action="cancel">Cancel</button>
        </div>` : ''}
      `;
      
      if (isRunning) {
        card.querySelector('[data-action="cancel"]').onclick = () => this.cancelTask(task.id);
      }
      
      grid.appendChild(card);
    });
  }
}

ActiveTasks.template = template;
ActiveTasks.rootStyles = css;
ActiveTasks.reg('pg-active-tasks');

export default ActiveTasks;
