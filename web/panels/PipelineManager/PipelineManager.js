import { Symbiote } from '@symbiotejs/symbiote';
import { mcpCall } from '../../common/mcp-call.js';
import template from './PipelineManager.tpl.js';
import cssShared from '../../common/ui-shared.css.js';
import css from './PipelineManager.css.js';
import './PipelineItem.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export class PipelineManager extends Symbiote {
  init$ = {
    pipelines: [],
    selectedPipelineId: null,
    onPipelineSelect: (e) => {
      let pipelineId = e.currentTarget.dataset.pipelineId;
      let pipeline = this._pipelines.find((item) => item.name === pipelineId);
      if (!pipeline) return;
      this.$.selectedPipelineId = pipeline.name;
      this.renderSidebar();
      this.showPipelineDetails(pipeline);
    },
  };

  _pipelines = [];

  initCallback() {
    this.ref.refreshBtn.onclick = () => this.loadPipelines();
    this.ref.newBtn.onclick = () => this.showCreateForm();
    
    this.loadPipelines();
  }

  _mcpCall(toolName, args = {}) {
    return mcpCall('agent-pool', toolName, args);
  }

  async loadPipelines() {
    try {
      this.$.pipelines = [];
      this._setPipelineState('Loading...');
      
      let data = await this._mcpCall('list_pipelines', { json: true });
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch(e){ data = []; }
      }
      
      this._pipelines = Array.isArray(data) ? data : [];
      this.renderSidebar();
    } catch (err) {
      console.error('Failed to load pipelines:', err);
      this.$.pipelines = [];
      this._setPipelineState(`Error: ${err.message}`, true);
    }
  }

  renderSidebar() {
    this.ref.pipelineState.hidden = true;
    
    let pipelines = this._pipelines;
    if (!pipelines || pipelines.length === 0) {
      this.$.pipelines = [];
      this._setPipelineState('No pipelines found');
      return;
    }
    
    this.$.pipelines = pipelines.map((pipeline) => ({
      name: pipeline.name,
      itemClass: 'ui-item' + (this.$.selectedPipelineId === pipeline.name ? ' active' : ''),
    }));
  }

  showPipelineDetails(pipeline) {
    let main = this.ref.mainContent;
    
    let stepsHtml = pipeline.steps.map(s => `
      <div class="ui-card">
        <div class="ui-card-title" style="margin-bottom:8px; display:flex; align-items:center; gap:8px;">
          ${escapeHtml(s.name)}
          ${s.trigger ? `<span class="ui-badge warning">⚡ ${escapeHtml(s.trigger)}</span>` : ''}
        </div>
        <div style="font-family:monospace; margin-bottom:12px; white-space:pre-wrap;">${escapeHtml(s.prompt || '')}</div>
        <div style="display:flex; gap:8px;">
          ${s.skill ? `<span class="ui-badge info">Skill: ${escapeHtml(s.skill)}</span>` : ''}
          ${s.timeout ? `<span class="ui-badge">Timeout: ${escapeHtml(s.timeout)}s</span>` : ''}
          ${s.max_bounces ? `<span class="ui-badge">Max Bounces: ${escapeHtml(s.max_bounces)}</span>` : ''}
        </div>
      </div>
    `).join('');
    
    main.innerHTML = `
      <div class="ui-details">
      <div class="ui-details-header">
        <div>
          <h2 class="ui-details-title">${escapeHtml(pipeline.name)}</h2>
          <div class="ui-details-desc">Steps: ${pipeline.steps.length} | On Error: ${escapeHtml(pipeline.on_error || 'stop')}</div>
        </div>
        <button class="ui-btn primary" id="run-btn"><span class="material-symbols-outlined">play_arrow</span> Run Pipeline</button>
      </div>
      <div>
        ${stepsHtml}
      </div>
      </div>
    `;
    
    main.querySelector('#run-btn').onclick = async () => {
      try {
        await this._mcpCall('run_pipeline', { pipeline_id: pipeline.name });
        alert(`Pipeline ${pipeline.name} started successfully!`);
      } catch (err) {
        alert('Failed to start pipeline: ' + err.message);
      }
    };
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

  _setPipelineState(message, isError = false) {
    this.ref.pipelineState.hidden = false;
    this.ref.pipelineState.textContent = message;
    this.ref.pipelineState.style.color = isError ? '#f87171' : '';
  }
}

PipelineManager.template = template;
PipelineManager.rootStyles = cssShared + css;
PipelineManager.reg('pg-pipeline-mgr');

export default PipelineManager;
