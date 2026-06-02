import { Symbiote } from "@symbiotejs/symbiote";
import { sharedUiStyles as cssShared } from "symbiote-node/ui";
import cssLocal from "./SettingsPanel.css.js";
import template from "./SettingsPanel.tpl.js";
import { uiConfirm } from 'symbiote-node/ui';
import {
  getPortalLocaleOptions,
  setPortalLocaleMode,
  tPortal,
} from '../../common/localization.js';
import {
  defaultSendCommandPhrases,
  defaultVoiceActionCommandPhrases,
  defaultWakeCommandPhrases,
  formatVoiceCommandList,
  normalizeWakeCommandPhrase,
  parseVoiceCommandList,
} from '../../common/voice-input-defaults.js';
import { getLocalization } from 'symbiote-node/locale';

function renderMetric(label, value, status = "") {
  let metric = document.createElement("sn-metric");
  if (status) metric.setAttribute("status", status);

  let labelEl = document.createElement("span");
  labelEl.slot = "label";
  labelEl.textContent = String(label);

  let valueEl = document.createElement("span");
  valueEl.slot = "value";
  valueEl.textContent = String(value ?? "—");

  metric.append(labelEl, valueEl);
  return metric;
}

function renderEmptyState(message, variant = "") {
  let state = document.createElement("sn-empty-state");
  state.textContent = message;
  if (variant) state.classList.add(`stg-empty-${variant}`);
  return state;
}

function renderIconTextButton(button, icon, label, spinning = false) {
  let iconEl = document.createElement("span");
  iconEl.className = `material-symbols-outlined${spinning ? ' stg-spin' : ''}`;
  iconEl.textContent = icon;
  button.replaceChildren(iconEl, document.createTextNode(` ${label}`));
}

function renderLink(url, label = url) {
  let link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = label;
  return link;
}

