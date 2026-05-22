import { Symbiote } from '@symbiotejs/symbiote';
import { mcpCall } from '../../common/mcp-call.js';
import template from './PipelineManager.tpl.js';
import { sharedUiStyles as cssShared } from 'symbiote-node/ui';
import css from './PipelineManager.css.js';
import './PipelineItem.js';
import './PipelineStep.js';

export class PipelineManager extends Symbiote {
  init$ = {
    pipelines: [],
    steps: [],
    selectedPipelineId: null,
    selectedPipelineName: '',
    selectedPipelineDescription: '',
    hasDetail: false,
    hasPipelineDetail: false,
    hasCreateDetail: false,
    hasSteps: false,
    mainEmptyText: 'Select a pipeline or create a new one',
  };

  _pipelines = [];

  initCallback() {
    this.ref.refreshBtn.onclick = () => this.loadPipelines();
    this.ref.newBtn.onclick = () => this.showCreateForm();
    this.addEventListener('pipeline-item-select', (event) => {
      this._selectPipeline(event.detail?.name);
    });
    
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
      isActive: this.$.selectedPipelineId === pipeline.name,
    }));
  }

  _selectPipeline(pipelineId) {
    let pipeline = this._pipelines.find((item) => item.name === pipelineId);
    if (!pipeline) return;
    this.$.selectedPipelineId = pipeline.name;
    this.renderSidebar();
    this.showPipelineDetails(pipeline);
  }

  showPipelineDetails(pipeline) {
    let steps = Array.isArray(pipeline.steps) ? pipeline.steps : [];
    this.set$({
      hasDetail: true,
      hasPipelineDetail: true,
      hasCreateDetail: false,
      selectedPipelineName: pipeline.name ?? '',
      selectedPipelineDescription: `Steps: ${steps.length} | On Error: ${pipeline.on_error || 'stop'}`,
      hasSteps: steps.length > 0,
      steps: steps.map((step) => ({
        name: step.name ?? '',
        prompt: step.prompt || '',
        triggerText: step.trigger ? `Trigger: ${step.trigger}` : '',
        skillText: step.skill ? `Skill: ${step.skill}` : '',
        timeoutText: step.timeout ? `Timeout: ${step.timeout}s` : '',
        maxBouncesText: step.max_bounces ? `Max Bounces: ${step.max_bounces}` : '',
      })),
    });
  }

  showCreateForm() {
    this.$.selectedPipelineId = null;
    this.renderSidebar();
    this.set$({
      hasDetail: true,
      hasPipelineDetail: false,
      hasCreateDetail: true,
      selectedPipelineName: 'Create New Pipeline',
      selectedPipelineDescription: '',
      hasSteps: false,
      steps: [],
    });
  }

  _setPipelineState(message, isError = false) {
    this.ref.pipelineState.hidden = false;
    this.ref.pipelineState.textContent = message;
    if (isError) {
      this.ref.pipelineState.setAttribute('variant', 'error');
    } else {
      this.ref.pipelineState.removeAttribute('variant');
    }
  }

  async runSelectedPipeline() {
    if (!this.$.selectedPipelineId) return;
    try {
      await this._mcpCall('run_pipeline', { pipeline_id: this.$.selectedPipelineId });
      alert(`Pipeline ${this.$.selectedPipelineId} started successfully!`);
    } catch (err) {
      alert('Failed to start pipeline: ' + err.message);
    }
  }
}

PipelineManager.template = template;
PipelineManager.rootStyles = cssShared + css;
PipelineManager.reg('pg-pipeline-mgr');

export default PipelineManager;
