import { Symbiote } from '@symbiotejs/symbiote';
import { mcpCall } from '../../common/mcp-call.js';
import template from './PeerReview.tpl.js';
import css from '../../common/ui-shared.css.js';

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
      
      this.querySelector('#consult-btn').disabled = true;
      this.querySelector('#consult-btn').innerHTML = '<span class="material-symbols-outlined" style="animation: spin 2s linear infinite;">sync</span> Initiating...';
      
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
        this.querySelector('#consult-btn').disabled = false;
        this.querySelector('#consult-btn').innerHTML = '<span class="material-symbols-outlined">psychology</span> Request Peer Review';
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
    
    banner.innerHTML = `<span class="material-symbols-outlined" ${type==='running'?'style="animation: spin 2s linear infinite;"':''}>${icon}</span> ${message}`;
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
      
      this.querySelector('#pr-feedback').innerHTML = `
        <div style="margin-bottom:16px;"><span class="ui-badge ${verdictClass}" style="font-size:14px; padding:4px 12px;">Verdict: ${verdictText}</span></div>
        <div class="sm-markdown-preview" style="background:transparent; border:none; padding:0;"><pre style="white-space:pre-wrap;font-size:13px;line-height:1.6;">${this._esc(text)}</pre></div>
      `;
    });
  }

  _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}

PeerReview.template = template;
PeerReview.rootStyles = css;
PeerReview.reg('pg-peer-review');

export default PeerReview;
