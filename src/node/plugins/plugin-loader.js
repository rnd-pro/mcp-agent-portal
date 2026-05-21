// @ctx plugin-loader.ctx
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Loads and manages portal plugins (Telegram, Slack, GitHub). */
export class PluginLoader {
  /**
   * @param {object} config - Parsed config containing { plugins: { telegram: {enabled: true}, ... } }
   * @param {object} portalAPI - Provided API for plugins { adapterPool, mcpProxy, broadcast }
   */
  constructor(config = {}, portalAPI = {}) {
    this.config = config.plugins || {};
    this.portalAPI = portalAPI;
    this.activePlugins = new Map();
    this.failures = [];
    this.verbose = Boolean(config.verbose || portalAPI.verbose);
  }

  _report(level, message, err = null) {
    this.failures.push({ level, message, error: err?.message || null });
    if (!this.verbose) return;
    console[level](err ? `${message}: ${err.message}` : message);
  }

  async initAll() {
    for (const [pluginName, pluginConfig] of Object.entries(this.config)) {
      if (pluginConfig.enabled === false) {
        continue;
      }
      
      try {
        // Try to resolve bundled plugin first
        const pluginPath = path.join(__dirname, pluginName, 'index.js');
        if (!fs.existsSync(pluginPath)) {
          this._report('warn', `[PluginLoader] Plugin entry not found for "${pluginName}"`);
          continue;
        }

        const pluginModule = await import(pluginPath);
        const pluginInstance = pluginModule.default || pluginModule;
        
        if (typeof pluginInstance.init !== 'function') {
          this._report('warn', `[PluginLoader] Plugin "${pluginName}" missing init() export`);
          continue;
        }

        await pluginInstance.init(this.portalAPI, pluginConfig);
        this.activePlugins.set(pluginName, pluginInstance);
        
      } catch (err) {
        this._report('error', `[PluginLoader] Failed to load plugin "${pluginName}"`, err);
      }
    }
  }

  async destroyAll() {
    for (const [pluginName, instance] of this.activePlugins.entries()) {
      try {
        if (typeof instance.destroy === 'function') {
          await instance.destroy();
        }
      } catch (err) {
        this._report('error', `[PluginLoader] Error destroying plugin "${pluginName}"`, err);
      }
    }
    this.activePlugins.clear();
  }

  /**
   * Dispatch an alert to all plugins that implement onAlert().
   * Called by MCPProxyManager on crash, repeated failures, etc.
   * @param {{ type: string, server?: string, message: string, [key: string]: any }} alert
   */
  dispatchAlert(alert) {
    for (let [pluginName, instance] of this.activePlugins) {
      if (typeof instance.onAlert === 'function') {
        try {
          instance.onAlert(alert);
        } catch (err) {
          this._report('error', `[PluginLoader] Alert dispatch error in "${pluginName}"`, err);
        }
      }
    }
  }
}
