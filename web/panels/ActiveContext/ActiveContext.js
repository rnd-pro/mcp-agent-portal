import { Symbiote } from '@symbiotejs/symbiote';
import { mcpCall } from '../../common/mcp-call.js';
import template from './ActiveContext.tpl.js';
import css from './ActiveContext.css.js';
import { events } from '../../dashboard-state.js';

function makeEmptyState(message, variant = '') {
  let node = document.createElement('sn-empty-state');
  node.textContent = message;
  if (variant) node.className = variant;
  return node;
}

function makeFileRow(file) {
  let row = document.createElement('div');
  row.className = 'ctx-file-row';

  let item = document.createElement('sn-list-item');
  item.className = 'ctx-file-item';
  item.title = file;
  let listItem = {
    icon: 'insert_drive_file',
    label: file.split('/').pop(),
    description: file,
  };
  if (typeof item.setItem === 'function') {
    item.setItem(listItem);
  } else {
    customElements.whenDefined('sn-list-item').then(() => item.setItem(listItem));
  }

  let button = document.createElement('sn-button');
  button.setAttribute('variant', 'icon');
  button.setAttribute('title', 'Untrack file');
  button.dataset.untrack = file;

  let closeIcon = document.createElement('span');
  closeIcon.className = 'material-symbols-outlined';
  closeIcon.textContent = 'close';

  button.replaceChildren(closeIcon);
  row.replaceChildren(item, button);
  return row;
}

export class ActiveContext extends Symbiote {
  init$ = {
    files: [],
    onRefresh: () => {
      this.loadContext();
    },
  };

  initCallback() {
    this.loadContext();

    // Delegated click handler for untrack buttons
    this.ref.fileList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-untrack]');
      if (btn) this.untrack(btn.dataset.untrack);
    });
    
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
      this.ref.fileList.replaceChildren(makeEmptyState('Loading...', 'ctx-empty-loading'));
      let res = await mcpCall('agent-pool', 'get_tracked_files', {});
      
      let data = res;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch(e) { data = { tracked_files: [] }; }
      }
      if (!data) data = { tracked_files: [] };
      
      let files = data.tracked_files || [];
      if (files.length === 0) {
        this.ref.fileList.replaceChildren(makeEmptyState('No files tracked.', 'ctx-empty-muted'));
        return;
      }
      
      this.ref.fileList.replaceChildren(...files.map(f => makeFileRow(f)));
      
    } catch (err) {
      this.ref.fileList.replaceChildren(makeEmptyState(err.message, 'ctx-empty-error'));
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
