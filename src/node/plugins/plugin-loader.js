// @ctx plugins-loader.ctx
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class PluginLoader {
  /**
   * @param {object} config - Parsed config containing { plugins: { telegram: {enabled: true}, ... } }
   * @param {object} portalAPI - Provided API for plugins { adapterPool, mcpProxy, broadcast }
   */
  constructor(config = {}, portalAPI = {}) {
    this.config = config.plugins || {};
    this.portalAPI = portalAPI;
    this.activePlugins = new Map();
  }

  async initAll() {
    console.log('🔄 [PluginLoader] Discovering plugins...');
    for (const [pluginName, pluginConfig] of Object.entries(this.config)) {
      if (pluginConfig.enabled === false) {
        console.log(`🟡 [PluginLoader] Plugin '${pluginName}' is disabled.`);
        continue;
      }
      
      try {
        // Try to resolve bundled plugin first
        const pluginPath = path.join(__dirname, pluginName, 'index.js');
        if (!fs.existsSync(pluginPath)) {
          console.warn(`🔴 [PluginLoader] Plugin entry not found for '${pluginName}' at ${pluginPath}`);
          continue;
        }

        const pluginModule = await import(pluginPath);
        const pluginInstance = pluginModule.default || pluginModule;
        
        if (typeof pluginInstance.init !== 'function') {
          console.warn(`🔴 [PluginLoader] Plugin '${pluginName}' missing init() export.`);
          continue;
        }

        await pluginInstance.init(this.portalAPI, pluginConfig);
        this.activePlugins.set(pluginName, pluginInstance);
        console.log(`✅ [PluginLoader] Successfully initialized '${pluginName}'.`);
        
      } catch (err) {
        console.error(`🔴 [PluginLoader] Failed to load plugin '${pluginName}':`, err);
      }
    }
  }

  async destroyAll() {
    console.log('🔄 [PluginLoader] Shutting down plugins...');
    for (const [pluginName, instance] of this.activePlugins.entries()) {
      try {
        if (typeof instance.destroy === 'function') {
          await instance.destroy();
        }
        console.log(`✅ [PluginLoader] Shut down '${pluginName}'.`);
      } catch (err) {
        console.error(`🔴 [PluginLoader] Error destroying plugin '${pluginName}':`, err);
      }
    }
    this.activePlugins.clear();
  }
}
