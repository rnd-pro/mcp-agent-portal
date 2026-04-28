import { Symbiote } from '@symbiotejs/symbiote';
import { api } from '../../app.js';
import template from './PipelineManager.tpl.js';
import css from '../../common/ui-shared.css.js';

export class PipelineManager extends Symbiote {
  init$ = {
    pipelines: [],
    selectedPipelineId: null
  };

  initCallback() {
    this.ref.refreshBtn.onclick = () => this.loadPipelines();
    this.ref.newBtn.onclick = () => this.showCreateForm();
    
    this.loadPipelines();
  }

  async _mcpCall(toolName, args = {}) {
    const res = await fetch("/api/mcp-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serverName: "agent-pool",
        method: "tools/call",
        params: { name: toolName, arguments: args }
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

  async loadPipelines() {
    try {
      this.ref.pipelineList.innerHTML = '<div class="ui-empty-state">Loading...</div>';
      
      let data = await this._mcpCall('list_pipelines', { json: true });
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch(e){ data = []; }
      }
      
      this.$.pipelines = Array.isArray(data) ? data : [];
      this.renderSidebar();
    } catch (err) {
      console.error('Failed to load pipelines:', err);
      this.ref.pipelineList.innerHTML = `<div class="ui-empty-state" style="color:#f87171">Error: ${err.message}</div>`;
    }
  }

  renderSidebar() {
    const list = this.ref.pipelineList;
    list.innerHTML = '';
    
    const pipelines = this.$.pipelines;
    if (!pipelines || pipelines.length === 0) {
      list.innerHTML = '<div class="ui-empty-state">No pipelines found</div>';
      return;
    }
    
    pipelines.forEach(p => {
      const item = document.createElement('div');
      item.className = 'ui-item' + (this.$.selectedPipelineId === p.name ? ' active' : '');
      item.innerHTML = `<div class="ui-item-title">${p.name}</div>`;
      item.onclick = () => {
        this.$.selectedPipelineId = p.name;
        this.renderSidebar();
        this.showPipelineDetails(p);
      };
      list.appendChild(item);
    });
  }

  showPipelineDetails(pipeline) {
    const main = this.ref.mainContent;
    main.innerHTML = '';
    
    const container = document.createElement('div');
    container.className = 'ui-details';
    
    let stepsHtml = pipeline.steps.map(s => `
      <div class="ui-card">
        <div class="ui-card-title" style="margin-bottom:8px; display:flex; align-items:center; gap:8px;">
          ${s.name}
          ${s.trigger ? `<span class="ui-badge warning">⚡ ${s.trigger}</span>` : ''}
        </div>
        <div style="font-family:monospace; margin-bottom:12px; white-space:pre-wrap;">${(s.prompt || '').replace(/</g, '&lt;')}</div>
        <div style="display:flex; gap:8px;">
          ${s.skill ? `<span class="ui-badge info">Skill: ${s.skill}</span>` : ''}
          ${s.timeout ? `<span class="ui-badge">Timeout: ${s.timeout}s</span>` : ''}
          ${s.max_bounces ? `<span class="ui-badge">Max Bounces: ${s.max_bounces}</span>` : ''}
        </div>
      </div>
    `).join('');
    
    container.innerHTML = `
      <div class="ui-details-header">
        <div>
          <h2 class="ui-details-title">${pipeline.name}</h2>
          <div class="ui-details-desc">Steps: ${pipeline.steps.length} | On Error: ${pipeline.on_error || 'stop'}</div>
        </div>
        <button class="ui-btn primary" id="run-btn"><span class="material-symbols-outlined">play_arrow</span> Run Pipeline</button>
      </div>
      <div>
        ${stepsHtml}
      </div>
    `;
    
    container.querySelector('#run-btn').onclick = async () => {
      try {
        await this._mcpCall('run_pipeline', { pipeline_id: pipeline.name });
        alert(`Pipeline ${pipeline.name} started successfully!`);
      } catch (err) {
        alert('Failed to start pipeline: ' + err.message);
      }
    };
    
    main.appendChild(container);
  }

  showCreateForm() {
    this.$.selectedPipelineId = null;
    this.renderSidebar();
    
    this.ref.mainContent.innerHTML = `
      <div class="ui-details">
        <h2 class="ui-details-title">Create New Pipeline</h2>
        <div class="ui-details-desc">Use the AgentChat to ask the AI to design and create a pipeline for you using the create_pipeline tool. Visual builder coming soon!</div>
      </div>
    `;
  }
}

PipelineManager.template = template;
PipelineManager.rootStyles = css;
PipelineManager.reg('pg-pipeline-mgr');

export default PipelineManager;
