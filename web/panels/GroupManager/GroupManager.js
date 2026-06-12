import { Symbiote } from '@symbiotejs/symbiote';
import { mcpCall } from '../../common/mcp-call.js';
import template from './GroupManager.tpl.js';
import { buildHash, getRoute, parseQuery, sharedUiStyles as cssShared } from 'symbiote-ui/ui';
import cssLocal from './GroupManager.css.js';

const PROVIDERS = ['codex', 'claude', 'opencode', 'gemini'];
const DEFAULT_CHAT_AGENT = 'orchestrator';
const APPROVAL_MODES = ['yolo', 'auto_edit', 'plan'];
const DEFAULT_CODEX_MODELS = ['default', 'gpt-5.5', 'gpt-5.4-mini', 'gpt-5.3-codex-spark'];
const CODEX_REASONING_LEVELS = ['default', 'low', 'medium', 'high', 'xhigh'];
const DEFAULT_MODELS = {
  codex: DEFAULT_CODEX_MODELS,
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

function normalizeAgentColor(value) {
  let color = typeof value === 'string' ? value.trim() : '';
  if (!color || color.length > 80) return '';
  return globalThis.CSS?.supports?.('color', color) ? color : '';
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

function normalizeCodexReasoning(value) {
  let normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized === 'default') return '';
  return CODEX_REASONING_LEVELS.includes(normalized) ? normalized : '';
}

function profileCodexReasoning(profile) {
  return normalizeCodexReasoning(profile?.reasoningEffort ?? profile?.reasoning_effort);
}

export class GroupManager extends Symbiote {
  init$ = {
    groups: [],
    agents: [],
  };

  _modelsByProvider = {};
  _dragProfile = null;
  _dragAgent = null;
  _pendingDeleteGroup = null;
  _deleteConfirmTimer = null;

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
      this.ref.unassigned.hidden = true;
      let [groups, modelsInfo, agentsInfo] = await Promise.all([
        this._mcpCall('list_groups', { json: true }),
        fetch('/api/settings/models').then(res => res.json()).catch(() => ({ userModels: {} })),
        fetch(`/api/agents?ts=${Date.now()}`, { cache: 'no-store' })
          .then(res => res.json())
          .catch(() => ({ agents: [] })),
      ]);
      if (typeof groups === 'string') {
        try { groups = JSON.parse(groups); } catch { groups = []; }
      }
      this._modelsByProvider = modelsInfo.userModels || {};
      this.$.groups = Array.isArray(groups) ? groups.map(cloneGroup) : [];
      this.$.agents = Array.isArray(agentsInfo.agents) ? agentsInfo.agents.map(agent => ({ ...agent })) : [];
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
    this._renderUnassignedAgents(groups);
    this._bindBoard();
  }

  _groupAgents(group) {
    return (this.$.agents || [])
      .filter(agent => agent.resourceGroup === group.name)
      .sort((a, b) => a.slug.localeCompare(b.slug));
  }

  _unassignedAgents(groups) {
    let groupNames = new Set(groups.map(group => group.name));
    return (this.$.agents || [])
      .filter(agent => !agent.resourceGroup || !groupNames.has(agent.resourceGroup))
      .sort((a, b) => a.slug.localeCompare(b.slug));
  }

  _profilesFor(group) {
    return group.profiles?.length
      ? group.profiles
      : [{ provider: group.provider || 'codex', model: group.model || 'default', inherited: true }];
  }

  _renderUnassignedAgents(groups) {
    let agents = this._unassignedAgents(groups);
    let panel = this.ref.unassigned;
    panel.hidden = agents.length === 0;
    if (!agents.length) {
      panel.replaceChildren();
      return;
    }
    let label = makeElement('div', 'gm-section-label', 'Unassigned agents');
    let list = makeElement('div', 'gm-agent-list gm-agent-list-pool');
    list.dataset.agentDropGroup = 'none';
    list.replaceChildren(...agents.map(agent => this._renderAgent(agent, null)));
    panel.replaceChildren(label, list);
  }

  _renderColumn(group) {
    let profiles = this._profilesFor(group);
    let rotation = group.rotation_mode || 'error_fallback';
    let provider = group.provider || 'codex';
    let models = this._modelsFor(provider);
    let agents = this._groupAgents(group);

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
    if (group.approval_mode) meta.append(makeElement('span', '', group.approval_mode));
    if (group.timeout) meta.append(makeElement('span', '', `${group.timeout}s`));
    titleWrap.replaceChildren(...[title, description, meta].filter(Boolean));

    let deleteArmed = this._pendingDeleteGroup === group.name;
    if (deleteArmed) column.dataset.deleteArmed = 'true';

    let deleteButton = makeIconButton('gm-column-delete');
    deleteButton.title = deleteArmed ? `Click again to delete ${group.name}` : `Delete ${group.name}`;
    deleteButton.dataset.deleteGroup = group.name;
    if (deleteArmed) deleteButton.dataset.deleteArmed = 'true';
    deleteButton.replaceChildren(makeIcon(deleteArmed ? 'delete_forever' : 'delete'));
    header.replaceChildren(titleWrap, deleteButton);

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

    let approvalLabel = document.createElement('label');
    let approvalText = makeElement('span', '', 'Access');
    let approvalSelect = document.createElement('select');
    approvalSelect.dataset.field = 'approval_mode';
    approvalSelect.dataset.group = group.name;
    approvalSelect.replaceChildren(...APPROVAL_MODES.map(mode => makeOption(mode, mode === group.approval_mode)));
    approvalLabel.replaceChildren(approvalText, approvalSelect);

    let timeoutLabel = document.createElement('label');
    let timeoutText = makeElement('span', '', 'Timeout');
    let timeoutInput = document.createElement('input');
    timeoutInput.dataset.field = 'timeout';
    timeoutInput.dataset.group = group.name;
    timeoutInput.type = 'number';
    timeoutInput.min = '0';
    timeoutInput.value = group.timeout || '';
    timeoutInput.placeholder = 'default';
    timeoutLabel.replaceChildren(timeoutText, timeoutInput);

    config.replaceChildren(rotationLabel, maxLabel, approvalLabel, timeoutLabel);

    let agentSection = makeElement('div', 'gm-agent-section');
    let agentLabel = makeElement('div', 'gm-section-label', 'Agents');
    let agentList = makeElement('div', 'gm-agent-list');
    agentList.dataset.agentDropGroup = group.name;
    agentList.replaceChildren(
      ...(agents.length
        ? agents.map(agent => this._renderAgent(agent, group.name))
        : [makeElement('div', 'gm-agent-empty', 'Drop agents here')]),
    );
    agentSection.replaceChildren(agentLabel, agentList);

    let profileList = makeElement('div', 'gm-profile-list');
    profileList.dataset.dropGroup = group.name;
    profileList.replaceChildren(
      ...profiles.map((profile, index) => this._renderProfile(group, profile, index)),
    );

    let addProfile = makeElement('div', 'gm-add-profile');
    addProfile.dataset.provider = provider;
    let providerSelect = document.createElement('select');
    providerSelect.dataset.addProvider = group.name;
    providerSelect.replaceChildren(...PROVIDERS.map(p => makeOption(p, p === provider)));

    let modelSelect = document.createElement('select');
    modelSelect.dataset.addModel = group.name;
    modelSelect.replaceChildren(...models.map(m => makeOption(m)));

    let reasoningSelect = document.createElement('select');
    reasoningSelect.dataset.addReasoning = group.name;
    reasoningSelect.title = 'Codex reasoning effort';
    reasoningSelect.replaceChildren(...CODEX_REASONING_LEVELS.map(level => makeOption(level)));
    reasoningSelect.hidden = provider !== 'codex';
    reasoningSelect.disabled = provider !== 'codex';

    let addButton = makeIconButton();
    addButton.title = 'Add profile';
    addButton.dataset.addProfile = group.name;
    addButton.replaceChildren(makeIcon('add'));
    addProfile.replaceChildren(providerSelect, modelSelect, reasoningSelect, addButton);

    column.replaceChildren(header, agentSection, config, profileList, addProfile);
    return column;
  }

  _renderAgent(agent, groupName) {
    let card = makeElement('article', 'gm-agent-card');
    card.draggable = true;
    card.dataset.agentSlug = agent.slug;
    card.dataset.agentGroup = groupName || 'none';
    if (agent.slug === DEFAULT_CHAT_AGENT) card.dataset.defaultChat = 'true';

    let iconWrap = makeElement('div', 'gm-agent-icon');
    let color = normalizeAgentColor(agent.color);
    if (color) iconWrap.style.setProperty('--gm-agent-color', color);
    iconWrap.replaceChildren(makeIcon(agent.icon || 'smart_toy'));

    let main = makeElement('div', 'gm-agent-main');
    let slug = makeElement('div', 'gm-agent-slug', agent.slug);
    let meta = makeElement('div', 'gm-agent-meta');
    meta.append(makeElement('span', '', agent.role || 'agent'));
    if (agent.slug === DEFAULT_CHAT_AGENT) {
      meta.append(makeElement('span', 'gm-agent-default', 'default chat'));
    }
    main.replaceChildren(slug, meta);

    let editButton = makeIconButton('gm-agent-edit');
    editButton.title = `Edit ${agent.slug} markdown`;
    editButton.dataset.agentEdit = agent.slug;
    editButton.draggable = false;
    editButton.replaceChildren(makeIcon('edit_note'));

    card.replaceChildren(iconWrap, main, editButton);
    return card;
  }

  _renderProfile(group, profile, index) {
    let provider = profile.provider || group.provider || 'codex';
    let model = profile.model || group.model || 'default';
    let card = makeElement('article', `gm-profile ${profile.inherited ? 'inherited' : ''}`.trim());
    card.draggable = !profile.inherited;
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
    let details = [];
    let reasoning = provider === 'codex' ? profileCodexReasoning(profile) : '';
    if (reasoning) details.push(`reasoning ${reasoning}`);
    let detailNode = details.length ? makeElement('div', 'gm-profile-meta-line', details.join(' · ')) : null;
    main.replaceChildren(...[providerNode, modelNode, detailNode].filter(Boolean));

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
      el.onchange = async () => {
        let group = this._findGroup(el.dataset.group);
        if (!group) return;
        let previous = group[el.dataset.field];
        let value = el.type === 'number' ? (el.value ? Number(el.value) : null) : el.value;
        group[el.dataset.field] = value;
        this.renderBoard();
        try {
          await this._saveGroup(group, `${group.name} saved`);
        } catch (err) {
          group[el.dataset.field] = previous;
          this.renderBoard();
          this._flashStatus(`Failed to save ${group.name}: ${err.message}`);
        }
      };
    });

    this.ref.board.querySelectorAll('[data-add-provider]').forEach(providerEl => {
      providerEl.onchange = () => {
        let modelEl = this.ref.board.querySelector(`[data-add-model="${CSS.escape(providerEl.dataset.addProvider)}"]`);
        let reasoningEl = this.ref.board.querySelector(`[data-add-reasoning="${CSS.escape(providerEl.dataset.addProvider)}"]`);
        if (!modelEl) return;
        this._syncAddProfileControls(providerEl, modelEl, reasoningEl);
      };
    });

    this.ref.board.querySelectorAll('[data-add-profile]').forEach(btn => {
      btn.onclick = () => this._addProfile(btn.dataset.addProfile);
    });

    this.ref.board.querySelectorAll('[data-remove-group]').forEach(btn => {
      btn.onclick = () => this._removeProfile(btn.dataset.removeGroup, Number(btn.dataset.removeIndex));
    });

    this.ref.board.querySelectorAll('[data-delete-group]').forEach(btn => {
      btn.onclick = () => this._requestDeleteGroup(btn.dataset.deleteGroup);
    });

    this.querySelectorAll('[data-agent-edit]').forEach(btn => {
      btn.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this._openAgentMarkdown(btn.dataset.agentEdit);
      };
    });

    this.ref.board.querySelectorAll('.gm-profile').forEach(card => {
      if (card.classList.contains('inherited')) return;
      card.ondragstart = (event) => {
        if (event.target?.closest?.('.gm-profile-remove')) {
          event.preventDefault();
          return;
        }
        this._dragProfile = { groupName: card.dataset.group, index: Number(card.dataset.index) };
        event.dataTransfer.effectAllowed = 'move';
      };
      card.ondragend = () => {
        this._dragProfile = null;
        this._clearProfileDropMarkers();
      };
    });

    this.ref.board.querySelectorAll('.gm-profile-list').forEach(list => {
      list.ondragover = (event) => {
        if (!this._dragProfile) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        list.classList.add('drag-over');
        this._markProfileDropTarget(list, event);
      };
      list.ondragleave = (event) => {
        if (event.relatedTarget && list.contains(event.relatedTarget)) return;
        list.classList.remove('drag-over');
        this._clearProfileDropMarkers(list);
      };
      list.ondrop = async (event) => {
        if (!this._dragProfile) return;
        event.preventDefault();
        let { index } = this._profileDropIndex(list, event);
        this._clearProfileDropMarkers();
        await this._moveProfile(list.dataset.dropGroup, index);
      };
    });

    this.querySelectorAll('.gm-agent-card').forEach(card => {
      card.ondragstart = (event) => {
        if (event.target?.closest?.('[data-agent-edit]')) {
          event.preventDefault();
          return;
        }
        this._dragAgent = {
          slug: card.dataset.agentSlug,
          groupName: card.dataset.agentGroup === 'none' ? null : card.dataset.agentGroup,
        };
        event.dataTransfer.effectAllowed = 'move';
      };
      card.ondragend = () => {
        this._dragAgent = null;
        this.querySelectorAll('.gm-agent-list.drag-over').forEach(el => el.classList.remove('drag-over'));
      };
    });

    this.querySelectorAll('[data-agent-drop-group]').forEach(list => {
      list.ondragover = (event) => {
        if (!this._dragAgent) return;
        event.preventDefault();
        list.classList.add('drag-over');
      };
      list.ondragleave = () => list.classList.remove('drag-over');
      list.ondrop = async (event) => {
        if (!this._dragAgent) return;
        event.preventDefault();
        list.classList.remove('drag-over');
        await this._moveAgent(list.dataset.agentDropGroup);
      };
    });
  }

  _openAgentMarkdown(agentSlug) {
    if (!agentSlug) return;
    let route = getRoute();
    let globals = parseQuery(route.query || '');
    let params = {
      ...(globals.project ? { project: globals.project } : {}),
      path: `.agent-portal/agents/${agentSlug}.md`,
    };
    window.location.hash = buildHash('skills', '', params);
  }

  _findGroup(name) {
    return (this.$.groups || []).find(group => group.name === name);
  }

  _syncAddProfileControls(providerEl, modelEl, reasoningEl) {
    let provider = providerEl?.value || 'codex';
    modelEl.replaceChildren(...this._modelsFor(provider).map(m => makeOption(m)));
    let addProfile = providerEl.closest?.('.gm-add-profile');
    if (addProfile) addProfile.dataset.provider = provider;
    if (!reasoningEl) return;
    let isCodex = provider === 'codex';
    reasoningEl.hidden = !isCodex;
    reasoningEl.disabled = !isCodex;
    reasoningEl.value = 'default';
  }

  _normalProfiles(group) {
    return Array.isArray(group.profiles) ? group.profiles.filter(p => !p.inherited) : [];
  }

  _profileDropIndex(list, event) {
    let cards = Array.from(list.querySelectorAll('.gm-profile:not(.inherited)'));
    for (let card of cards) {
      let rect = card.getBoundingClientRect();
      let index = Number(card.dataset.index);
      if (event.clientY < rect.top + rect.height / 2) {
        return { index, card, position: 'before' };
      }
    }
    return {
      index: cards.length,
      card: cards.at(-1) || null,
      position: cards.length ? 'after' : 'empty',
    };
  }

  _markProfileDropTarget(list, event) {
    this._clearProfileDropMarkers(list);
    let { card, position } = this._profileDropIndex(list, event);
    if (!card || position === 'empty') return;
    card.classList.add(position === 'before' ? 'drop-before' : 'drop-after');
  }

  _clearProfileDropMarkers(scope = this.ref.board) {
    scope.querySelectorAll?.('.gm-profile.drop-before, .gm-profile.drop-after')
      .forEach(card => card.classList.remove('drop-before', 'drop-after'));
    if (scope === this.ref.board) {
      this.ref.board.querySelectorAll('.gm-profile-list.drag-over').forEach(el => el.classList.remove('drag-over'));
    }
  }

  async _addProfile(groupName) {
    let group = this._findGroup(groupName);
    if (!group) return;
    let providerEl = this.ref.board.querySelector(`[data-add-provider="${CSS.escape(groupName)}"]`);
    let modelEl = this.ref.board.querySelector(`[data-add-model="${CSS.escape(groupName)}"]`);
    let reasoningEl = this.ref.board.querySelector(`[data-add-reasoning="${CSS.escape(groupName)}"]`);
    let previousProfiles = this._normalProfiles(group).map(profile => ({ ...profile }));
    let provider = providerEl?.value || group.provider || 'codex';
    let nextProfile = { provider, model: modelEl?.value || 'default' };
    let reasoningEffort = provider === 'codex' ? normalizeCodexReasoning(reasoningEl?.value) : '';
    if (reasoningEffort) nextProfile.reasoningEffort = reasoningEffort;
    group.profiles = this._normalProfiles(group);
    group.profiles.push(nextProfile);
    this.renderBoard();
    try {
      await this._saveGroup(group, `${group.name} saved`);
    } catch (err) {
      group.profiles = previousProfiles;
      this.renderBoard();
      this._flashStatus(`Failed to save ${group.name}: ${err.message}`);
    }
  }

  async _removeProfile(groupName, index) {
    let group = this._findGroup(groupName);
    if (!group) return;
    let previousProfiles = this._normalProfiles(group).map(profile => ({ ...profile }));
    group.profiles = this._normalProfiles(group);
    group.profiles.splice(index, 1);
    this.renderBoard();
    try {
      await this._saveGroup(group, `${group.name} saved`);
    } catch (err) {
      group.profiles = previousProfiles;
      this.renderBoard();
      this._flashStatus(`Failed to save ${group.name}: ${err.message}`);
    }
  }

  async _moveProfile(targetGroupName, targetIndex = Number.POSITIVE_INFINITY) {
    if (!this._dragProfile) return;
    let source = this._findGroup(this._dragProfile.groupName);
    let target = this._findGroup(targetGroupName);
    if (!source || !target) return;
    let sourceProfiles = this._normalProfiles(source);
    let profile = sourceProfiles[this._dragProfile.index];
    if (!profile) return;
    let targetProfiles = source === target ? sourceProfiles : this._normalProfiles(target);
    let nextIndex = Number.isFinite(targetIndex) ? targetIndex : targetProfiles.length;
    nextIndex = Math.max(0, Math.min(nextIndex, targetProfiles.length));
    sourceProfiles.splice(this._dragProfile.index, 1);
    if (source === target) {
      if (nextIndex > this._dragProfile.index) nextIndex -= 1;
      if (nextIndex === this._dragProfile.index) {
        source.profiles = sourceProfiles;
        source.profiles.splice(this._dragProfile.index, 0, profile);
        return;
      }
      sourceProfiles.splice(nextIndex, 0, profile);
      source.profiles = sourceProfiles;
    } else {
      source.profiles = sourceProfiles;
      targetProfiles.splice(nextIndex, 0, { ...profile });
      target.profiles = targetProfiles;
    }
    this.renderBoard();
    await Promise.all(source === target ? [this._saveGroup(source)] : [this._saveGroup(source), this._saveGroup(target)]);
  }

  async _moveAgent(targetGroupName) {
    if (!this._dragAgent) return;
    let target = targetGroupName === 'none' ? null : targetGroupName;
    let agent = (this.$.agents || []).find(item => item.slug === this._dragAgent.slug);
    if (!agent || (agent.resourceGroup || null) === target) return;
    let previous = agent.resourceGroup || null;
    agent.resourceGroup = target;
    this.renderBoard();
    try {
      let response = await fetch('/api/agents/resource-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: agent.slug,
          resourceGroup: target || 'none',
        }),
      });
      let data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      agent.resourceGroup = data.agent?.resourceGroup || null;
      this._flashStatus(`${agent.slug} saved`);
      this.renderBoard();
    } catch (err) {
      agent.resourceGroup = previous;
      this.renderBoard();
      this._flashStatus(`Failed to move ${agent.slug}: ${err.message}`);
    }
  }

  async _saveGroup(group, message = '') {
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
      approval_mode: group.approval_mode || undefined,
      max_agents: group.max_agents || undefined,
      timeout: group.timeout ?? undefined,
      include_dirs: group.include_dirs || undefined,
      rotation_mode: group.rotation_mode || 'error_fallback',
      model_tier: group.model_tier || undefined,
    });
    if (message) this._flashStatus(message);
  }

  _requestDeleteGroup(groupName) {
    if (!groupName) return;
    if (this._pendingDeleteGroup === groupName) {
      this._clearDeleteIntent(false);
      this._deleteGroup(groupName);
      return;
    }
    this._pendingDeleteGroup = groupName;
    clearTimeout(this._deleteConfirmTimer);
    this.renderBoard();
    this._flashStatus(`Click delete again to delete ${groupName}`);
    this._deleteConfirmTimer = setTimeout(() => {
      if (this._pendingDeleteGroup !== groupName) return;
      this._clearDeleteIntent();
    }, 4000);
  }

  _clearDeleteIntent(render = true) {
    clearTimeout(this._deleteConfirmTimer);
    this._deleteConfirmTimer = null;
    this._pendingDeleteGroup = null;
    if (render) this.renderBoard();
  }

  async _deleteGroup(groupName) {
    let group = this._findGroup(groupName);
    if (!group) return;
    this._clearDeleteIntent(false);
    let previousGroups = this.$.groups || [];
    this.$.groups = previousGroups.filter(item => item.name !== groupName);
    this.renderBoard();
    try {
      await this._mcpCall('delete_group', { name: groupName });
      this._flashStatus(`${groupName} deleted`);
      await this.loadGroups({ retry: false });
    } catch (err) {
      this.$.groups = previousGroups;
      this.renderBoard();
      this._flashStatus(`Failed to delete ${groupName}: ${err.message}`);
    }
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
      approval_mode: 'yolo',
      timeout: 600,
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
