import { Symbiote } from '@symbiotejs/symbiote';
import { mcpCall } from '../../common/mcp-call.js';
import template from './WorkflowExplorer.tpl.js';
import css from './WorkflowExplorer.css.js';
import { sharedUiStyles as sharedCss } from 'symbiote-node/ui';
import 'symbiote-node/ui';
import './WorkflowItem.js';
import './WorkflowStep.js';

export class WorkflowExplorer extends Symbiote {
  init$ = {
    workflows: [],
    steps: [],
    selectedWorkflowId: null,
    selectedWorkflowName: '',
    workflowListEmptyText: '',
    mainEmptyText: 'Select a workflow to view details',
    hasSelectedWorkflow: false,
    hasSteps: false,
    loadingStep: null,
    onWorkflowSelect: (e) => {
      let workflowName = e.detail?.name
        || e.detail?.item?.name
        || e.currentTarget?.getRootNode?.().host?.$.name;
      let workflow = this._workflows.find(w => w.name === workflowName);
      if (!workflow) return;

      this.$.selectedWorkflowId = workflow.name;
      this.renderSidebar();
      this.showWorkflowDetails(workflow);
    },
    onStepToggle: async (e) => {
      let stepEl = e.currentTarget.getRootNode().host;
      let isExpanded = stepEl.$.isExpanded;

      this.ref.stepsList.querySelectorAll('we-workflow-step').forEach((el) => {
        el.$.isExpanded = false;
      });

      if (!isExpanded) {
        stepEl.$.isExpanded = true;
        if (!stepEl.$.contentLoaded) {
          await this.loadStepContent(stepEl);
          stepEl.$.contentLoaded = true;
        }
      }
    },
  };

  _workflows = [];

  initCallback() {
    this.addEventListener('workflow-item-select', this.$.onWorkflowSelect);
    this.ref.refreshBtn.onclick = () => this.loadWorkflows();
    this.loadWorkflows();
  }

  _mcpCall(toolName, args = {}) {
    return mcpCall('agent-pool', toolName, args);
  }

  async loadWorkflows() {
    try {
      this.$.workflows = [];
      this.$.workflowListEmptyText = 'Loading...';
      
      let data = await this._mcpCall('list_workflows', {});
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch(e){ data = []; }
      }
      
      this._workflows = Array.isArray(data) ? data : [];
      this.renderSidebar();
    } catch (err) {
      console.error('Failed to load workflows:', err);
      this._workflows = [];
      this.$.workflows = [];
      this.$.workflowListEmptyText = `Error: ${err.message}`;
    }
  }

  renderSidebar() {
    let workflows = this._workflows;
    if (!workflows || workflows.length === 0) {
      this.$.workflows = [];
      this.$.workflowListEmptyText = 'No workflows found';
      return;
    }
    
    this.$.workflowListEmptyText = '';
    this.$.workflows = workflows.map((w) => ({
      name: w.name,
      stepCountText: `${w.steps?.length || 0} steps`,
      isActive: this.$.selectedWorkflowId === w.name,
    }));
  }

  showWorkflowDetails(workflow) {
    this.$.selectedWorkflowName = workflow.name;
    this.$.hasSelectedWorkflow = true;

    if (workflow.steps && workflow.steps.length > 0) {
      this.$.hasSteps = true;
      this.$.steps = workflow.steps.map((step) => ({
        id: step.id,
        name: step.name,
        description: step.description || 'No description provided.',
        toolsText: this._formatTools(step.tools),
        isExpanded: false,
        contentLoaded: false,
      }));
    } else {
      this.$.hasSteps = false;
      this.$.steps = [];
    }
  }

  _formatTools(tools) {
    if (!tools) return '';
    let toolList = Array.isArray(tools) ? tools : [tools];
    let names = toolList.map((tool) => typeof tool === 'string' ? tool : tool.name).filter(Boolean);
    return names.length ? `Tools: ${names.join(', ')}` : '';
  }

  async loadStepContent(stepEl) {
    let containerElement = stepEl.ref.markdownContainer;
    let nodeId = stepEl.$.id;
    containerElement.replaceChildren(this.createEmptyState('Fetching markdown content...'));
    try {
      let data = await this._mcpCall('get_workflow_content', { nodeId });
      let md = data;
      if (typeof data !== 'string') {
        md = data?.content || JSON.stringify(data, null, 2);
      }

      let codeBlock = document.createElement('code-block');
      codeBlock.setAttribute('mode-markdown', '');
      containerElement.replaceChildren(codeBlock);
      customElements.whenDefined('code-block').then(() => {
        codeBlock.setContent(md, 'markdown');
      });
    } catch (err) {
      let errorElement = this.createEmptyState(`Failed to load content: ${err.message}`);
      errorElement.style.color = '#f87171';
      containerElement.replaceChildren(errorElement);
    }
  }

  createEmptyState(text) {
    let emptyState = document.createElement('div');
    emptyState.className = 'ui-empty-state';
    emptyState.textContent = text;
    return emptyState;
  }
}

WorkflowExplorer.template = template;
WorkflowExplorer.rootStyles = sharedCss + css;
WorkflowExplorer.reg('pg-workflow-explorer');

export default WorkflowExplorer;
