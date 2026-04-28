import { Symbiote } from '@symbiotejs/symbiote';
import { api } from '../../app.js';
import template from './PeerReview.tpl.js';
import css from '../../common/ui-shared.css.js';
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

export class PeerReview extends Symbiote {
  init$ = {
    taskId: null,
    status: null
  };

  initCallback() {
    this.ref.refreshBtn.onclick = () => this.pollStatus();
    
    this.querySelector('#consult-btn').onclick = async () => {
      const context = this.querySelector('#pr-context').value;
      const proposal = this.querySelector('#pr-proposal').value;
      const history = this.querySelector('#pr-history').value;
      
      if (!proposal) return alert('Proposal is required');
      
      this.querySelector('#consult-btn').disabled = true;
      this.querySelector('#consult-btn').innerHTML = '<span class="material-symbols-outlined" style="animation: spin 2s linear infinite;">sync</span> Initiating...';
      
      try {
        const res = await fetch("/api/mcp-call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serverName: "agent-pool",
            method: "tools/call",
            params: {
              name: 'consult_peer',
              arguments: {
                context,
                proposal,
                previous_rounds: history || undefined
              }
            }
          })
        });
        
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        if (data.isError) throw new Error(data.content?.[0]?.text || "Tool error");
        
        const resultText = data.content?.[0]?.text || '';
        const match = resultText.match(/Task ID\*\*: \`([a-f0-9-]+)\`/);
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
      const res = await fetch("/api/mcp-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverName: "agent-pool",
          method: "tools/call",
          params: { name: 'list_tasks', arguments: { json: true } }
        })
      });
      
      const data = await res.json();
      const text = data.content?.[0]?.text;
      const tasks = JSON.parse(text || '[]');
      
      const task = tasks.find(t => t.id === this.$.taskId);
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
    const banner = this.querySelector('#pr-status-banner');
    banner.style.display = 'flex';
    banner.className = 'ui-banner ' + type;
    
    let icon = 'info';
    if (type === 'running') icon = 'sync';
    if (type === 'success') icon = 'check_circle';
    if (type === 'error') icon = 'error';
    
    banner.innerHTML = `<span class="material-symbols-outlined" ${type==='running'?'style="animation: spin 2s linear infinite;"':''}>${icon}</span> ${message}`;
  }
  
  renderResult(task) {
    if (this._pollTimer) clearInterval(this._pollTimer);
    
    // We need to fetch get_task_result to get the actual text output
    fetch("/api/mcp-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serverName: "agent-pool",
        method: "tools/call",
        params: { name: 'get_task_result', arguments: { task_id: this.$.taskId } }
      })
    })
    .then(r => r.json())
    .then(data => {
      const text = data.content?.[0]?.text || '';
      
      // Parse verdict
      let verdictClass = 'info';
      if (text.includes('AGREE')) verdictClass = 'success';
      else if (text.includes('DISAGREE')) verdictClass = 'error';
      else if (text.includes('SUGGEST_CHANGES')) verdictClass = 'warning';
      
      const verdictText = text.match(/Verdict:\s*([A-Z_]+)/i)?.[1] || 'UNKNOWN';
      
      this.querySelector('#pr-feedback').innerHTML = `
        <div style="margin-bottom:16px;"><span class="ui-badge ${verdictClass}" style="font-size:14px; padding:4px 12px;">Verdict: ${verdictText}</span></div>
        <div class="sm-markdown-preview" style="background:transparent; border:none; padding:0;">${marked.parse(text)}</div>
      `;
    });
  }
}

// Add keyframes for spin
const style = document.createElement('style');
style.textContent = `
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;
document.head.appendChild(style);

PeerReview.template = template;
PeerReview.rootStyles = css;
PeerReview.reg('pg-peer-review');

export default PeerReview;
