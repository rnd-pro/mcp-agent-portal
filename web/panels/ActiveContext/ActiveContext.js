import { Symbiote } from '@symbiotejs/symbiote';
import { mcpCall } from '../../common/mcp-call.js';
import template from './ActiveContext.tpl.js';
import css from './ActiveContext.css.js';
import { events } from '../../dashboard-state.js';

function makeEmptyState(message, styles = {}) {
  let node = document.createElement('sn-empty-state');
  node.textContent = message;
  Object.assign(node.style, styles);
  return node;
}

function makeFileRow(file) {
  let row = document.createElement('div');
  Object.assign(row.style, {
    padding: '6px 8px',
    borderRadius: '4px',
    marginBottom: '4px',
    background: 'var(--sn-node-bg)',
    border: '1px solid var(--sn-node-border)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  });

  let icon = document.createElement('span');
  icon.className = 'material-symbols-outlined';
  icon.textContent = 'insert_drive_file';
  Object.assign(icon.style, {
    fontSize: '14px',
    color: 'var(--sn-cat-server)',
  });

  let content = document.createElement('div');
  content.title = file;
  Object.assign(content.style, {
    flex: '1',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  });

  let name = document.createElement('div');
  name.textContent = file.split('/').pop();
  Object.assign(name.style, {
    fontSize: '12px',
    fontWeight: '500',
  });

  let path = document.createElement('div');
  path.textContent = file;
  Object.assign(path.style, {
    fontSize: '10px',
    color: 'var(--sn-text-dim)',
    fontFamily: 'var(--sn-font-mono)',
  });

  let button = document.createElement('sn-button');
  button.setAttribute('variant', 'icon');
  button.dataset.untrack = file;

  let closeIcon = document.createElement('span');
  closeIcon.className = 'material-symbols-outlined';
  closeIcon.textContent = 'close';
  closeIcon.style.fontSize = '14px';

  content.replaceChildren(name, path);
  button.replaceChildren(closeIcon);
  row.replaceChildren(icon, content, button);
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
      this.ref.fileList.replaceChildren(makeEmptyState('Loading...', { padding: '10px' }));
      let res = await mcpCall('agent-pool', 'get_tracked_files', {});
      
      let data = res;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch(e) { data = { tracked_files: [] }; }
      }
      if (!data) data = { tracked_files: [] };
      
      let files = data.tracked_files || [];
      if (files.length === 0) {
        this.ref.fileList.replaceChildren(makeEmptyState('No files tracked.', {
          padding: '20px',
          fontSize: '12px',
          color: 'var(--sn-text-dim)',
          textAlign: 'center',
        }));
        return;
      }
      
      this.ref.fileList.replaceChildren(...files.map(f => makeFileRow(f)));
      
    } catch (err) {
      this.ref.fileList.replaceChildren(makeEmptyState(err.message, {
        color: 'var(--sn-danger-color)',
        padding: '10px',
        fontSize: '12px',
      }));
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
