import { Symbiote } from '@symbiotejs/symbiote';
import { mcpCall } from '../../common/mcp-call.js';
import template from './SkillManager.tpl.js';
import { uiConfirm } from '../../common/ui-dialogs.js';
import css from '../../common/ui-shared.css.js';

export class SkillManager extends Symbiote {
  init$ = {
    skills: [],
    selectedSkillName: null,
    selectedSkillTier: null
  };

  initCallback() {
    this.ref.refreshBtn.onclick = () => this.loadSkills();
    this.ref.newBtn.onclick = () => this.showCreateForm();
    
    this.loadSkills();
  }

  _mcpCall(toolName, args = {}) {
    return mcpCall('agent-pool', toolName, args);
  }

  async loadSkills() {
    try {
      this.ref.projectList.innerHTML = '<div class="ui-empty-state">Loading...</div>';
      this.ref.globalList.innerHTML = '';
      this.ref.builtinList.innerHTML = '';
      
      let data = await this._mcpCall('list_skills', { json: true });
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch(e){ data = []; }
      }
      
      this.$.skills = Array.isArray(data) ? data : [];
      this.renderSidebar();
    } catch (err) {
      console.error('Failed to load skills:', err);
      this.ref.projectList.innerHTML = `<div class="ui-empty-state" style="color:#f87171">Error: ${err.message}</div>`;
    }
  }

  renderSidebar() {
    let pList = this.ref.projectList;
    let gList = this.ref.globalList;
    let bList = this.ref.builtinList;
    
    pList.innerHTML = '';
    gList.innerHTML = '';
    bList.innerHTML = '';
    
    let skills = this.$.skills;
    if (!skills || skills.length === 0) {
      pList.innerHTML = '<div class="ui-empty-state">No skills found</div>';
      return;
    }
    
    let pCount = 0, gCount = 0, bCount = 0;
    
    skills.forEach(s => {
      let item = document.createElement('div');
      item.className = 'ui-item' + (this.$.selectedSkillName === s.name && this.$.selectedSkillTier === s.tier ? ' active' : '');
      item.innerHTML = `
        <div class="ui-item-title">${s.name}</div>
        <div class="ui-item-desc" title="${s.description.replace(/"/g, '&quot;')}">${s.description}</div>
      `;
      item.onclick = () => {
        this.$.selectedSkillName = s.name;
        this.$.selectedSkillTier = s.tier;
        this.renderSidebar();
        this.showSkillDetails(s);
      };
      
      if (s.tier === 'project') { pList.appendChild(item); pCount++; }
      else if (s.tier === 'global') { gList.appendChild(item); gCount++; }
      else { bList.appendChild(item); bCount++; }
    });
    
    if (pCount === 0) pList.innerHTML = '<div class="ui-empty-state">None</div>';
    if (gCount === 0) gList.innerHTML = '<div class="ui-empty-state">None</div>';
    if (bCount === 0) bList.innerHTML = '<div class="ui-empty-state">None</div>';
  }

  showSkillDetails(skill) {
    let main = this.ref.mainContent;
    
    let isBuiltin = skill.tier === 'built-in';
    let isProject = skill.tier === 'project';
    
    main.innerHTML = `
      <div class="ui-details">
        <div class="ui-details-header">
          <div>
            <h2 class="ui-details-title">${skill.name} <span class="ui-badge ${skill.tier === 'project' ? 'success' : skill.tier === 'global' ? 'info' : 'warning'}">${skill.tier}</span></h2>
            <div class="ui-details-desc">${skill.description}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:8px;font-family:monospace;">${skill.filePath}</div>
          </div>
          <div style="display:flex;gap:8px;">
            ${isBuiltin || !isProject ? `<button class="ui-btn primary" id="install-btn"><span class="material-symbols-outlined" style="font-size:18px">download</span> Install to Project</button>` : ''}
            ${!isBuiltin ? `<button class="ui-btn danger" id="del-btn"><span class="material-symbols-outlined" style="font-size:18px">delete</span></button>` : ''}
          </div>
        </div>
        
        <div class="ui-card">
          <h3 class="ui-card-title">Preview (Code Viewer)</h3>
          <div style="background: rgba(0,0,0,0.2); padding: 16px; border-radius: 6px; font-size: 14px; line-height: 1.6; border: 1px solid var(--sn-color-border, #404040); white-space: pre-wrap;">Use the Explorer Code Viewer to read or edit this markdown file directly. Agent-pool automatically reloads skills on every run.</div>
        </div>
      </div>
    `;
    
    let installBtn = main.querySelector('#install-btn');
    if (installBtn) {
      installBtn.onclick = async () => {
        try {
          await this._mcpCall('install_skill', { skill_name: skill.name });
          alert(`Skill ${skill.name} installed to project tier!`);
          this.loadSkills();
        } catch (err) {
          alert('Failed to install skill: ' + err.message);
        }
      };
    }
    
    let delBtn = main.querySelector('#del-btn');
    if (delBtn) {
      delBtn.onclick = async () => {
        if (!(await uiConfirm(`Are you sure you want to delete ${skill.name} from the ${skill.tier} tier?`))) return;
        try {
          await this._mcpCall('delete_skill', { skill_name: skill.name, scope: skill.tier });
          this.$.selectedSkillName = null;
          this.loadSkills();
          main.innerHTML = '<div class="ui-empty-state">Skill deleted</div>';
        } catch (err) {
          alert('Failed to delete skill: ' + err.message);
        }
      };
    }
  }

  showCreateForm() {
    this.$.selectedSkillName = null;
    this.$.selectedSkillTier = null;
    this.renderSidebar();
    
    this.ref.mainContent.innerHTML = `
      <div class="ui-details">
        <h2 class="ui-details-title">Create New Skill</h2>
        
        <div class="ui-card">
          <div class="ui-field">
            <label>Skill Name * (kebab-case)</label>
            <input type="text" id="s-name" placeholder="e.g. data-analyst">
          </div>
          <div class="ui-field">
            <label>Description *</label>
            <input type="text" id="s-desc" placeholder="What does this skill do?">
          </div>
          <div class="ui-field">
            <label>Scope / Tier</label>
            <select id="s-scope">
              <option value="project">Project (.gemini/skills)</option>
              <option value="global">Global (~/.gemini/skills)</option>
            </select>
          </div>
          <div class="ui-field">
            <label>Instructions (Markdown) *</label>
            <textarea id="s-inst" placeholder="You are a data analyst..."></textarea>
          </div>
          <button class="ui-btn primary" id="save-btn">Create Skill</button>
        </div>
      </div>
    `;
    
    this.ref.mainContent.querySelector('#save-btn').onclick = async () => {
      let name = this.ref.mainContent.querySelector('#s-name').value;
      let desc = this.ref.mainContent.querySelector('#s-desc').value;
      let scope = this.ref.mainContent.querySelector('#s-scope').value;
      let inst = this.ref.mainContent.querySelector('#s-inst').value;
      
      if (!name || !desc || !inst) return alert('Name, description, and instructions are required');
      
      try {
        await this._mcpCall('create_skill', {
          skill_name: name,
          description: desc,
          instructions: inst,
          scope
        });
        this.loadSkills();
        alert('Skill created!');
      } catch (err) {
        alert('Failed to create skill: ' + err.message);
      }
    };
  }
}

SkillManager.template = template;
SkillManager.rootStyles = css;
SkillManager.reg('pg-skill-manager');

export default SkillManager;
