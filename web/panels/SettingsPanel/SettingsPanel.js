import { Symbiote } from "@symbiotejs/symbiote";
import cssShared from "../../common/ui-shared.css.js";
import cssLocal from "./SettingsPanel.css.js";
import template from "./SettingsPanel.tpl.js";

function renderMetric(label, value, extraClass = "") {
  return `<div class="pg-stg-metric"><span>${label}</span><span class="pg-stg-val ${extraClass}">${value}</span></div>`;
}

function _fmtTime(s) {
  if (s <= 0) return "now";
  const m = Math.floor(s / 60), sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export class SettingsPanel extends Symbiote {
  init$ = {};
  _statusInterval = null;

  renderCallback() {
    this.ref.refreshBtn.onclick = () => this.fetchInfo();
    this.ref.restartBtn.onclick = () => this.restartServer();
    this.ref.stopBtn.onclick = () => this.stopServer();
    this.fetchInfo();
    this._startStatusPolling();
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
      const r = await fetch("/api/server-status").then((res) => res.json());
      this.ref.uptimeVal.textContent = _fmtTime(r.uptime);
      if (r.shutdownAt !== null && r.shutdownAt > 0) {
        this.ref.shutdownTimer.textContent = _fmtTime(r.shutdownAt);
        this.ref.shutdownTimer.className = "pg-stg-val pg-stg-warn";
      } else {
        const clients = r.agents + r.monitors;
        this.ref.shutdownTimer.textContent = `Active (${clients} client${clients !== 1 ? "s" : ""})`;
        this.ref.shutdownTimer.className = "pg-stg-val pg-stg-ok";
      }
    } catch {
      this.ref.shutdownTimer.textContent = "—";
      this.ref.uptimeVal.textContent = "—";
    }
  }

  async stopServer() {
    if (!confirm("Stop the server? It will not restart automatically.")) return;
    try {
      await fetch("/api/stop", { method: "POST" });
      this.ref.restartStatus.textContent = "⏹ Server stopped.";
      this.ref.restartStatus.style.color = "var(--sn-danger-color, #f44336)";
    } catch (e) {
      this.ref.restartStatus.textContent = `Error: ${e.message}`;
    }
  }

  async restartServer() {
    const t = this.ref.restartStatus;
    t.textContent = "⏳ Restarting server…";
    t.style.color = "var(--sn-warning-color, #ff9800)";
    try {
      await fetch("/api/restart", { method: "POST" });
      t.textContent = "Server stopped. Reconnecting…";
      let retries = 0;
      const timer = setInterval(async () => {
        retries++;
        try {
          if ((await fetch("/api/project-info")).ok) {
            clearInterval(timer);
            t.textContent = "✅ Server restarted successfully";
            t.style.color = "var(--sn-success-color, #4caf50)";
            this.fetchInfo();
            setTimeout(() => { t.textContent = ""; }, 3000);
            return;
          }
        } catch {}
        if (retries > 15) {
          clearInterval(timer);
          t.textContent = "⚠ Server did not come back. Refresh the page manually.";
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
      const [info, instances] = await Promise.all([
        fetch("/api/project-info").then((res) => res.json()),
        fetch("/api/instances").then((res) => res.json()),
      ]);
      this.ref.backendCard.innerHTML = [
        renderMetric("Status", "Running", "pg-stg-ok"),
        renderMetric("Project", info.name || "—"),
        renderMetric("Path", info.path || "—"),
        renderMetric("PID", info.pid || "—"),
        renderMetric("Connected Agents", info.agents ?? "—"),
      ].join("");

      const n = this.ref.instanceList;
      n.innerHTML = "";
      if (Array.isArray(instances) && instances.length > 0) {
        for (const inst of instances) {
          const uptimeStr = inst.startedAt ? Math.round((Date.now() - inst.startedAt) / 60000) : "?";
          const s = document.createElement("div");
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
}

SettingsPanel.template = template;
SettingsPanel.rootStyles = cssShared + cssLocal;
SettingsPanel.reg("pg-settings-panel");