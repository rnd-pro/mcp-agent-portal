import { Symbiote } from "@symbiotejs/symbiote";
import cssShared from "../../common/ui-shared.css.js";
import cssLocal from "./SettingsPanel.css.js";
import template from "./SettingsPanel.tpl.js";
import { uiConfirm } from '../../common/ui-dialogs.js';

function renderMetric(label, value, extraClass = "") {
  return `<div class="pg-stg-metric"><span>${label}</span><span class="pg-stg-val ${extraClass}">${value}</span></div>`;
}

function _fmtTime(s) {
  if (s <= 0) return "now";
  let m = Math.floor(s / 60), sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export class SettingsPanel extends Symbiote {
  init$ = {};
  _statusInterval = null;

  renderCallback() {
    this._initProviderModels();
    this.ref.refreshBtn.onclick = () => this.fetchInfo();
    this.ref.restartBtn.onclick = () => this.restartServer();
    this.ref.stopBtn.onclick = () => this.stopServer();
    this.ref.saveSettingsBtn.onclick = () => this.saveSettings();
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
    } catch (e) {
      console.error('Failed to fetch settings:', e);
    }
  }

  async saveSettings() {
    try {
      let telegramToken = this.ref.telegramTokenInput.value.trim();
      let telegramChatId = this.ref.telegramChatIdInput.value.trim();
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramToken, telegramChatId })
      });
      let btn = this.ref.saveSettingsBtn;
      btn.textContent = "Saved! Please click Restart.";
      btn.className = "ui-btn primary";
      setTimeout(() => {
        btn.textContent = "Save";
      }, 4000);
    } catch (e) {
      console.error('Failed to save settings:', e);
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
        } catch {}
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
    this.ref.backendCard.innerHTML = '<div class="ui-empty-state pg-stg-pulse">Loading…</div>';
    try {
      let [info, instances, modelsInfo] = await Promise.all([
        fetch("/api/project-info").then((res) => res.json()),
        fetch("/api/instances").then((res) => res.json()),
        fetch("/api/settings/models").then((res) => res.json()).catch(() => ({ userModels: {}, cliModels: [] })),
      ]);
      
      this._userModels = modelsInfo.userModels || {};
      this._cliModels = modelsInfo.cliModels || [];
      this._renderProviderTabs();
      
      this.ref.backendCard.innerHTML = [
        renderMetric("Status", "Running", "pg-stg-ok"),
        renderMetric("Project", info.name || "—"),
        renderMetric("Path", info.path || "—"),
        renderMetric("PID", info.pid || "—"),
        renderMetric("Connected Agents", info.agents ?? "—"),
      ].join("");

      let n = this.ref.instanceList;
      n.innerHTML = "";
      if (Array.isArray(instances) && instances.length > 0) {
        for (let inst of instances) {
          let uptimeStr = inst.startedAt ? Math.round((Date.now() - inst.startedAt) / 60000) : "?";
          let s = document.createElement("div");
          s.className = "ui-card";
          s.innerHTML = [
            renderMetric("Name", inst.name || "unknown"),
            renderMetric("Path", inst.project || "—"),
            renderMetric("PID", inst.pid),
            renderMetric("Port", inst.port),
            renderMetric("Uptime", `${uptimeStr} min`),
          ].join("");
          n.appendChild(s);
        }
      } else {
        n.innerHTML = '<div class="ui-empty-state">No active instances</div>';
      }
    } catch (t) {
      console.error("[SettingsPanel] fetch error:", t);
      this.ref.backendCard.innerHTML = `<div class="ui-empty-state" style="color:var(--sn-danger-color)">Error: ${t.message}</div>`;
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
    let providers = ['opencode', 'gemini', 'claude'];
    if (!providers.includes(this._activeProvider)) this._activeProvider = providers[0];
    
    this.ref.providerTabs.innerHTML = providers.map(p => 
      `<button class="pm-provider-tab ${p === this._activeProvider ? 'active' : ''}" data-p="${p}">${p}</button>`
    ).join('');
    
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
    if (models.length === 0) {
      this.ref.modelList.innerHTML = `<div class="ui-empty-state" style="padding:4px">No custom models. Showing defaults.</div>`;
    } else {
      this.ref.modelList.innerHTML = models.map(m => 
        `<div class="pm-model-chip">
           ${m} <span class="remove" data-m="${m}">×</span>
         </div>`
      ).join('');
      
      this.ref.modelList.querySelectorAll('.remove').forEach(btn => {
        btn.onclick = () => {
          this._userModels[this._activeProvider] = models.filter(x => x !== btn.dataset.m);
          this._renderModelList();
          if (this._activeProvider === 'opencode') this._renderDirectory();
        };
      });
    }
  }

  _filterQuery = '';
  _sortCol = 'name';
  _sortDir = 1; // 1 for ASC, -1 for DESC

  _renderDirectory() {
    if (!this._cliModels || this._cliModels.length === 0) {
      this.ref.directoryList.innerHTML = `<div class="ui-empty-state">No models discovered. Click 'Discover & Update'.</div>`;
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
    
    this.ref.directoryList.innerHTML = items.map(m => {
      let isFav = favs.includes(m.id);
      let ctx = m.context ? `${Math.round(m.context / 1000)}k` : '—';
      let pp = m.pricePrompt ? `$${m.pricePrompt}` : '—';
      let pc = m.priceCompletion ? `$${m.priceCompletion}` : '—';
      
      let dateStr = '—';
      if (m.created && m.created > 0) {
        let d = new Date(m.created * 1000);
        dateStr = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      }
      
      if (m.isFree) {
        pp = `<span class="pm-price-free">FREE</span>`;
        pc = '';
      }
      
      let tags = [];
      if (m.isVision) tags.push('<span class="pm-tag"><span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;margin-right:2px">visibility</span> Vision</span>');
      if (m.isTools) tags.push('<span class="pm-tag"><span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;margin-right:2px">build</span> Tools</span>');
      if (m.maxOutput) tags.push(`<span class="pm-tag"><span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;margin-right:2px">timer</span> ${Math.round(m.maxOutput / 1000)}k Out</span>`);
      
      return `
        <div class="pm-grid-row">
          <div class="pm-col-star ${isFav ? 'active' : ''}" data-id="${m.id}">${isFav ? '★' : '☆'}</div>
          <div class="pm-col-name" title="${m.name || m.id}">
            <div class="pm-model-name">${m.name || m.id}</div>
            <div class="pm-model-id">${m.id}</div>
            ${tags.length > 0 ? `<div class="pm-tags">${tags.join('')}</div>` : ''}
          </div>
          <div class="pm-col-ctx">${ctx}</div>
          <div class="pm-col-ctx">${dateStr}</div>
          <div class="pm-col-price">${pp}</div>
          <div class="pm-col-price">${pc}</div>
        </div>
      `;
    }).join('');
    
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
    btn.innerHTML = `<span class="material-symbols-outlined" style="animation:spin 1s linear infinite;font-size:14px">sync</span> Discovering...`;
    btn.disabled = true;
    try {
      let r = await fetch('/api/settings/models/refresh', { method: 'POST' }).then(res => res.json());
      this._cliModels = r.models || [];
      this._renderDirectory();
      this._setStatus(`Discovered ${r.count} models`, "var(--sn-node-selected)");
    } catch (e) {
      this._setStatus(`Sync failed: ${e.message}`, "var(--sn-danger-color)");
    } finally {
      btn.innerHTML = `⟳ Discover & Update`;
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