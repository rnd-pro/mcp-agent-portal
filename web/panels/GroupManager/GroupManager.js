import { Symbiote } from '@symbiotejs/symbiote';
import { api } from '../../app.js';
import template from './GroupManager.tpl.js';
import css from '../../common/ui-shared.css.js';

export class GroupManager extends Symbiote {
  init$ = {
    groups: [],
    selectedGroupName: null
  };

  initCallback() {
    this.ref.refreshBtn.onclick = () => this.loadGroups();
    this.ref.newBtn.onclick = () => this.showCreateForm();
    
    this.loadGroups();
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

  async loadGroups() {
    try {
      this.ref.groupList.innerHTML = '<div class="ui-empty-state">Loading...</div>';
      
      let data = await this._mcpCall('list_groups', { json: true });
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch(e){ data = []; }
      }
      
      this.$.groups = Array.isArray(data) ? data : [];
      this.renderSidebar();
    } catch (err) {
      console.error('Failed to load groups:', err);
      this.ref.groupList.innerHTML = `<div class="ui-empty-state" style="color:#f87171">Error: ${err.message}</div>`;
    }
  }

  renderSidebar() {
    const list = this.ref.groupList;
    list.innerHTML = '';
    
    const groups = this.$.groups;
    if (!groups || groups.length === 0) {
      list.innerHTML = '<div class="ui-empty-state">No groups found</div>';
      return;
    }
    
    groups.forEach(g => {
      const item = document.createElement('div');
      item.className = 'ui-item' + (this.$.selectedGroupName === g.name ? ' active' : '');
      item.innerHTML = `<span class="ui-item-title">${g.name}</span> <span class="ui-item-desc">${g.max_agents ? g.max_agents + ' max' : ''}</span>`;
      item.onclick = () => {
        this.$.selectedGroupName = g.name;
        this.renderSidebar();
        this.showGroupDetails(g);
      };
      list.appendChild(item);
    });
  }

  showGroupDetails(group) {
    const main = this.ref.mainContent;
    
    main.innerHTML = `
      <div class="ui-details">
        <h2 class="ui-details-title">${group.name}</h2>
        
        <div class="ui-card">
          <h3 class="ui-card-title">Configuration</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div class="ui-field">
              <label>Default Runner</label>
              <div style="padding:8px;background:rgba(0,0,0,0.2);border-radius:4px;">${group.runner || 'Inherit'}</div>
            </div>
            <div class="ui-field">
              <label>Default Skill</label>
              <div style="padding:8px;background:rgba(0,0,0,0.2);border-radius:4px;">${group.skill || 'None'}</div>
            </div>
            <div class="ui-field">
              <label>Default Policy</label>
              <div style="padding:8px;background:rgba(0,0,0,0.2);border-radius:4px;">${group.policy || 'None'}</div>
            </div>
            <div class="ui-field">
              <label>Max Agents</label>
              <div style="padding:8px;background:rgba(0,0,0,0.2);border-radius:4px;">${group.max_agents || 'Unlimited'}</div>
            </div>
          </div>
        </div>
        
        <div class="ui-card">
          <h3 class="ui-card-title">Launch Swarm (delegate_to_group)</h3>
          <div class="ui-field">
            <label>Prompt</label>
            <textarea id="swarm-prompt" placeholder="What should the swarm do? E.g. 'Analyze these 5 files...'"></textarea>
          </div>
          <div class="ui-field">
            <label>Count (Number of agents)</label>
            <input type="number" id="swarm-count" value="1" min="1" max="50">
          </div>
          <button class="ui-btn primary" id="launch-btn"><span class="material-symbols-outlined">rocket_launch</span> Launch</button>
        </div>
      </div>
    `;
    
    main.querySelector('#launch-btn').onclick = async () => {
      const prompt = main.querySelector('#swarm-prompt').value;
      const count = parseInt(main.querySelector('#swarm-count').value, 10);
      if (!prompt) return alert('Prompt is required');
      
      try {
        await this._mcpCall('delegate_task', {
          prompt,
          group: group.name,
          count
        });
        alert(`Successfully launched ${count} agents in group ${group.name}`);
      } catch (err) {
        alert('Failed to launch swarm: ' + err.message);
      }
    };
  }

  showCreateForm() {
    this.$.selectedGroupName = null;
    this.renderSidebar();
    
    this.ref.mainContent.innerHTML = `
      <div class="ui-details">
        <h2 class="ui-details-title">Create New Group</h2>
        
        <div class="ui-card">
          <div class="ui-field">
            <label>Group Name *</label>
            <input type="text" id="g-name" placeholder="e.g. frontend-team">
          </div>
          <div class="ui-field">
            <label>Runner</label>
            <input type="text" id="g-runner" placeholder="local">
          </div>
          <div class="ui-field">
            <label>Skill</label>
            <input type="text" id="g-skill" placeholder="code-reviewer">
          </div>
          <div class="ui-field">
            <label>Max Agents</label>
            <input type="number" id="g-max" placeholder="e.g. 5">
          </div>
          <button class="ui-btn primary" id="save-btn">Create Group</button>
        </div>
      </div>
    `;
    
    this.ref.mainContent.querySelector('#save-btn').onclick = async () => {
      const name = this.ref.mainContent.querySelector('#g-name').value;
      const runner = this.ref.mainContent.querySelector('#g-runner').value;
      const skill = this.ref.mainContent.querySelector('#g-skill').value;
      const maxAgents = this.ref.mainContent.querySelector('#g-max').value;
      
      if (!name) return alert('Name is required');
      
      try {
        await this._mcpCall('create_group', {
          name,
          runner: runner || undefined,
          skill: skill || undefined,
          max_agents: maxAgents ? parseInt(maxAgents, 10) : undefined
        });
        this.loadGroups();
        alert('Group created!');
      } catch (err) {
        alert('Failed to create group: ' + err.message);
      }
    };
  }
}

GroupManager.template = template;
GroupManager.rootStyles = css;
GroupManager.reg('pg-group-manager');

export default GroupManager;
