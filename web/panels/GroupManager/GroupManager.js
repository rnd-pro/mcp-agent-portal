import { Symbiote } from '@symbiotejs/symbiote';
import { mcpCall } from '../../common/mcp-call.js';
import template from './GroupManager.tpl.js';
import { sharedUiStyles as cssShared } from 'symbiote-node/ui';
import cssLocal from './GroupManager.css.js';

const PROVIDERS = ['codex', 'claude', 'opencode', 'gemini'];
const DEFAULT_MODELS = {
  codex: ['default'],
  claude: ['default', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 'claude-sonnet-4-6'],
  opencode: ['default', 'openrouter/deepseek/deepseek-v4-pro', 'openrouter/deepseek/deepseek-v4-flash'],
  gemini: ['default', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
};

function cloneGroup(group) {
  return {
    ...group,
    profiles: Array.isArray(group.profiles) ? group.profiles.map(p => ({ ...p })) : [],
  };
}

function makeElement(tagName, className = '', text = '') {
  let node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function makeEmptyState(message, isError = false) {
  let node = makeElement('sn-empty-state', '', message);
  if (isError) node.setAttribute('variant', 'error');
  return node;
}

function makeIcon(name) {
  return makeElement('span', 'material-symbols-outlined', name);
}

function makeIconButton(className = '') {
  let button = makeElement('sn-button', className);
  button.setAttribute('variant', 'icon');
  return button;
}

function makeOption(value, selected = false) {
  let option = document.createElement('option');
  option.value = value;
  option.textContent = value;
  option.selected = selected;
  return option;
}

export class GroupManager extends Symbiote {
  init$ = {
    groups: [],
  };

  _modelsByProvider = {};
  _dragProfile = null;

  initCallback() {
    this.ref.refreshBtn.onclick = () => this.loadGroups();
    this.ref.newBtn.onclick = () => this.showCreateForm();
    this.loadGroups();
  }

  _mcpCall(toolName, args = {}) {
    return mcpCall('agent-pool', toolName, args);
  }

  async loadGroups({ retry = true } = {}) {
    try {
      this.ref.board.replaceChildren(makeEmptyState('Loading groups...'));
      let [groups, modelsInfo] = await Promise.all([
        this._mcpCall('list_groups', { json: true }),
        fetch('/api/settings/models').then(res => res.json()).catch(() => ({ userModels: {} })),
      ]);
      if (typeof groups === 'string') {
        try { groups = JSON.parse(groups); } catch { groups = []; }
      }
      this._modelsByProvider = modelsInfo.userModels || {};
      this.$.groups = Array.isArray(groups) ? groups.map(cloneGroup) : [];
      if (retry && this.$.groups.length === 0) {
        setTimeout(() => this.loadGroups({ retry: false }), 1000);
      }
      this.renderBoard();
    } catch (err) {
      console.error('Failed to load groups:', err);
      this.ref.board.replaceChildren(makeEmptyState(`Error: ${err.message}`, true));
    }
  }

  _modelsFor(provider) {
    return Array.from(new Set([
      ...(DEFAULT_MODELS[provider] || ['default']),
      ...(this._modelsByProvider[provider] || []),
    ]));
  }

  renderBoard() {
    let groups = this.$.groups || [];
    if (groups.length === 0) {
      this.ref.board.replaceChildren(makeEmptyState('No groups found'));
      return;
    }

    this.ref.board.replaceChildren(...groups.map(group => this._renderColumn(group)));
    this._bindBoard();
  }

  _renderColumn(group) {
    let profiles = group.profiles?.length
      ? group.profiles
      : [{ provider: group.provider || 'codex', model: group.model || 'default', inherited: true }];
    let rotation = group.rotation_mode || 'error_fallback';
    let provider = group.provider || 'codex';
    let models = this._modelsFor(provider);
    let agents = Array.isArray(group.agents) ? group.agents : [];

    let column = makeElement('section', 'gm-column');
    column.dataset.group = group.name;
    column.dataset.status = group.status || 'idle';

    let header = makeElement('header', 'gm-column-head');
    let titleWrap = document.createElement('div');
    let title = makeElement('h2', '', group.name);
    let description = group.description ? makeElement('p', 'gm-description', group.description) : null;
    let meta = makeElement('div', 'gm-meta');
    meta.append(makeElement('span', '', group.model_tier || 'resource group'));
    meta.append(makeElement('span', '', `${profiles.length} model${profiles.length === 1 ? '' : 's'}`));
    if (agents.length) meta.append(makeElement('span', '', `${agents.length} agent${agents.length === 1 ? '' : 's'}`));
    if (group.max_agents) meta.append(makeElement('span', '', `${group.max_agents} max`));
    if (group.policy) meta.append(makeElement('span', '', group.policy));
    titleWrap.replaceChildren(...[title, description, meta].filter(Boolean));

    let saveButton = makeIconButton('gm-column-save');
    saveButton.title = 'Save group';
    saveButton.dataset.group = group.name;
    saveButton.replaceChildren(makeIcon('save'));
    header.replaceChildren(titleWrap, saveButton);

    let config = makeElement('div', 'gm-column-config');
    let rotationLabel = document.createElement('label');
    let rotationText = makeElement('span', '', 'Rotation');
    let rotationSelect = document.createElement('select');
    rotationSelect.dataset.field = 'rotation_mode';
    rotationSelect.dataset.group = group.name;
    rotationSelect.replaceChildren(
      makeOption('error_fallback', rotation === 'error_fallback'),
      makeOption('round_robin', rotation === 'round_robin'),
    );
    rotationSelect.options[0].textContent = 'fallback on error';
    rotationSelect.options[1].textContent = 'task round robin';
    rotationLabel.replaceChildren(rotationText, rotationSelect);

    let maxLabel = document.createElement('label');
    let maxText = makeElement('span', '', 'Max');
    let maxInput = document.createElement('input');
    maxInput.dataset.field = 'max_agents';
    maxInput.dataset.group = group.name;
    maxInput.type = 'number';
    maxInput.min = '1';
    maxInput.value = group.max_agents || '';
    maxInput.placeholder = 'unlimited';
    maxLabel.replaceChildren(maxText, maxInput);
    config.replaceChildren(rotationLabel, maxLabel);

    let profileList = makeElement('div', 'gm-profile-list');
    profileList.dataset.dropGroup = group.name;
    profileList.replaceChildren(
      ...profiles.map((profile, index) => this._renderProfile(group, profile, index)),
    );

    let agentList = null;
    if (agents.length) {
      agentList = makeElement('div', 'gm-agent-list');
      agentList.replaceChildren(...agents.map(agent => makeElement('span', 'gm-agent-chip', agent)));
    }

    let addProfile = makeElement('div', 'gm-add-profile');
    let providerSelect = document.createElement('select');
    providerSelect.dataset.addProvider = group.name;
    providerSelect.replaceChildren(...PROVIDERS.map(p => makeOption(p, p === provider)));

    let modelSelect = document.createElement('select');
    modelSelect.dataset.addModel = group.name;
    modelSelect.replaceChildren(...models.map(m => makeOption(m)));

    let addButton = makeIconButton();
    addButton.title = 'Add profile';
    addButton.dataset.addProfile = group.name;
    addButton.replaceChildren(makeIcon('add'));
    addProfile.replaceChildren(providerSelect, modelSelect, addButton);

    column.replaceChildren(...[header, config, agentList, profileList, addProfile].filter(Boolean));
    return column;
  }

  _renderProfile(group, profile, index) {
    let provider = profile.provider || group.provider || 'codex';
    let model = profile.model || group.model || 'default';
    let card = makeElement('article', `gm-profile ${profile.inherited ? 'inherited' : ''}`.trim());
    card.draggable = true;
    card.dataset.group = group.name;
    card.dataset.index = String(index);

    let iconName = provider === 'claude'
      ? 'hub'
      : provider === 'opencode'
        ? 'route'
        : provider === 'gemini'
          ? 'auto_awesome'
          : 'terminal';
    let iconWrap = makeElement('div', 'gm-profile-icon');
    iconWrap.replaceChildren(makeIcon(iconName));

    let main = makeElement('div', 'gm-profile-main');
    let providerNode = makeElement('div', 'gm-profile-provider', profile.label || provider);
    let modelNode = makeElement('div', 'gm-profile-model', model);
    modelNode.title = model;
    main.replaceChildren(providerNode, modelNode);

    if (profile.inherited) {
      card.replaceChildren(iconWrap, main);
      return card;
    }

    let removeButton = makeIconButton('gm-profile-remove');
    removeButton.title = 'Remove profile';
    removeButton.dataset.removeGroup = group.name;
    removeButton.dataset.removeIndex = String(index);
    removeButton.replaceChildren(makeIcon('close'));
    card.replaceChildren(iconWrap, main, removeButton);
    return card;
  }

  _bindBoard() {
    this.ref.board.querySelectorAll('[data-field]').forEach(el => {
      el.onchange = () => {
        let group = this._findGroup(el.dataset.group);
        if (!group) return;
        let value = el.type === 'number' ? (el.value ? Number(el.value) : null) : el.value;
        group[el.dataset.field] = value;
      };
    });

    this.ref.board.querySelectorAll('[data-add-provider]').forEach(providerEl => {
      providerEl.onchange = () => {
        let modelEl = this.ref.board.querySelector(`[data-add-model="${CSS.escape(providerEl.dataset.addProvider)}"]`);
        if (!modelEl) return;
        modelEl.replaceChildren(...this._modelsFor(providerEl.value).map(m => makeOption(m)));
      };
    });

    this.ref.board.querySelectorAll('[data-add-profile]').forEach(btn => {
      btn.onclick = () => this._addProfile(btn.dataset.addProfile);
    });

    this.ref.board.querySelectorAll('[data-remove-group]').forEach(btn => {
      btn.onclick = () => this._removeProfile(btn.dataset.removeGroup, Number(btn.dataset.removeIndex));
    });

    this.ref.board.querySelectorAll('.gm-column-save').forEach(btn => {
      btn.onclick = () => this._saveGroupByName(btn.dataset.group);
    });

    this.ref.board.querySelectorAll('.gm-profile').forEach(card => {
      card.ondragstart = (event) => {
        this._dragProfile = { groupName: card.dataset.group, index: Number(card.dataset.index) };
        event.dataTransfer.effectAllowed = 'move';
      };
      card.ondragend = () => {
        this._dragProfile = null;
        this.ref.board.querySelectorAll('.gm-profile-list.drag-over').forEach(el => el.classList.remove('drag-over'));
      };
    });

    this.ref.board.querySelectorAll('.gm-profile-list').forEach(list => {
      list.ondragover = (event) => {
        event.preventDefault();
        list.classList.add('drag-over');
      };
      list.ondragleave = () => list.classList.remove('drag-over');
      list.ondrop = async (event) => {
        event.preventDefault();
        list.classList.remove('drag-over');
        await this._moveProfile(list.dataset.dropGroup);
      };
    });
  }

  _findGroup(name) {
    return (this.$.groups || []).find(group => group.name === name);
  }

  _normalProfiles(group) {
    return Array.isArray(group.profiles) ? group.profiles.filter(p => !p.inherited) : [];
  }

  _addProfile(groupName) {
    let group = this._findGroup(groupName);
    if (!group) return;
    let providerEl = this.ref.board.querySelector(`[data-add-provider="${CSS.escape(groupName)}"]`);
    let modelEl = this.ref.board.querySelector(`[data-add-model="${CSS.escape(groupName)}"]`);
    group.profiles = this._normalProfiles(group);
    group.profiles.push({ provider: providerEl?.value || group.provider || 'codex', model: modelEl?.value || 'default' });
    this.renderBoard();
  }

  _removeProfile(groupName, index) {
    let group = this._findGroup(groupName);
    if (!group) return;
    group.profiles = this._normalProfiles(group);
    group.profiles.splice(index, 1);
    this.renderBoard();
  }

  async _moveProfile(targetGroupName) {
    if (!this._dragProfile) return;
    let source = this._findGroup(this._dragProfile.groupName);
    let target = this._findGroup(targetGroupName);
    if (!source || !target) return;
    let sourceProfiles = this._normalProfiles(source);
    let profile = sourceProfiles[this._dragProfile.index];
    if (!profile) return;
    sourceProfiles.splice(this._dragProfile.index, 1);
    source.profiles = sourceProfiles;
    target.profiles = this._normalProfiles(target);
    target.profiles.push({ provider: profile.provider, model: profile.model });
    this.renderBoard();
    await Promise.all([this._saveGroup(source), this._saveGroup(target)]);
  }

  async _saveGroupByName(groupName) {
    let group = this._findGroup(groupName);
    if (!group) return;
    await this._saveGroup(group);
  }

  async _saveGroup(group) {
    let profiles = this._normalProfiles(group);
    let first = profiles[0] || null;
    await this._mcpCall('create_group', {
      name: group.name,
      provider: first?.provider || group.provider || 'codex',
      model: first?.model || group.model || null,
      profiles,
      runner: group.runner || undefined,
      skill: group.skill || undefined,
      policy: group.policy || undefined,
      max_agents: group.max_agents || undefined,
      include_dirs: group.include_dirs || undefined,
      fallback_profiles: group.fallback_profiles || undefined,
      rotation_mode: group.rotation_mode || 'error_fallback',
      model_tier: group.model_tier || undefined,
    });
    this._flashStatus(`${group.name} saved`);
  }

  showCreateForm() {
    let name = window.prompt('Group name');
    if (!name) return;
    this._mcpCall('create_group', {
      name,
      provider: 'codex',
      model: 'default',
      profiles: [{ provider: 'codex', model: 'default' }],
      rotation_mode: 'error_fallback',
    }).then(() => this.loadGroups()).catch(err => window.alert(`Failed to create group: ${err.message}`));
  }

  _flashStatus(message) {
    this.ref.status.textContent = message;
    clearTimeout(this._statusTimer);
    this._statusTimer = setTimeout(() => { this.ref.status.textContent = ''; }, 2500);
  }
}

GroupManager.template = template;
GroupManager.rootStyles = cssShared + cssLocal;
GroupManager.reg('pg-group-manager');

export default GroupManager;
