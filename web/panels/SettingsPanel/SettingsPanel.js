import { Symbiote } from "@symbiotejs/symbiote";
import { sharedUiStyles as cssShared } from "symbiote-node/ui";
import cssLocal from "./SettingsPanel.css.js";
import template from "./SettingsPanel.tpl.js";
import { uiConfirm } from 'symbiote-node/ui';

function renderMetric(label, value, extraClass = "") {
  let metric = document.createElement("div");
  metric.className = "pg-stg-metric";

  let labelEl = document.createElement("span");
  labelEl.textContent = String(label);

  let valueEl = document.createElement("span");
  valueEl.className = `pg-stg-val ${extraClass}`.trim();
  valueEl.textContent = String(value);

  metric.append(labelEl, valueEl);
  return metric;
}

function renderEmptyState(message, color = "") {
  let state = document.createElement("div");
  state.className = "ui-empty-state";
  state.textContent = message;
  if (color) state.style.color = color;
  return state;
}

function renderIconTextButton(button, icon, label, options = {}) {
  let iconEl = document.createElement("span");
  iconEl.className = "material-symbols-outlined";
  iconEl.textContent = icon;
  if (options.animation) iconEl.style.animation = options.animation;
  if (options.fontSize) iconEl.style.fontSize = options.fontSize;
  button.replaceChildren(iconEl, document.createTextNode(` ${label}`));
}

