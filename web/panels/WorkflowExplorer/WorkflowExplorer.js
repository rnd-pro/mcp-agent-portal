import { Symbiote } from '@symbiotejs/symbiote';
import { mcpCall } from '../../common/mcp-call.js';
import template from './WorkflowExplorer.tpl.js';
import css from './WorkflowExplorer.css.js';
import sharedCss from '../../common/ui-shared.css.js';

export class WorkflowExplorer extends Symbiote {
  init$ = {
    workflows: [],
    selectedWorkflowId: null,
    loadingStep: null,
  };

  initCallback() {
    this.ref.refreshBtn.onclick = () => this.loadWorkflows();
    this.loadWorkflows();
  }

  _mcpCall(toolName, args = {}) {
    return mcpCall('context-x', toolName, args);
  }

  async loadWorkflows() {
    try {
      this.ref.workflowList.innerHTML = '<div class="ui-empty-state">Loading...</div>';
      
      let data = await this._mcpCall('list_workflows', {});
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch(e){ data = []; }
      }
      
      this.$.workflows = Array.isArray(data) ? data : [];
      this.renderSidebar();
    } catch (err) {
      console.error('Failed to load workflows:', err);
      this.ref.workflowList.innerHTML = `<div class="ui-empty-state" style="color:#f87171">Error: ${err.message}</div>`;
    }
  }

  renderSidebar() {
    let list = this.ref.workflowList;
    list.innerHTML = '';
    
    let workflows = this.$.workflows;
    if (!workflows || workflows.length === 0) {
      list.innerHTML = '<div class="ui-empty-state">No workflows found</div>';
      return;
    }
    
    workflows.forEach(w => {
      let item = document.createElement('div');
      item.className = 'ui-item' + (this.$.selectedWorkflowId === w.name ? ' active' : '');
      item.innerHTML = `
        <div class="ui-item-title">${w.name}</div>
        <div class="ui-item-desc">${w.steps?.length || 0} steps</div>
      `;
      item.onclick = () => {
        this.$.selectedWorkflowId = w.name;
        this.renderSidebar();
        this.showWorkflowDetails(w);
      };
      list.appendChild(item);
    });
  }

  showWorkflowDetails(workflow) {
    let main = this.ref.mainContent;
    main.innerHTML = '';
    
    let container = document.createElement('div');
    container.className = 'ui-details';
    
    container.innerHTML = `
      <div class="ui-details-header">
        <div>
          <h2 class="ui-details-title">${workflow.name}</h2>
          <div class="ui-details-desc">Workflow Diagram & Steps</div>
        </div>
      </div>
      <div id="steps-container"></div>
    `;
    
    let stepsContainer = container.querySelector('#steps-container');
    
    if (workflow.steps && workflow.steps.length > 0) {
      workflow.steps.forEach(step => {
        let card = document.createElement('div');
        card.className = 'step-card';
        card.innerHTML = `
          <div class="step-header">
            <div>
              <span class="material-symbols-outlined" style="font-size:16px; vertical-align:middle; margin-right:8px; color:var(--sn-cat-server);">psychology</span>
              ${step.name}
            </div>
            <div class="node-id">${step.id}</div>
          </div>
          <div class="step-content">
            <div style="margin-bottom:12px; color:var(--sn-text-dim);">${step.description || 'No description provided.'}</div>
            <div class="step-markdown-container">Loading content...</div>
          </div>
        `;
        
        let header = card.querySelector('.step-header');
        let contentLoaded = false;
        
        header.onclick = async () => {
          let isExpanded = card.classList.contains('expanded');
          
          // Collapse all others
          stepsContainer.querySelectorAll('.step-card').forEach(c => c.classList.remove('expanded'));
          
          if (!isExpanded) {
            card.classList.add('expanded');
            if (!contentLoaded) {
              await this.loadStepContent(step.id, card.querySelector('.step-markdown-container'));
              contentLoaded = true;
            }
          }
        };
        
        stepsContainer.appendChild(card);
      });
    } else {
      stepsContainer.innerHTML = '<div class="ui-empty-state">No steps defined for this workflow</div>';
    }
    
    main.appendChild(container);
  }

  async loadStepContent(nodeId, containerElement) {
    containerElement.innerHTML = '<div class="ui-empty-state">Fetching markdown content...</div>';
    try {
      let md = await this._mcpCall('get_workflow_content', { nodeId });
      if (typeof md !== 'string') {
        md = JSON.stringify(md, null, 2);
      }
      
      // We can use the existing <code-block> component in markdown mode
      containerElement.innerHTML = '<code-block mode-markdown></code-block>';
      let codeBlock = containerElement.querySelector('code-block');
      // Wait for element upgrade
      customElements.whenDefined('code-block').then(() => {
        codeBlock.setContent(md, 'markdown');
      });
    } catch (err) {
      containerElement.innerHTML = `<div class="ui-empty-state" style="color:#f87171">Failed to load content: ${err.message}</div>`;
    }
  }
}

WorkflowExplorer.template = template;
WorkflowExplorer.rootStyles = sharedCss + css;
WorkflowExplorer.reg('pg-workflow-explorer');

export default WorkflowExplorer;
