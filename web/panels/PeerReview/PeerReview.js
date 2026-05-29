import { Symbiote } from '@symbiotejs/symbiote';
import { mcpCall } from '../../common/mcp-call.js';
import { tPortal } from '../../common/localization.js';
import template from './PeerReview.tpl.js';
import { sharedUiStyles as css } from 'symbiote-node/ui';
import localCss from './PeerReview.css.js';

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
        this.updateBanner('error', tPortal('text.taskNotFound'));
        return;
      }
      
      this.$.status = task.status;
      
      if (task.status === 'running') {
        this.updateBanner('running', tPortal('text.peerReviewRunning'));
      } else if (task.status === 'done') {
        this.updateBanner('success', tPortal('text.reviewComplete'));
        this.renderResult(task);
      } else if (task.status === 'error') {
        this.updateBanner('error', tPortal('text.taskFailed', { message: task.error }));
      } else {
        this.updateBanner('error', tPortal('text.taskStatus', { status: task.status }));
      }
    } catch (err) {
      console.error('Poll error', err);
    }
  }
  
  updateBanner(type, message) {
    let banner = this.querySelector('#pr-status-banner');
    banner.removeAttribute('hidden');
    banner.setAttribute('variant', type);
    
    let icon = 'info';
    if (type === 'running') icon = 'sync';
    if (type === 'success') icon = 'check_circle';
    if (type === 'error') icon = 'error';
    
    let iconEl = document.createElement('span');
    iconEl.className = 'material-symbols-outlined';
    iconEl.textContent = icon;
    banner.replaceChildren(iconEl, document.createTextNode(message));
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
      badge.className = 'pr-verdict-badge';
      badge.textContent = `Verdict: ${verdictText}`;

      let badgeRow = document.createElement('div');
      badgeRow.className = 'pr-verdict-row';
      badgeRow.append(badge);

      let pre = document.createElement('pre');
      pre.className = 'pr-result-text';
      pre.textContent = text;

      let preview = document.createElement('div');
      preview.className = 'sm-markdown-preview pr-result-preview';
      preview.append(pre);

      this.querySelector('#pr-feedback').replaceChildren(badgeRow, preview);
    });
  }

  _setConsultButton(button, icon, label, spinning = false) {
    let iconEl = document.createElement('span');
    iconEl.className = 'material-symbols-outlined';
    iconEl.textContent = icon;
    iconEl.classList.toggle('pr-spin', spinning);
    button.replaceChildren(iconEl, document.createTextNode(` ${label}`));
  }
}

PeerReview.template = template;
PeerReview.rootStyles = css + localCss;
PeerReview.reg('pg-peer-review');

export default PeerReview;