function setStatus(el, message, kind = "muted") {
  el.textContent = message;
  el.dataset.status = kind;
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

function defaultVoiceCommands() {
  let wakeDefaults = defaultWakeCommandPhrases();
  return {
    send: defaultSendCommandPhrases(),
    wake: wakeDefaults,
    actions: defaultVoiceActionCommandPhrases(),
  };
}

export class SettingsPanel extends Symbiote {
  init$ = {};
  _statusInterval = null;
  _approvalInterval = null;
  _settings = {};

  renderCallback() {
    this._initProviderModels();
    this.ref.refreshBtn.onclick = () => this.fetchInfo();
    this.ref.restartBtn.onclick = () => this.restartServer();
    this.ref.stopBtn.onclick = () => this.stopServer();
    this.ref.saveSettingsBtn.onclick = () => this.saveSettings();
    this.ref.lanAccessInput.onchange = () => this.saveNetworkAccessSettings();
    this.ref.gatewayTestBtn.onclick = () => this.testGateway();
    this.ref.localeModeInput.onchange = () => this.saveLocalizationSettings();
    this._renderLocaleModeOptions();
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
      this._applyLocalizationSettings(r.localization || {});
      this._applyVoiceInputSettings(r.voiceInput || {});
      this._applyAgentPortalSettings(r.agentPortal || {});
      if (this._lastNetworkAccess) this._renderNetworkAccess(this._lastNetworkAccess);
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
      let localization = this._readLocalizationSettings();
      let voiceInput = this._readVoiceInputSettings();
      let anthropicGateway = this._readGatewaySettings();
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramToken, telegramChatId, localization, voiceInput, agentPortal, anthropicGateway })
      });
      this._settings = { ...this._settings, telegramToken, telegramChatId, localization, voiceInput, agentPortal, anthropicGateway };
      let btn = this.ref.saveSettingsBtn;
      btn.textContent = tPortal('text.savedRestart');
      setTimeout(() => {
        btn.textContent = tPortal('text.save');
      }, 4000);
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  async saveLocalizationSettings() {
    let localization = this._readLocalizationSettings();
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ localization }),
      });
      this._settings = { ...this._settings, localization };
      setPortalLocaleMode(localization.mode);
      setStatus(this.ref.languageStatus, tPortal('settings.language.saved'), 'success');
      setTimeout(() => globalThis.location?.reload?.(), 250);
    } catch (e) {
      setStatus(
        this.ref.languageStatus,
        tPortal('settings.language.saveFailed', { message: e.message }),
        'error',
      );
    }
  }

  _renderLocaleModeOptions(selected = getLocalization().mode) {
    let options = getPortalLocaleOptions().map((item) => {
      let option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      option.selected = item.value === selected;
      return option;
    });
    this.ref.localeModeInput.replaceChildren(...options);
  }

  _applyLocalizationSettings(raw) {
    let mode = raw.mode || getLocalization().mode;
    this._renderLocaleModeOptions(mode);
  }

  _readLocalizationSettings() {
    return {
      mode: this.ref.localeModeInput.value || 'auto',
    };
  }

  _applyVoiceInputSettings(raw) {
    let defaults = defaultVoiceCommands();
    let saved = raw.sendCommands || {};
    let wake = raw.wakeCommands || {};
    let actions = raw.actionCommands || {};
    let legacy = raw.sendCommand || '';
    this.ref.voiceSendCommandEnInput.value = saved.en || legacy || defaults.send.en;
    this.ref.voiceSendCommandRuInput.value = saved.ru || defaults.send.ru;
    this.ref.voiceSendCommandEsInput.value = saved.es || defaults.send.es;
    this.ref.voiceWakeCommandEnInput.value = normalizeWakeCommandPhrase(wake.en || defaults.wake.en, 'en');
    this.ref.voiceWakeCommandRuInput.value = normalizeWakeCommandPhrase(wake.ru || defaults.wake.ru, 'ru');
    this.ref.voiceWakeCommandEsInput.value = normalizeWakeCommandPhrase(wake.es || defaults.wake.es, 'es');
    this.ref.voiceCancelCommandEnInput.value = formatVoiceCommandList(parseVoiceCommandList(actions.cancel?.en, defaults.actions.cancel.en));
    this.ref.voiceCancelCommandRuInput.value = formatVoiceCommandList(parseVoiceCommandList(actions.cancel?.ru, defaults.actions.cancel.ru));
    this.ref.voiceCancelCommandEsInput.value = formatVoiceCommandList(parseVoiceCommandList(actions.cancel?.es, defaults.actions.cancel.es));
    this.ref.voiceDeleteCommandEnInput.value = formatVoiceCommandList(parseVoiceCommandList(actions.delete?.en, defaults.actions.delete.en));
    this.ref.voiceDeleteCommandRuInput.value = formatVoiceCommandList(parseVoiceCommandList(actions.delete?.ru, defaults.actions.delete.ru));
    this.ref.voiceDeleteCommandEsInput.value = formatVoiceCommandList(parseVoiceCommandList(actions.delete?.es, defaults.actions.delete.es));
    this.ref.voiceOffCommandEnInput.value = formatVoiceCommandList(parseVoiceCommandList(actions.off?.en, defaults.actions.off.en));
    this.ref.voiceOffCommandRuInput.value = formatVoiceCommandList(parseVoiceCommandList(actions.off?.ru, defaults.actions.off.ru));
    this.ref.voiceOffCommandEsInput.value = formatVoiceCommandList(parseVoiceCommandList(actions.off?.es, defaults.actions.off.es));
  }

  _readVoiceInputSettings() {
    let defaults = defaultVoiceCommands();
    let current = this._settings?.voiceInput || {};
    return {
      sendByCommandEnabled: Boolean(current.sendByCommandEnabled),
      voiceResponseEnabled: Boolean(current.voiceResponseEnabled),
      languageMode: ['auto', 'ru', 'es', 'en'].includes(current.languageMode) ? current.languageMode : 'auto',
      sendCommands: {
        en: this.ref.voiceSendCommandEnInput.value.trim() || defaults.send.en,
        ru: this.ref.voiceSendCommandRuInput.value.trim() || defaults.send.ru,
        es: this.ref.voiceSendCommandEsInput.value.trim() || defaults.send.es,
      },
      wakeCommands: {
        en: normalizeWakeCommandPhrase(this.ref.voiceWakeCommandEnInput.value, 'en'),
        ru: normalizeWakeCommandPhrase(this.ref.voiceWakeCommandRuInput.value, 'ru'),
        es: normalizeWakeCommandPhrase(this.ref.voiceWakeCommandEsInput.value, 'es'),
      },
      actionCommands: {
        cancel: {
          en: parseVoiceCommandList(this.ref.voiceCancelCommandEnInput.value, defaults.actions.cancel.en),
          ru: parseVoiceCommandList(this.ref.voiceCancelCommandRuInput.value, defaults.actions.cancel.ru),
          es: parseVoiceCommandList(this.ref.voiceCancelCommandEsInput.value, defaults.actions.cancel.es),
        },
        delete: {
          en: parseVoiceCommandList(this.ref.voiceDeleteCommandEnInput.value, defaults.actions.delete.en),
          ru: parseVoiceCommandList(this.ref.voiceDeleteCommandRuInput.value, defaults.actions.delete.ru),
          es: parseVoiceCommandList(this.ref.voiceDeleteCommandEsInput.value, defaults.actions.delete.es),
        },
        off: {
          en: parseVoiceCommandList(this.ref.voiceOffCommandEnInput.value, defaults.actions.off.en),
          ru: parseVoiceCommandList(this.ref.voiceOffCommandRuInput.value, defaults.actions.off.ru),
          es: parseVoiceCommandList(this.ref.voiceOffCommandEsInput.value, defaults.actions.off.es),
        },
      },
    };
  }

  async saveNetworkAccessSettings() {
    try {
      let agentPortal = this._readAgentPortalSettings();
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentPortal }),
      });
      this._settings = { ...this._settings, agentPortal };
      this._renderNetworkAccess(this._lastNetworkAccess || null);
      setStatus(this.ref.restartStatus, tPortal('text.networkSettingSaved'), "warning");
    } catch (e) {
      setStatus(this.ref.restartStatus, `Failed to save network setting: ${e.message}`, "error");
    }
  }

  _applyAgentPortalSettings(raw) {
    this.ref.openLibraryPathInput.value = raw.openLibraryPath || '';
    this.ref.teamLibraryRepoInput.value = raw.teamLibraryRepo || '';
    this.ref.teamLibraryBranchInput.value = raw.teamLibraryBranch || 'main';
    this.ref.lanAccessInput.checked = raw.networkAccess?.lanEnabled === true;
  }

  _readAgentPortalSettings() {
    let current = this._settings.agentPortal || {};
    return {
      ...current,
      openLibraryPath: this.ref.openLibraryPathInput.value.trim(),
      teamLibraryRepo: this.ref.teamLibraryRepoInput.value.trim(),
      teamLibraryBranch: this.ref.teamLibraryBranchInput.value.trim() || 'main',
      networkAccess: {
        ...(current.networkAccess || {}),
        lanEnabled: this.ref.lanAccessInput.checked,
      },
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
      setStatus(t, tPortal('text.gatewayEnableBeforeTesting'), 'warning');
      return;
    }
    setStatus(t, tPortal('text.testingGateway'), 'muted');
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
      setStatus(t, `OK: ${health.defaultModel || gateway.defaultModel}; ${count} model${count === 1 ? '' : 's'}`, 'success');
    } catch (e) {
      setStatus(t, `Test failed: ${e.message}`, 'error');
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback && super.disconnectedCallback();
    if (this._statusInterval) {
      clearInterval(this._statusInterval);
      this._statusInterval = null;
    }
    if (this._approvalInterval) {
      clearInterval(this._approvalInterval);
      this._approvalInterval = null;
    }
  }

  _startStatusPolling() {
    this._fetchStatus();
    this._fetchNetworkApprovals();
    this._statusInterval = setInterval(() => this._fetchStatus(), 5000);
    this._approvalInterval = setInterval(() => this._fetchNetworkApprovals(), 3000);
  }

  async _fetchStatus() {
    try {
      let r = await fetch("/api/server-status").then((res) => res.json());
      this.ref.uptimeVal.textContent = _fmtTime(r.uptime);
      if (r.shutdownAt !== null && r.shutdownAt > 0) {
        this.ref.shutdownTimer.textContent = _fmtTime(r.shutdownAt);
        this.ref.shutdownMetric.setAttribute("status", "warning");
      } else {
        let clients = r.agents + r.monitors;
        this.ref.shutdownTimer.textContent = tPortal(
          clients === 1 ? 'text.activeClientCount' : 'text.activeClientsCount',
          { count: clients },
        );
        this.ref.shutdownMetric.setAttribute("status", "success");
      }
    } catch {
      this.ref.shutdownTimer.textContent = "—";
      this.ref.uptimeVal.textContent = "—";
      this.ref.shutdownMetric.removeAttribute("status");
    }
  }

  async _fetchNetworkApprovals() {
    try {
      let r = await fetch('/api/network-auth/pending').then((res) => res.json());
      this._renderNetworkApprovals(r.pending || []);
    } catch {
      this._renderNetworkApprovals([]);
    }
  }

  _renderNetworkApprovals(pending) {
    let host = this.ref.networkApprovals;
    if (!host) return;
    if (!Array.isArray(pending) || pending.length === 0) {
      host.replaceChildren();
      return;
    }
    let items = pending.map((request) => {
      let row = document.createElement('div');
      row.className = 'pg-network-request';

      let main = document.createElement('div');
      main.className = 'pg-network-request-main';

      let title = document.createElement('div');
      title.className = 'pg-network-request-title';
      title.textContent = tPortal('text.approveBrowser', { id: request.id });

      let address = document.createElement('div');
      address.className = 'pg-network-request-meta';
      address.textContent = request.address || tPortal('text.unknownAddress');

      let userAgent = document.createElement('div');
      userAgent.className = 'pg-network-request-meta';
      userAgent.textContent = request.userAgent || tPortal('text.unknownBrowser');
      main.append(title, address, userAgent);

      let actions = document.createElement('div');
      actions.className = 'pg-network-request-actions';

      let approve = document.createElement('sn-button');
      approve.setAttribute('variant', 'primary');
      approve.textContent = tPortal('text.approve');
      approve.onclick = () => this._resolveNetworkApproval(request.id, true);

      let reject = document.createElement('sn-button');
      reject.setAttribute('variant', 'danger');
      reject.textContent = tPortal('text.reject');
      reject.onclick = () => this._resolveNetworkApproval(request.id, false);

      actions.append(approve, reject);
      row.append(main, actions);
      return row;
    });
    host.replaceChildren(...items);
  }

  async _resolveNetworkApproval(id, approve) {
    let route = approve ? '/api/network-auth/approve' : '/api/network-auth/reject';
    await fetch(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await this._fetchNetworkApprovals();
  }

  async stopServer() {
    if (!(await uiConfirm(tPortal('text.stopServerConfirm')))) return;
    try {
      let res = await fetch("/api/stop", { method: "POST" });
      if (!res.ok) {
        let body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setStatus(this.ref.restartStatus, tPortal('text.serverStopped'), "error");
    } catch (e) {
      setStatus(this.ref.restartStatus, tPortal('text.errorWithMessage', { message: e.message }), "error");
    }
  }

  async restartServer() {
    let t = this.ref.restartStatus;
    setStatus(t, tPortal('text.restartingServer'), "warning");
    try {
      let res = await fetch("/api/restart", { method: "POST" });
      if (!res.ok) {
        let body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setStatus(t, tPortal('text.serverStoppedReconnecting'), "warning");
      let retries = 0;
      let timer = setInterval(async () => {
        retries++;
        try {
          if ((await fetch("/api/project-info")).ok) {
            clearInterval(timer);
            setStatus(t, tPortal('text.serverRestarted'), "success");
            this.fetchInfo();
            setTimeout(() => { setStatus(t, "", "muted"); }, 3000);
            return;
          }
        } catch (e) { /* expected — server is restarting */ }
        if (retries > 15) {
          clearInterval(timer);
          setStatus(t, tPortal('text.serverRestartFailed'), "error");
        }
      }, 1000);
    } catch (e) {
      setStatus(t, tPortal('text.errorWithMessage', { message: e.message }), "error");
    }
  }

  async fetchInfo() {
    let loading = renderEmptyState(tPortal('text.loading'));
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
        renderMetric(tPortal('text.status'), tPortal('text.running'), "success"),
        renderMetric(tPortal('text.project'), info.name || "—"),
        renderMetric(tPortal('text.path'), info.path || "—"),
        renderMetric("PID", info.pid || "—"),
        renderMetric(tPortal('text.connectedAgents'), info.agents ?? "—"),
      );
      this._renderNetworkAccess(info.networkAccess || null);

      let n = this.ref.instanceList;
      n.replaceChildren();
      if (Array.isArray(instances) && instances.length > 0) {
        for (let inst of instances) {
          let uptimeStr = inst.startedAt ? Math.round((Date.now() - inst.startedAt) / 60000) : "?";
          let s = document.createElement("sn-card");
          s.replaceChildren(
            renderMetric(tPortal('text.name'), inst.name || "unknown"),
            renderMetric(tPortal('text.path'), inst.project || "—"),
            renderMetric("PID", inst.pid),
            renderMetric(tPortal('text.port'), inst.port ?? "—"),
            renderMetric(tPortal('text.uptime'), `${uptimeStr} min`),
          );
          n.appendChild(s);
        }
      } else {
        n.replaceChildren(renderEmptyState(tPortal('text.noActiveInstances')));
      }
    } catch (t) {
      console.error("[SettingsPanel] fetch error:", t);
      this.ref.backendCard.replaceChildren(
        renderEmptyState(tPortal('text.errorWithMessage', { message: t.message }), "error"),
      );
    }
  }

  _renderNetworkAccess(networkAccess) {
    this._lastNetworkAccess = networkAccess;
    if (!networkAccess) {
      setStatus(this.ref.networkStatus, tPortal('text.networkUnavailable'), "warning");
      this.ref.networkLinks.replaceChildren();
      return;
    }
    let active = networkAccess.lanEnabled === true;
    let requested = this.ref.lanAccessInput.checked === true;
    let pending = requested !== active;
    setStatus(
      this.ref.networkStatus,
      pending
        ? tPortal('text.networkPendingRestart', { target: requested ? 'LAN' : tPortal('text.loopbackOnly') })
        : active
          ? tPortal('text.networkLanEnabled', { host: networkAccess.bindHost || "—" })
          : tPortal('text.networkLanDisabled', { host: networkAccess.bindHost || "127.0.0.1" }),
      pending ? "warning" : active ? "success" : "muted",
    );

    let links = [];
    if (networkAccess.localUrl) links.push(renderLink(networkAccess.localUrl, tPortal('text.currentLocalUrl', { url: networkAccess.localUrl })));
    for (let url of networkAccess.lanUrls || []) links.push(renderLink(url, tPortal('text.currentLanUrl', { url })));
    if (requested && !active) {
      for (let url of networkAccess.availableLanUrls || []) links.push(renderLink(url, tPortal('text.afterRestartUrl', { url })));
    }
    this.ref.networkLinks.replaceChildren(...links);
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
      let button = document.createElement('sn-button');
      button.className = `pm-provider-tab ${p === this._activeProvider ? 'active' : ''}`.trim();
      if (p === this._activeProvider) button.setAttribute('variant', 'primary');
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
      label.textContent = tPortal('text.gatewayModels');
      suggestions.append(label);
      for (let defaultModel of DEFAULT_GATEWAY.providers.deepseek.models) {
        let model = `deepseek/${defaultModel}`;
        let button = document.createElement('sn-button');
        button.className = 'pm-suggest-model';
        button.dataset.m = model;
        button.textContent = model;
        suggestions.append(button);
      }
      children.push(suggestions);
    }

    if (models.length === 0) {
      let state = renderEmptyState(tPortal('text.noCustomModels'));
      state.classList.add('pm-model-empty');
      children.push(state);
    } else {
      for (let model of models) {
        let chip = document.createElement('sn-badge');
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
        renderEmptyState(tPortal('text.noModelsDiscovered')),
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
      if (m.isVision) tags.push(this._modelTag('visibility', tPortal('text.vision')));
      if (m.isTools) tags.push(this._modelTag('build', tPortal('text.tools')));
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
        free.textContent = tPortal('text.free');
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
    let tag = document.createElement('sn-badge');
    tag.className = 'pm-tag';

    let iconEl = document.createElement('span');
    iconEl.className = 'material-symbols-outlined';
    iconEl.textContent = icon;

    tag.append(iconEl, document.createTextNode(` ${label}`));
    return tag;
  }

  async _saveProviderModels() {
    this._setModelStatus(tPortal('text.saving'), "muted");
    try {
      await fetch('/api/settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: this._activeProvider, models: this._userModels[this._activeProvider] || [] })
      });
      this._setModelStatus(tPortal('text.saveSuccessful'), "success");
    } catch (e) {
      this._setModelStatus(`Error: ${e.message}`, "error");
    }
  }

  async _syncFromCli() {
    let btn = this.ref.syncCliBtn;
    renderIconTextButton(btn, "sync", tPortal('text.discovering'), true);
    btn.disabled = true;
    try {
      let r = await fetch('/api/settings/models/refresh', { method: 'POST' }).then(res => res.json());
      this._cliModels = r.models || [];
      this._renderDirectory();
      this._setModelStatus(`Discovered ${r.count} models`, "accent");
    } catch (e) {
      this._setModelStatus(`Sync failed: ${e.message}`, "error");
    } finally {
      renderIconTextButton(btn, "sync", tPortal('text.discoverUpdate'));
      btn.disabled = false;
    }
  }
  
  _setModelStatus(msg, kind) {
    setStatus(this.ref.modelStatus, msg, kind);
    setTimeout(() => { if (this.ref.modelStatus.textContent === msg) this.ref.modelStatus.textContent = ''; }, 3000);
  }
}

SettingsPanel.template = template;
SettingsPanel.rootStyles = cssShared + cssLocal;
SettingsPanel.reg("pg-settings-panel");
