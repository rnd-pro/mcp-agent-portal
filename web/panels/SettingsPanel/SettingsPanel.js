import { Symbiote } from "@symbiotejs/symbiote";
import {
  formatVoiceCommandList,
  normalizeVoiceCommandSettings,
  sharedUiStyles as cssShared,
  uiConfirm,
} from "symbiote-ui/ui";
import cssLocal from "./SettingsPanel.css.js";
import template from "./SettingsPanel.tpl.js";
import {
  getPortalLocaleOptions,
  setPortalLocaleMode,
  tPortal,
} from '../../common/localization.js';
import { getLocalization } from 'symbiote-ui/locale';

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

export class SettingsPanel extends Symbiote {
  init$ = {};
  _statusInterval = null;
  _approvalInterval = null;
  _providerAuthInterval = null;
  _providerAuthRefreshInFlight = null;
  _onProviderAuthVisibilityChange = () => {
    if (!globalThis.document?.hidden) this._refreshProviderAuth({ notify: true });
  };
  _settings = {};

  renderCallback() {
    this._initProviderModels();
    this.ref.refreshBtn.onclick = () => this.fetchInfo();
    this.ref.restartBtn.onclick = () => this.restartServer();
    this.ref.stopBtn.onclick = () => this.stopServer();
    this.ref.saveSettingsBtn.onclick = () => this.saveSettings();
    this.ref.resetDataBtn.onclick = () => this.resetData();
    this.ref.lanAccessInput.onchange = () => this.saveNetworkAccessSettings();
    this.ref.localeModeInput.onchange = () => this.saveLocalizationSettings();
    this._renderLocaleModeOptions();
    this.fetchInfo();
    this.fetchSettings();
    this._startStatusPolling();
    this._startProviderAuthPolling();
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
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramToken, telegramChatId, localization, voiceInput, agentPortal })
      });
      this._settings = { ...this._settings, telegramToken, telegramChatId, localization, voiceInput, agentPortal };
      let btn = this.ref.saveSettingsBtn;
      btn.textContent = tPortal('text.savedRestart');
      setTimeout(() => {
        btn.textContent = tPortal('text.save');
      }, 4000);
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  async resetData() {
    let keepSettings = this.ref.resetKeepSettingsInput?.checked !== false;
    let confirmKey = keepSettings ? 'settings.reset.confirmKeep' : 'settings.reset.confirmAll';
    if (!(await uiConfirm(tPortal(confirmKey)))) return;
    let btn = this.ref.resetDataBtn;
    btn.disabled = true;
    setStatus(this.ref.resetStatus, tPortal('settings.reset.inProgress'), 'warning');
    try {
      let res = await fetch('/api/state/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepSettings }),
      });
      let body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
      setStatus(this.ref.resetStatus, tPortal('settings.reset.done'), 'success');
      setTimeout(() => globalThis.location?.reload?.(), 600);
    } catch (e) {
      setStatus(this.ref.resetStatus, tPortal('settings.reset.failed', { message: e.message }), 'error');
      btn.disabled = false;
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
    let settings = normalizeVoiceCommandSettings(raw);
    this.ref.voiceSendCommandEnInput.value = settings.sendCommands.en;
    this.ref.voiceSendCommandRuInput.value = settings.sendCommands.ru;
    this.ref.voiceSendCommandEsInput.value = settings.sendCommands.es;
    this.ref.voiceWakeCommandEnInput.value = settings.wakeCommands.en;
    this.ref.voiceWakeCommandRuInput.value = settings.wakeCommands.ru;
    this.ref.voiceWakeCommandEsInput.value = settings.wakeCommands.es;
    this.ref.voiceCancelCommandEnInput.value = formatVoiceCommandList(settings.actionCommands.cancel.en);
    this.ref.voiceCancelCommandRuInput.value = formatVoiceCommandList(settings.actionCommands.cancel.ru);
    this.ref.voiceCancelCommandEsInput.value = formatVoiceCommandList(settings.actionCommands.cancel.es);
    this.ref.voiceDeleteCommandEnInput.value = formatVoiceCommandList(settings.actionCommands.delete.en);
    this.ref.voiceDeleteCommandRuInput.value = formatVoiceCommandList(settings.actionCommands.delete.ru);
    this.ref.voiceDeleteCommandEsInput.value = formatVoiceCommandList(settings.actionCommands.delete.es);
    this.ref.voiceOffCommandEnInput.value = formatVoiceCommandList(settings.actionCommands.off.en);
    this.ref.voiceOffCommandRuInput.value = formatVoiceCommandList(settings.actionCommands.off.ru);
    this.ref.voiceOffCommandEsInput.value = formatVoiceCommandList(settings.actionCommands.off.es);
  }

  _readVoiceInputSettings() {
    let current = this._settings?.voiceInput || {};
    return {
      sendByCommandEnabled: Boolean(current.sendByCommandEnabled),
      voiceResponseEnabled: Boolean(current.voiceResponseEnabled),
      languageMode: ['auto', 'ru', 'es', 'en'].includes(current.languageMode) ? current.languageMode : 'auto',
      ...normalizeVoiceCommandSettings({
        sendCommands: {
          en: this.ref.voiceSendCommandEnInput.value,
          ru: this.ref.voiceSendCommandRuInput.value,
          es: this.ref.voiceSendCommandEsInput.value,
        },
        wakeCommands: {
          en: this.ref.voiceWakeCommandEnInput.value,
          ru: this.ref.voiceWakeCommandRuInput.value,
          es: this.ref.voiceWakeCommandEsInput.value,
        },
        actionCommands: {
          cancel: {
            en: this.ref.voiceCancelCommandEnInput.value,
            ru: this.ref.voiceCancelCommandRuInput.value,
            es: this.ref.voiceCancelCommandEsInput.value,
          },
          delete: {
            en: this.ref.voiceDeleteCommandEnInput.value,
            ru: this.ref.voiceDeleteCommandRuInput.value,
            es: this.ref.voiceDeleteCommandEsInput.value,
          },
          off: {
            en: this.ref.voiceOffCommandEnInput.value,
            ru: this.ref.voiceOffCommandRuInput.value,
            es: this.ref.voiceOffCommandEsInput.value,
          },
        },
      }),
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
    this.ref.teamMemoryRootInput.value = raw.teamMemoryRoot || '';
    this.ref.openLibraryPathInput.value = raw.openLibraryPath || '';
    this.ref.teamLibraryRepoInput.value = raw.teamLibraryRepo || '';
    this.ref.teamLibraryBranchInput.value = raw.teamLibraryBranch || 'main';
    this.ref.lanAccessInput.checked = raw.networkAccess?.lanEnabled === true;
  }

  _readAgentPortalSettings() {
    let current = this._settings.agentPortal || {};
    return {
      ...current,
      teamMemoryRoot: this.ref.teamMemoryRootInput.value.trim(),
      openLibraryPath: this.ref.openLibraryPathInput.value.trim(),
      teamLibraryRepo: this.ref.teamLibraryRepoInput.value.trim(),
      teamLibraryBranch: this.ref.teamLibraryBranchInput.value.trim() || 'main',
      networkAccess: {
        ...(current.networkAccess || {}),
        lanEnabled: this.ref.lanAccessInput.checked,
      },
    };
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
    if (this._providerAuthInterval) {
      clearInterval(this._providerAuthInterval);
      this._providerAuthInterval = null;
    }
    globalThis.document?.removeEventListener?.('visibilitychange', this._onProviderAuthVisibilityChange);
  }

  _startStatusPolling() {
    this._fetchStatus();
    this._fetchNetworkApprovals();
    this._statusInterval = setInterval(() => this._fetchStatus(), 5000);
    this._approvalInterval = setInterval(() => this._fetchNetworkApprovals(), 3000);
  }

  _startProviderAuthPolling() {
    if (this._providerAuthInterval) clearInterval(this._providerAuthInterval);
    this._providerAuthInterval = setInterval(() => {
      this._refreshProviderAuth({ notify: true });
    }, 5000);
    globalThis.document?.removeEventListener?.('visibilitychange', this._onProviderAuthVisibilityChange);
    globalThis.document?.addEventListener?.('visibilitychange', this._onProviderAuthVisibilityChange);
  }

  _applyProviderAuth(providerAuth, { render = true, notify = true } = {}) {
    let previousClaude = this._providerAuth?.providers?.claude;
    this._providerAuth = providerAuth || { providers: {} };
    let currentClaude = this._providerAuth?.providers?.claude;
    if (render) {
      this._renderProviderAuthSummary();
      this._renderProviderAuth();
    }
    if (notify && previousClaude?.authenticated === false && currentClaude?.authenticated === true) {
      let message = tPortal('text.claudeCodeLoginComplete');
      setStatus(this.ref.restartStatus, message, 'success');
      setTimeout(() => {
        if (this.ref.restartStatus.textContent === message) {
          setStatus(this.ref.restartStatus, '', 'muted');
        }
      }, 5000);
    }
  }

  async _refreshProviderAuth({ notify = true, quiet = true } = {}) {
    if (this._providerAuthRefreshInFlight) return this._providerAuthRefreshInFlight;
    this._providerAuthRefreshInFlight = (async () => {
      let res = await fetch('/api/settings/provider-auth');
      let body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      this._applyProviderAuth(body.providerAuth || { providers: {} }, { notify });
      return body.providerAuth;
    })();
    try {
      return await this._providerAuthRefreshInFlight;
    } catch (e) {
      if (!quiet) {
        setStatus(
          this.ref.restartStatus,
          tPortal('text.claudeCodeAuthRefreshFailed', { message: e.message }),
          'error',
        );
      }
      return null;
    } finally {
      this._providerAuthRefreshInFlight = null;
    }
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
      this._codexModels = modelsInfo.codexModels || [];
      this._codexDiscovery = modelsInfo.codexDiscovery || null;
      this._defaultModels = modelsInfo.defaultModels || {};
      this._applyProviderAuth(modelsInfo.providerAuth || { providers: {} }, { render: false, notify: true });
      this._renderProviderTabs();
      if (this._codexDiscovery?.error) {
        this._setModelStatus(`Codex discovery: ${this._codexDiscovery.error}`, 'error');
      }
      
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
  _codexModels = [];
  _codexDiscovery = null;
  _defaultModels = {};
  _providerAuth = { providers: {} };
  
  _initProviderModels() {
    this.ref.syncCliBtn.onclick = () => this._syncFromCli();
    this.ref.saveModelsBtn.onclick = () => this._saveProviderModels();
    
    this.ref.searchInput.oninput = (e) => {
      this._filterQuery = e.target.value.toLowerCase();
      this._renderDirectory();
    };
  }

  _renderProviderTabs() {
    let providers = ['opencode', 'antigravity', 'claude', 'codex'];
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
    
    this._renderProviderAuthSummary();
    this._renderProviderAuth();
    this._renderModelList();
  }

  _renderProviderAuthSummary() {
    let host = this.ref.providerAuthSummary;
    if (!host) return;

    let claude = this._providerAuth?.providers?.claude;
    let banners = [];
    if (claude?.installed && claude.authenticated === false) {
      let detail = claude.localCredentialsPresent
        ? tPortal('text.claudeCodeLocalCredentialsRejected')
        : tPortal('text.claudeCodeLoginHint');
      banners.push(this._renderProviderAuthBanner({
        status: 'warning',
        icon: 'warning',
        title: tPortal('text.claudeCodeNotLoggedIn'),
        detail,
        actionLabel: tPortal('text.claudeCodeLoginAction'),
        actionIcon: 'login',
        onAction: (button) => this._startClaudeLogin(button),
      }));
    }

    host.hidden = banners.length === 0;
    host.replaceChildren(...banners);
  }

  _renderProviderAuthBanner({ status, icon, title, detail, actionLabel, actionIcon, onAction }) {
    let card = document.createElement('div');
    card.className = 'pm-auth-banner';
    card.dataset.status = status;

    let iconEl = document.createElement('span');
    iconEl.className = 'material-symbols-outlined';
    iconEl.textContent = icon;

    let copy = document.createElement('div');
    copy.className = 'pm-auth-copy';

    let titleEl = document.createElement('strong');
    titleEl.textContent = title;

    let detailEl = document.createElement('span');
    detailEl.textContent = detail;

    copy.append(titleEl, detailEl);
    card.append(iconEl, copy);
    if (actionLabel && typeof onAction === 'function') {
      let action = document.createElement('sn-button');
      action.className = 'pm-auth-action';
      action.setAttribute('variant', 'primary');
      renderIconTextButton(action, actionIcon || 'login', actionLabel);
      action.onclick = () => onAction(action);
      card.append(action);
    }
    return card;
  }

  async _startClaudeLogin(button) {
    if (button) {
      renderIconTextButton(button, 'progress_activity', tPortal('text.claudeCodeLoginStarting'), true);
      button.disabled = true;
    }
    try {
      let res = await fetch('/api/settings/provider-auth/claude/login', { method: 'POST' });
      let body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setStatus(this.ref.restartStatus, tPortal('text.claudeCodeLoginStarted'), 'warning');
      setTimeout(() => this._refreshProviderAuth({ notify: true, quiet: false }), 3000);
    } catch (e) {
      setStatus(
        this.ref.restartStatus,
        tPortal('text.claudeCodeLoginFailed', { message: e.message }),
        'error',
      );
    } finally {
      if (button) {
        renderIconTextButton(button, 'login', tPortal('text.claudeCodeLoginAction'));
        button.disabled = false;
      }
    }
  }

  _renderProviderAuth() {
    let auth = this._providerAuth?.providers?.[this._activeProvider];
    if (!auth) {
      this.ref.providerAuthStatus.replaceChildren();
      return;
    }

    let status = 'muted';
    let title = this._activeProvider;
    let details = [];

    if (this._activeProvider === 'opencode') {
      title = auth.installed ? `OpenCode ${auth.version || ''}`.trim() : 'OpenCode not installed';
      if (!auth.installed) {
        status = 'error';
      } else if (auth.deepseekConfigured) {
        status = 'success';
        details.push('DeepSeek connected');
      } else {
        status = 'warning';
        details.push('DeepSeek not connected');
      }
      if (auth.environmentProviders?.length) details.push(`Env: ${auth.environmentProviders.join(', ')}`);
      if (auth.credentialProviders?.length) details.push(`Credentials: ${auth.credentialProviders.join(', ')}`);
      if (auth.credentialStoreUnreadable) details.push('Credential store unreadable');
    } else if (this._activeProvider === 'claude') {
      title = auth.installed ? `Claude Code ${auth.version || ''}`.trim() : 'Claude Code not installed';
      if (!auth.installed) {
        status = 'error';
      } else if (auth.authenticated) {
        status = 'success';
        if (auth.authSource === 'oauth-env') {
          details.push('OAuth env present');
        } else if (auth.loggedIn === true) {
          details.push(`Logged in${auth.authMethod && auth.authMethod !== 'none' ? ` via ${auth.authMethod}` : ''}`);
        } else {
          details.push('Local auth detected');
        }
      } else {
        status = 'warning';
        details.push(auth.loggedIn === false ? 'Claude Code not logged in' : 'Native auth not verified');
        details.push('Run claude auth login');
      }
      if (auth.localCredentialsPresent && auth.loggedIn !== true) {
        details.push(auth.loggedIn === false ? 'Local credentials not accepted by current CLI' : 'Local credentials present but not verified');
      }
      if (auth.ignoredProxyEnvPresent) details.push('Anthropic proxy/API env ignored');
    } else {
      title = `${this._activeProvider} auth`;
      details.push('Status not probed');
    }

    let card = document.createElement('div');
    card.className = 'pm-auth-card';
    card.dataset.status = status;

    let icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.textContent = status === 'success' ? 'verified' : status === 'warning' ? 'warning' : status === 'error' ? 'error' : 'info';

    let text = document.createElement('div');
    text.className = 'pm-auth-copy';

    let name = document.createElement('strong');
    name.textContent = title;

    let detail = document.createElement('span');
    detail.textContent = details.join(' · ') || '—';

    text.append(name, detail);
    card.append(icon, text);
    this.ref.providerAuthStatus.replaceChildren(card);
  }

  _renderModelList() {
    let models = this._userModels[this._activeProvider] || [];
    let children = [];
    if (this._activeProvider === 'claude') {
      let claudeModels = this._defaultModels.claude || [];
      if (claudeModels.length > 0) {
        let suggestions = document.createElement('div');
        suggestions.className = 'pm-model-suggestions';
        let label = document.createElement('span');
        label.textContent = tPortal('text.claudeCodeModels');
        suggestions.append(label);
        for (let entry of claudeModels) {
          let id = typeof entry === 'string' ? entry : entry?.id;
          if (!id) continue;
          let button = document.createElement('sn-button');
          button.className = 'pm-suggest-model';
          button.dataset.m = id;
          button.textContent = typeof entry === 'string' ? entry : (entry.name || id);
          if (entry?.description) button.title = `${id} · ${entry.description}`;
          suggestions.append(button);
        }
        children.push(suggestions);
      }
    }
    if (this._activeProvider === 'codex' && this._codexModels.length > 0) {
      let suggestions = document.createElement('div');
      suggestions.className = 'pm-model-suggestions';
      let label = document.createElement('span');
      label.textContent = 'Codex CLI models';
      suggestions.append(label);
      for (let entry of this._codexModels) {
        let button = document.createElement('sn-button');
        button.className = 'pm-suggest-model';
        button.dataset.m = entry.id;
        button.textContent = entry.displayName || entry.id;
        let efforts = entry.supportedReasoningEfforts?.map(option => option.reasoningEffort).join(', ');
        let tiers = entry.serviceTiers?.map(tier => tier.name || tier.id).join(', ');
        button.title = [entry.id, efforts ? `reasoning: ${efforts}` : '', tiers ? `tiers: ${tiers}` : '']
          .filter(Boolean)
          .join(' · ');
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
      let response = await fetch('/api/settings/models/refresh', { method: 'POST' });
      let r = await response.json();
      this._cliModels = r.models || [];
      this._codexModels = r.codexModels || this._codexModels;
      this._codexDiscovery = r.codexDiscovery || this._codexDiscovery;
      this._defaultModels = r.defaultModels || this._defaultModels;
      this._providerAuth = r.providerAuth || this._providerAuth;
      this._renderProviderAuth();
      this._renderModelList();
      this._renderDirectory();
      if (!response.ok || r.ok === false) {
        let details = Object.values(r.errors || {}).join(' · ') || `HTTP ${response.status}`;
        throw new Error(details);
      }
      this._setModelStatus(`Discovered ${r.count} OpenCode and ${r.codexCount || 0} Codex models`, "accent");
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
