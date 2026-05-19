import { Symbiote } from '@symbiotejs/symbiote';
import { mcpCall } from '../../common/mcp-call.js';
import template from './ActiveContext.tpl.js';
import css from './ActiveContext.css.js';
import { events } from '../../dashboard-state.js';

export class ActiveContext extends Symbiote {
  init$ = {
    files: []
  };

  initCallback() {
    this.loadContext();
    
    // Auto-refresh when tools are called
    events.addEventListener('global-tool-event', (e) => {
      let t = e.detail;
      if (t && t.server === 'agent-pool' && (t.tool === 'track_files' || t.tool === 'untrack_files')) {
        setTimeout(() => this.loadContext(), 500);
      }
    });
  }

  async loadContext() {
    try {
      this.ref.fileList.innerHTML = '<div class="ui-empty-state" style="padding:10px;">Loading...</div>';
      let res = await mcpCall('agent-pool', 'get_tracked_files', {});
      
      let data = res;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch(e) { data = { tracked_files: [] }; }
      }
      if (!data) data = { tracked_files: [] };
      
      let files = data.tracked_files || [];
      if (files.length === 0) {
        this.ref.fileList.innerHTML = '<div class="ui-empty-state" style="padding:20px; font-size:12px; color:var(--sn-text-dim); text-align:center;">No files tracked.</div>';
        return;
      }
      
      this.ref.fileList.innerHTML = files.map(f => {
        let name = f.split('/').pop();
        return `
          <div style="padding:6px 8px; border-radius:4px; margin-bottom:4px; background:var(--sn-node-bg); border:1px solid var(--sn-node-border); display:flex; align-items:center; gap:8px;">
            <span class="material-symbols-outlined" style="font-size:14px; color:var(--sn-cat-server);">insert_drive_file</span>
            <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${f}">
              <div style="font-size:12px; font-weight:500;">${name}</div>
              <div style="font-size:10px; color:var(--sn-text-dim); font-family:monospace;">${f}</div>
            </div>
            <button class="ui-btn-icon" style="padding:2px;" onclick="this.closest('pg-active-context').untrack('${f}')">
              <span class="material-symbols-outlined" style="font-size:14px;">close</span>
            </button>
          </div>
        `;
      }).join('');
      
    } catch (err) {
      this.ref.fileList.innerHTML = `<div class="ui-empty-state" style="color:#f87171; padding:10px; font-size:12px;">${err.message}</div>`;
    }
  }

  async untrack(path) {
    try {
      await mcpCall('agent-pool', 'untrack_files', { files: [path] });
      this.loadContext();
    } catch (e) {
      console.error('Untrack failed', e);
    }
  }
}

ActiveContext.template = template;
ActiveContext.rootStyles = css;
ActiveContext.reg('pg-active-context');

export default ActiveContext;
