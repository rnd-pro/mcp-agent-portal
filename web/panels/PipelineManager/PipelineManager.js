import { Symbiote } from '@symbiotejs/symbiote';
import { mcpCall } from '../../common/mcp-call.js';
import template from './PipelineManager.tpl.js';
import { sharedUiStyles as cssShared } from 'symbiote-node/ui';
import css from './PipelineManager.css.js';
import './PipelineItem.js';

export class PipelineManager extends Symbiote {
  init$ = {
    pipelines: [],
    selectedPipelineId: null,
    hasDetail: false,
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
    this.$.hasDetail = true;
    this.renderSidebar();
    this.showPipelineDetails(pipeline);
  }

  showPipelineDetails(pipeline) {
    let main = this.ref.mainContent;

    let details = document.createElement('div');
    details.className = 'ui-details';

    let header = document.createElement('div');
    header.className = 'ui-details-header';

    let titleWrap = document.createElement('div');
    let title = document.createElement('h2');
    title.className = 'ui-details-title';
    title.textContent = pipeline.name ?? '';

    let desc = document.createElement('div');
    desc.className = 'ui-details-desc';
    desc.textContent = `Steps: ${pipeline.steps.length} | On Error: ${pipeline.on_error || 'stop'}`;
    titleWrap.append(title, desc);

    let runBtn = document.createElement('sn-button');
    runBtn.setAttribute('variant', 'primary');
    runBtn.id = 'run-btn';
    let runIcon = document.createElement('span');
    runIcon.className = 'material-symbols-outlined';
    runIcon.textContent = 'play_arrow';
    runBtn.append(runIcon, document.createTextNode(' Run Pipeline'));

    header.append(titleWrap, runBtn);

    let stepsWrap = document.createElement('div');
    for (let step of pipeline.steps) {
      stepsWrap.append(this._renderStepCard(step));
    }

    details.append(header, stepsWrap);
    main.replaceChildren(details);
    
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
    this.$.hasDetail = true;
    this.renderSidebar();

    let details = document.createElement('div');
    details.className = 'ui-details';

    let title = document.createElement('h2');
    title.className = 'ui-details-title';
    title.textContent = 'Create New Pipeline';

    let desc = document.createElement('div');
    desc.className = 'ui-details-desc';
    desc.textContent = 'Use the AgentChat to ask the AI to design and create a pipeline for you using the create_pipeline tool. Visual builder coming soon!';

    details.append(title, desc);
    this.ref.mainContent.replaceChildren(details);
  }

  _renderStepCard(step) {
    let card = document.createElement('sn-card');

    let title = document.createElement('div');
    title.className = 'pm-step-title';
    title.setAttribute('slot', 'title');
    title.append(document.createTextNode(step.name ?? ''));

    if (step.trigger) {
      let trigger = document.createElement('sn-badge');
      trigger.setAttribute('variant', 'warning');
      trigger.textContent = `Trigger: ${step.trigger}`;
      title.append(trigger);
    }

    let prompt = document.createElement('div');
    prompt.className = 'pm-step-prompt';
    prompt.textContent = step.prompt || '';

    let badges = document.createElement('div');
    badges.className = 'pm-step-badges';

    if (step.skill) badges.append(this._badge(`Skill: ${step.skill}`, 'info'));
    if (step.timeout) badges.append(this._badge(`Timeout: ${step.timeout}s`));
    if (step.max_bounces) badges.append(this._badge(`Max Bounces: ${step.max_bounces}`));

    card.append(title, prompt, badges);
    return card;
  }

  _badge(text, variant = '') {
    let badge = document.createElement('sn-badge');
    if (variant) badge.setAttribute('variant', variant);
    badge.textContent = text;
    return badge;
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
}

PipelineManager.template = template;
PipelineManager.rootStyles = cssShared + css;
PipelineManager.reg('pg-pipeline-mgr');

export default PipelineManager;
