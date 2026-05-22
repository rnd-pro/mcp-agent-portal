import { Symbiote } from '@symbiotejs/symbiote';
import { mcpCall } from '../../common/mcp-call.js';
import template from './PeerReview.tpl.js';
import { sharedUiStyles as css } from 'symbiote-node/ui';

export class PeerReview extends Symbiote {
  init$ = {
    taskId: null,
    status: null
  };

  initCallback() {
    this.ref.refreshBtn.onclick = () => this.pollStatus();
    
    this.querySelector('#consult-btn').onclick = async () => {
      let context = this.querySelector('#pr-context').value;
      let proposal = this.querySelector('#pr-proposal').value;
      let history = this.querySelector('#pr-history').value;
      
      if (!proposal) return alert('Proposal is required');
      
      let consultBtn = this.querySelector('#consult-btn');
      consultBtn.disabled = true;
      this._setConsultButton(consultBtn, 'sync', 'Initiating...', true);
      
      try {
        let resultText = await mcpCall('agent-pool', 'consult_peer', {
          context,
          proposal,
          previous_rounds: history || undefined,
        });
        
        if (typeof resultText === 'object') resultText = JSON.stringify(resultText);
        let match = resultText.match(/Task ID\*\*: \`([a-f0-9-]+)\`/);
        if (match && match[1]) {
          this.$.taskId = match[1];
          this.startPolling();
        } else {
          alert('Failed to parse Task ID from response');
        }
      } catch (err) {
        alert('Failed to initiate consultation: ' + err.message);
      } finally {
        let consultBtn = this.querySelector('#consult-btn');
        consultBtn.disabled = false;
        this._setConsultButton(consultBtn, 'psychology', 'Request Peer Review');
      }
    };
  }
  
  disconnectedCallback() {
    if (this._pollTimer) clearInterval(this._pollTimer);
  }
  
  startPolling() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    this.pollStatus();
    this._pollTimer = setInterval(() => {
      if (this.isConnected && this.$.status === 'running') {
        this.pollStatus();
      }
    }, 3000);
  }

  async pollStatus() {
    if (!this.$.taskId) return;
    
    try {
      let tasks = await mcpCall('agent-pool', 'list_tasks', { json: true });
      if (typeof tasks === 'string') {
        try { tasks = JSON.parse(tasks); } catch { tasks = []; }
      }
      if (!Array.isArray(tasks) && Array.isArray(tasks?.tasks)) {
        tasks = tasks.tasks;
      }
      if (!Array.isArray(tasks)) tasks = [];
      
      let task = tasks.find(t => t.id === this.$.taskId);
      if (!task) {
        this.updateBanner('error', 'Task not found');
        return;
      }
      
      this.$.status = task.status;
      
      if (task.status === 'running') {
        this.updateBanner('running', 'Peer is reviewing your proposal (Running...)');
      } else if (task.status === 'done') {
        this.updateBanner('success', 'Review Complete');
        this.renderResult(task);
      } else if (task.status === 'error') {
        this.updateBanner('error', 'Task failed: ' + task.error);
      } else {
        this.updateBanner('error', 'Task ' + task.status);
      }
    } catch (err) {
      console.error('Poll error', err);
    }
  }
  
  updateBanner(type, message) {
    let banner = this.querySelector('#pr-status-banner');
    banner.hidden = false;
    banner.className = 'ui-banner ' + type;
    
    let icon = 'info';
    if (type === 'running') icon = 'sync';
    if (type === 'success') icon = 'check_circle';
    if (type === 'error') icon = 'error';
    
    let iconEl = document.createElement('span');
    iconEl.className = 'material-symbols-outlined';
    iconEl.textContent = icon;
    if (type === 'running') iconEl.style.animation = 'spin 2s linear infinite';
    banner.replaceChildren(iconEl, document.createTextNode(` ${message}`));
  }
  
  renderResult(task) {
    if (this._pollTimer) clearInterval(this._pollTimer);
    
    mcpCall('agent-pool', 'get_task_result', { task_id: this.$.taskId })
    .then(resultText => {
      let text = typeof resultText === 'string' ? resultText : JSON.stringify(resultText, null, 2);
      
      // Parse verdict
      let verdictClass = 'info';
      if (text.includes('AGREE')) verdictClass = 'success';
      else if (text.includes('DISAGREE')) verdictClass = 'error';
      else if (text.includes('SUGGEST_CHANGES')) verdictClass = 'warning';
      
      let verdictText = text.match(/Verdict:\s*([A-Z_]+)/i)?.[1] || 'UNKNOWN';
      
      let badge = document.createElement('sn-badge');
      badge.setAttribute('variant', verdictClass);
      badge.style.setProperty('--sn-badge-font-size', '14px');
      badge.style.setProperty('--sn-badge-padding', '4px 12px');
      badge.textContent = `Verdict: ${verdictText}`;

      let badgeRow = document.createElement('div');
      badgeRow.style.marginBottom = '16px';
      badgeRow.append(badge);

      let pre = document.createElement('pre');
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.fontSize = '13px';
      pre.style.lineHeight = '1.6';
      pre.textContent = text;

      let preview = document.createElement('div');
      preview.className = 'sm-markdown-preview';
      preview.style.background = 'transparent';
      preview.style.border = 'none';
      preview.style.padding = '0';
      preview.append(pre);

      this.querySelector('#pr-feedback').replaceChildren(badgeRow, preview);
    });
  }

  _setConsultButton(button, icon, label, spinning = false) {
    let iconEl = document.createElement('span');
    iconEl.className = 'material-symbols-outlined';
    iconEl.textContent = icon;
    if (spinning) iconEl.style.animation = 'spin 2s linear infinite';
    button.replaceChildren(iconEl, document.createTextNode(` ${label}`));
  }
}

PeerReview.template = template;
PeerReview.rootStyles = css;
PeerReview.reg('pg-peer-review');

export default PeerReview;