function _fmtTime(s) {
  if (s <= 0) return "now";
  let m = Math.floor(s / 60), sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

const DEFAULT_GATEWAY = {
  enabled: false,
  authToken: '',
  defaultModel: 'deepseek-v4-flash',
  plannerModel: 'deepseek-v4-pro',
  providers: {
    deepseek: {
      type: 'anthropic-compatible',
      baseUrl: 'https://api.deepseek.com/anthropic',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    },
  },
};

export class SettingsPanel extends Symbiote {
  init$ = {};
  _statusInterval = null;
  _settings = {};

  renderCallback() {
    this._initProviderModels();
    this.ref.refreshBtn.onclick = () => this.fetchInfo();
    this.ref.restartBtn.onclick = () => this.restartServer();
    this.ref.stopBtn.onclick = () => this.stopServer();
    this.ref.saveSettingsBtn.onclick = () => this.saveSettings();
    this.ref.gatewayTestBtn.onclick = () => this.testGateway();
    this.fetchInfo();
    this.fetchSettings();
    this._startStatusPolling();
  }

  async fetchSettings() {
    try {
      let r = await fetch("/api/settings").then(res => res.json());
      if (r.telegramToken) {
        this.ref.telegramTokenInput.value = r.telegramToken;
      }
      if (r.telegramChatId) {
        this.ref.telegramChatIdInput.value = r.telegramChatId;
      }
      this._settings = r || {};
      this._applyAgentPortalSettings(r.agentPortal || {});
      this._applyGatewaySettings(r.anthropicGateway || {});
    } catch (e) {
      console.error('Failed to fetch settings:', e);
    }
  }

  async saveSettings() {
    try {
      let telegramToken = this.ref.telegramTokenInput.value.trim();
      let telegramChatId = this.ref.telegramChatIdInput.value.trim();
      let agentPortal = this._readAgentPortalSettings();
      let anthropicGateway = this._readGatewaySettings();
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramToken, telegramChatId, agentPortal, anthropicGateway })
      });
      this._settings = { ...this._settings, telegramToken, telegramChatId, agentPortal, anthropicGateway };
      let btn = this.ref.saveSettingsBtn;
      btn.textContent = "Saved! Please click Restart.";
      setTimeout(() => {
        btn.textContent = "Save";
      }, 4000);
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  _applyAgentPortalSettings(raw) {
    this.ref.openLibraryPathInput.value = raw.openLibraryPath || '';
    this.ref.teamLibraryRepoInput.value = raw.teamLibraryRepo || '';
    this.ref.teamLibraryBranchInput.value = raw.teamLibraryBranch || 'main';
  }

  _readAgentPortalSettings() {
    return {
      openLibraryPath: this.ref.openLibraryPathInput.value.trim(),
      teamLibraryRepo: this.ref.teamLibraryRepoInput.value.trim(),
      teamLibraryBranch: this.ref.teamLibraryBranchInput.value.trim() || 'main',
    };
  }

  _applyGatewaySettings(raw) {
    let gateway = {
      ...DEFAULT_GATEWAY,
      ...raw,
      providers: {
        ...DEFAULT_GATEWAY.providers,
        ...(raw.providers || {}),
      },
    };
    let providerId = gateway.providers.deepseek ? 'deepseek' : Object.keys(gateway.providers)[0] || 'deepseek';
    let provider = {
      ...DEFAULT_GATEWAY.providers.deepseek,
      ...(gateway.providers[providerId] || {}),
    };

    this.ref.gatewayEnabledInput.checked = gateway.enabled === true;
    this.ref.gatewayProviderInput.value = providerId;
    this.ref.gatewayProviderTypeInput.value = provider.type || 'openai-compatible';
    this.ref.gatewayBaseUrlInput.value = provider.baseUrl || '';
    this.ref.gatewayApiKeyEnvInput.value = provider.apiKeyEnv || '';
    this.ref.gatewayDefaultModelInput.value = gateway.defaultModel || '';
    this.ref.gatewayPlannerModelInput.value = gateway.plannerModel || '';
    this.ref.gatewayAuthTokenInput.value = gateway.authToken || '';
  }

  _readGatewaySettings() {
    let providerId = this.ref.gatewayProviderInput.value || 'deepseek';
    let defaultModel = this.ref.gatewayDefaultModelInput.value.trim() || DEFAULT_GATEWAY.defaultModel;
    let plannerModel = this.ref.gatewayPlannerModelInput.value.trim() || DEFAULT_GATEWAY.plannerModel;
    return {
      enabled: this.ref.gatewayEnabledInput.checked,
      authToken: this.ref.gatewayAuthTokenInput.value.trim(),
      defaultModel,
      plannerModel,
      providers: {
        [providerId]: {
          type: this.ref.gatewayProviderTypeInput.value || 'openai-compatible',
          baseUrl: this.ref.gatewayBaseUrlInput.value.trim() || DEFAULT_GATEWAY.providers.deepseek.baseUrl,
          apiKeyEnv: this.ref.gatewayApiKeyEnvInput.value.trim() || DEFAULT_GATEWAY.providers.deepseek.apiKeyEnv,
          models: Array.from(new Set([defaultModel, plannerModel, ...DEFAULT_GATEWAY.providers.deepseek.models])),
        },
      },
    };
  }

  async testGateway() {
    let t = this.ref.gatewayStatus;
    let gateway = this._readGatewaySettings();
    if (!gateway.enabled) {
      t.textContent = 'Enable and save the gateway before testing.';
      t.style.color = 'var(--sn-warning-color)';
      return;
    }
    t.textContent = 'Testing gateway...';
    t.style.color = 'var(--sn-text-dim)';
    let headers = gateway.authToken ? { Authorization: `Bearer ${gateway.authToken}` } : {};
    try {
      let [healthRes, modelsRes] = await Promise.all([
        fetch('/anthropic/health', { headers }),
        fetch('/anthropic/v1/models', { headers }),
      ]);
      if (!healthRes.ok) throw new Error(`health ${healthRes.status}`);
      if (!modelsRes.ok) throw new Error(`models ${modelsRes.status}`);
      let health = await healthRes.json();
      let models = await modelsRes.json();
      let count = Array.isArray(models.data) ? models.data.length : 0;
      t.textContent = `OK: ${health.defaultModel || gateway.defaultModel}; ${count} model${count === 1 ? '' : 's'}`;
      t.style.color = 'var(--sn-success-color)';
    } catch (e) {
      t.textContent = `Test failed: ${e.message}`;
      t.style.color = 'var(--sn-danger-color)';
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback && super.disconnectedCallback();
    if (this._statusInterval) {
      clearInterval(this._statusInterval);
      this._statusInterval = null;
    }
  }

  _startStatusPolling() {
    this._fetchStatus();
    this._statusInterval = setInterval(() => this._fetchStatus(), 5000);
  }

  async _fetchStatus() {
    try {
      let r = await fetch("/api/server-status").then((res) => res.json());
      this.ref.uptimeVal.textContent = _fmtTime(r.uptime);
      if (r.shutdownAt !== null && r.shutdownAt > 0) {
        this.ref.shutdownTimer.textContent = _fmtTime(r.shutdownAt);
        this.ref.shutdownTimer.className = "pg-stg-val pg-stg-warn";
      } else {
        let clients = r.agents + r.monitors;
        this.ref.shutdownTimer.textContent = `Active (${clients} client${clients !== 1 ? "s" : ""})`;
        this.ref.shutdownTimer.className = "pg-stg-val pg-stg-ok";
      }
    } catch {
      this.ref.shutdownTimer.textContent = "—";
      this.ref.uptimeVal.textContent = "—";
    }
  }

  async stopServer() {
    if (!(await uiConfirm("Stop the server? It will not restart automatically."))) return;
    try {
      await fetch("/api/stop", { method: "POST" });
      this.ref.restartStatus.textContent = "⏹ Server stopped.";
      this.ref.restartStatus.style.color = "var(--sn-danger-color, #f44336)";
    } catch (e) {
      this.ref.restartStatus.textContent = `Error: ${e.message}`;
    }
  }

  async restartServer() {
    let t = this.ref.restartStatus;
    t.textContent = "Restarting server…";
    t.style.color = "var(--sn-warning-color, #ff9800)";
    try {
      await fetch("/api/restart", { method: "POST" });
      t.textContent = "Server stopped. Reconnecting…";
      let retries = 0;
      let timer = setInterval(async () => {
        retries++;
        try {
          if ((await fetch("/api/project-info")).ok) {
            clearInterval(timer);
            t.textContent = "Server restarted successfully";
            t.style.color = "var(--sn-success-color, #4caf50)";
            this.fetchInfo();
            setTimeout(() => { t.textContent = ""; }, 3000);
            return;
          }
        } catch (e) { /* expected — server is restarting */ }
        if (retries > 15) {
          clearInterval(timer);
          t.textContent = "Server did not come back. Refresh the page manually.";
          t.style.color = "var(--sn-danger-color, #f44336)";
        }
      }, 1000);
    } catch (e) {
      t.textContent = `Error: ${e.message}`;
      t.style.color = "var(--sn-danger-color, #f44336)";
    }
  }

  async fetchInfo() {
    let loading = renderEmptyState("Loading…");
    loading.classList.add("pg-stg-pulse");
    this.ref.backendCard.replaceChildren(loading);
    try {
      let [info, instances, modelsInfo] = await Promise.all([
        fetch("/api/project-info").then((res) => res.json()),
        fetch("/api/instances").then((res) => res.json()),
        fetch("/api/settings/models").then((res) => res.json()).catch(() => ({ userModels: {}, cliModels: [] })),
      ]);
      
      this._userModels = modelsInfo.userModels || {};
      this._cliModels = modelsInfo.cliModels || [];
      this._renderProviderTabs();
      
      this.ref.backendCard.replaceChildren(
        renderMetric("Status", "Running", "pg-stg-ok"),
        renderMetric("Project", info.name || "—"),
        renderMetric("Path", info.path || "—"),
        renderMetric("PID", info.pid || "—"),
        renderMetric("Connected Agents", info.agents ?? "—"),
      );

      let n = this.ref.instanceList;
      n.replaceChildren();
      if (Array.isArray(instances) && instances.length > 0) {
        for (let inst of instances) {
          let uptimeStr = inst.startedAt ? Math.round((Date.now() - inst.startedAt) / 60000) : "?";
          let s = document.createElement("sn-card");
          s.replaceChildren(
            renderMetric("Name", inst.name || "unknown"),
            renderMetric("Path", inst.project || "—"),
            renderMetric("PID", inst.pid),
            renderMetric("Port", inst.port),
            renderMetric("Uptime", `${uptimeStr} min`),
          );
          n.appendChild(s);
        }
      } else {
        n.replaceChildren(renderEmptyState("No active instances"));
      }
    } catch (t) {
      console.error("[SettingsPanel] fetch error:", t);
      this.ref.backendCard.replaceChildren(
        renderEmptyState(`Error: ${t.message}`, "var(--sn-danger-color)"),
      );
    }
  }

  // ── Provider Models ──

  _activeProvider = 'opencode';
  _userModels = {};
  _cliModels = [];
  
  _initProviderModels() {
    this.ref.syncCliBtn.onclick = () => this._syncFromCli();
    this.ref.saveModelsBtn.onclick = () => this._saveProviderModels();
    
    this.ref.searchInput.oninput = (e) => {
      this._filterQuery = e.target.value.toLowerCase();
      this._renderDirectory();
    };
  }

  _renderProviderTabs() {
    let providers = ['opencode', 'gemini', 'claude', 'codex'];
    if (!providers.includes(this._activeProvider)) this._activeProvider = providers[0];

    let buttons = providers.map(p => {
      let button = document.createElement('button');
      button.className = `pm-provider-tab ${p === this._activeProvider ? 'active' : ''}`.trim();
      button.dataset.p = p;
      button.textContent = p;
      return button;
    });
    this.ref.providerTabs.replaceChildren(...buttons);
    
    this.ref.providerTabs.querySelectorAll('.pm-provider-tab').forEach(b => {
      b.onclick = () => {
        this._activeProvider = b.dataset.p;
        this.ref.searchInput.value = '';
        this._filterQuery = '';
        this._renderProviderTabs();
      };
    });
    
    if (this._activeProvider !== 'opencode') {
      this.ref.directoryEl.hidden = true;
    } else {
      this.ref.directoryEl.hidden = false;
      this._renderDirectory();
    }
    
    this._renderModelList();
  }

  _renderModelList() {
    let models = this._userModels[this._activeProvider] || [];
    let children = [];
    let showGatewaySuggestions = this._activeProvider === 'claude'
      && this._settings?.anthropicGateway?.enabled;
    if (showGatewaySuggestions) {
      let suggestions = document.createElement('div');
      suggestions.className = 'pm-model-suggestions';
      let label = document.createElement('span');
      label.textContent = 'Gateway models:';
      suggestions.append(label);
      for (let defaultModel of DEFAULT_GATEWAY.providers.deepseek.models) {
        let model = `deepseek/${defaultModel}`;
        let button = document.createElement('button');
        button.className = 'pm-suggest-model';
        button.dataset.m = model;
        button.textContent = model;
        suggestions.append(button);
      }
      children.push(suggestions);
    }

    if (models.length === 0) {
      let state = renderEmptyState('No custom models. Showing defaults.');
      state.style.padding = '4px';
      children.push(state);
    } else {
      for (let model of models) {
        let chip = document.createElement('div');
        chip.className = 'pm-model-chip';
        chip.append(document.createTextNode(`${model} `));

        let remove = document.createElement('span');
        remove.className = 'remove';
        remove.dataset.m = model;
        remove.textContent = '×';
        chip.append(remove);
        children.push(chip);
      }
    }
    this.ref.modelList.replaceChildren(...children);

    this.ref.modelList.querySelectorAll('.pm-suggest-model').forEach(btn => {
      btn.onclick = () => {
        if (!this._userModels[this._activeProvider]) this._userModels[this._activeProvider] = [];
        if (!this._userModels[this._activeProvider].includes(btn.dataset.m)) {
          this._userModels[this._activeProvider].push(btn.dataset.m);
        }
        this._renderModelList();
      };
    });
    this.ref.modelList.querySelectorAll('.remove').forEach(btn => {
      btn.onclick = () => {
        this._userModels[this._activeProvider] = models.filter(x => x !== btn.dataset.m);
        this._renderModelList();
        if (this._activeProvider === 'opencode') this._renderDirectory();
      };
    });
  }

  _filterQuery = '';
  _sortCol = 'name';
  _sortDir = 1; // 1 for ASC, -1 for DESC

  _renderDirectory() {
    if (!this._cliModels || this._cliModels.length === 0) {
      this.ref.directoryList.replaceChildren(
        renderEmptyState("No models discovered. Click 'Discover & Update'."),
      );
      return;
    }
    
    // Update headers UI
    this.ref.sortHeaders.querySelectorAll('.sortable').forEach(el => {
      let col = el.dataset.sort;
      el.classList.toggle('active', this._sortCol === col);
      let icon = el.querySelector('.s-icon');
      if (icon) {
        icon.textContent = this._sortCol === col ? (this._sortDir === 1 ? '↓' : '↑') : '';
      }
      el.onclick = () => {
        if (this._sortCol === col) {
          this._sortDir *= -1;
        } else {
          this._sortCol = col;
          this._sortDir = col === 'name' || col === 'price_asc' ? 1 : -1;
        }
        this._renderDirectory();
      };
    });
    
    let favs = this._userModels['opencode'] || [];
    let items = this._cliModels;
    
    if (this._filterQuery) {
      items = items.filter(m => {
        let n = (m.name || '').toLowerCase();
        let i = (m.id || '').toLowerCase();
        return n.includes(this._filterQuery) || i.includes(this._filterQuery);
      });
    }
    
    // Sort logic
    items.sort((a, b) => {
      // 1. Favorites always on top
      let aFav = favs.includes(a.id);
      let bFav = favs.includes(b.id);
      if (aFav !== bFav) return aFav ? -1 : 1;
      
      // 2. Main sort criteria
      let diff = 0;
      if (this._sortCol === 'price_asc') {
        let pA = a.rawPrompt ?? 999999;
        let pB = b.rawPrompt ?? 999999;
        diff = pA - pB;
      } else if (this._sortCol === 'price_asc_out') {
        let pA = a.rawCompletion ?? 999999;
        let pB = b.rawCompletion ?? 999999;
        diff = pA - pB;
      } else if (this._sortCol === 'context_desc') {
        let cA = a.context ?? -1;
        let cB = b.context ?? -1;
        diff = cB - cA; // Descending base
      } else if (this._sortCol === 'newest') {
        let dA = a.created ?? 0;
        let dB = b.created ?? 0;
        diff = dB - dA;
      } else {
        diff = (a.name || a.id).localeCompare(b.name || b.id);
      }
      
      if (diff !== 0) return diff * this._sortDir;
      
      // 3. Fallback: Free first, then alphabetical
      if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
      return (a.name || a.id).localeCompare(b.name || b.id);
    });
    
    let rows = items.map(m => {
      let isFav = favs.includes(m.id);
      let ctx = m.context ? `${Math.round(m.context / 1000)}k` : '—';
      let pp = m.pricePrompt ? `$${m.pricePrompt}` : '—';
      let pc = m.priceCompletion ? `$${m.priceCompletion}` : '—';
      
      let dateStr = '—';
      if (m.created && m.created > 0) {
        let d = new Date(m.created * 1000);
        dateStr = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      }
      
      let row = document.createElement('div');
      row.className = 'pm-grid-row';

      let star = document.createElement('div');
      star.className = `pm-col-star ${isFav ? 'active' : ''}`.trim();
      star.dataset.id = m.id;
      star.textContent = isFav ? '★' : '☆';

      let nameCol = document.createElement('div');
      nameCol.className = 'pm-col-name';
      nameCol.title = m.name || m.id;

      let name = document.createElement('div');
      name.className = 'pm-model-name';
      name.textContent = m.name || m.id;

      let id = document.createElement('div');
      id.className = 'pm-model-id';
      id.textContent = m.id;

      nameCol.append(name, id);

      let tags = [];
      if (m.isVision) tags.push(this._modelTag('visibility', 'Vision'));
      if (m.isTools) tags.push(this._modelTag('build', 'Tools'));
      if (m.maxOutput) tags.push(this._modelTag('timer', `${Math.round(m.maxOutput / 1000)}k Out`));
      if (tags.length > 0) {
        let tagsEl = document.createElement('div');
        tagsEl.className = 'pm-tags';
        tagsEl.append(...tags);
        nameCol.append(tagsEl);
      }

      let ctxCol = document.createElement('div');
      ctxCol.className = 'pm-col-ctx';
      ctxCol.textContent = ctx;

      let dateCol = document.createElement('div');
      dateCol.className = 'pm-col-ctx';
      dateCol.textContent = dateStr;

      let promptPrice = document.createElement('div');
      promptPrice.className = 'pm-col-price';
      if (m.isFree) {
        let free = document.createElement('span');
        free.className = 'pm-price-free';
        free.textContent = 'FREE';
        promptPrice.append(free);
      } else {
        promptPrice.textContent = pp;
      }

      let completionPrice = document.createElement('div');
      completionPrice.className = 'pm-col-price';
      completionPrice.textContent = m.isFree ? '' : pc;

      row.append(star, nameCol, ctxCol, dateCol, promptPrice, completionPrice);
      return row;
    });
    this.ref.directoryList.replaceChildren(...rows);
    
    this.ref.directoryList.querySelectorAll('.pm-col-star').forEach(star => {
      star.onclick = () => {
        let id = star.dataset.id;
        if (!this._userModels['opencode']) this._userModels['opencode'] = [];
        
        let arr = this._userModels['opencode'];
        if (arr.includes(id)) {
          this._userModels['opencode'] = arr.filter(x => x !== id);
        } else {
          arr.push(id);
        }
        
        this._renderModelList();
        this._renderDirectory();
      };
    });
  }

  _modelTag(icon, label) {
    let tag = document.createElement('span');
    tag.className = 'pm-tag';

    let iconEl = document.createElement('span');
    iconEl.className = 'material-symbols-outlined';
    iconEl.style.fontSize = '12px';
    iconEl.style.verticalAlign = 'middle';
    iconEl.style.marginRight = '2px';
    iconEl.textContent = icon;

    tag.append(iconEl, document.createTextNode(` ${label}`));
    return tag;
  }

  async _saveProviderModels() {
    this._setStatus("Saving...", "var(--sn-text-dim)");
    try {
      await fetch('/api/settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: this._activeProvider, models: this._userModels[this._activeProvider] || [] })
      });
      this._setStatus("Saved successfully", "var(--sn-success-color)");
    } catch (e) {
      this._setStatus(`Error: ${e.message}`, "var(--sn-danger-color)");
    }
  }

  async _syncFromCli() {
    let btn = this.ref.syncCliBtn;
    renderIconTextButton(btn, "sync", "Discovering...", {
      animation: "spin 1s linear infinite",
      fontSize: "14px",
    });
    btn.disabled = true;
    try {
      let r = await fetch('/api/settings/models/refresh', { method: 'POST' }).then(res => res.json());
      this._cliModels = r.models || [];
      this._renderDirectory();
      this._setStatus(`Discovered ${r.count} models`, "var(--sn-node-selected)");
    } catch (e) {
      this._setStatus(`Sync failed: ${e.message}`, "var(--sn-danger-color)");
    } finally {
      btn.textContent = "⟳ Discover & Update";
      btn.disabled = false;
    }
  }
  
  _setStatus(msg, color) {
    this.ref.modelStatus.textContent = msg;
    this.ref.modelStatus.style.color = color;
    setTimeout(() => { if (this.ref.modelStatus.textContent === msg) this.ref.modelStatus.textContent = ''; }, 3000);
  }
}

SettingsPanel.template = template;
SettingsPanel.rootStyles = cssShared + cssLocal;
SettingsPanel.reg("pg-settings-panel");
