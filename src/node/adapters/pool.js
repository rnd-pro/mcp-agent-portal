// @ctx adapters-pool.ctx
import { resolveAdapter } from './index.js';

export class AdapterPool {
  /**
   * @param {object} config - parsed adapters config { gemini: {enabled: true}, ... }
   */
  constructor(config = {}) {
    this.config = config;
    this.instances = new Map(); // type -> AdapterInstance[]
    
    // Initialize collections for enabled adapters
    for (const [type, typeCfg] of Object.entries(this.config)) {
      if (typeCfg.enabled !== false) {
        this.instances.set(type, []);
      }
    }
  }

  /**
   * Acquire a free adapter of the given type.
   * Creates new instance if none are available.
   * @param {string} type 
   * @returns {AdapterInstance|null}
   */
  acquire(type) {
    if (!this.instances.has(type)) {
      if (this.config[type] && this.config[type].enabled === false) {
        return null; // explicitly disabled
      }
      this.instances.set(type, []);
    }

    const list = this.instances.get(type);
    
    // Evict stuck adapters (> 10 mins)
    const MAX_BUSY_MS = 10 * 60 * 1000;
    const now = Date.now();
    for (let i = list.length - 1; i >= 0; i--) {
      let a = list[i];
      if (a.busy && a.busySince > 0 && now - a.busySince > MAX_BUSY_MS) {
        try { a.destroy(); } catch {}
        list.splice(i, 1);
      }
    }

    // Find first free
    let free = list.find((a) => !a.busy);
    if (free) return free;

    // Capacity limit check (hardcoded to 3 per type for now)
    if (list.length >= 3) {
      return null;
    }

    // Create new
    const factory = resolveAdapter(type);
    if (!factory) return null;

    const instance = factory(this.config[type] || {});
    const wrapper = {
      instance,
      busySince: 0,
      get busy() { return instance.busy; },
      async run(opts) {
        this.busySince = Date.now();
        try {
          return await instance.run(opts);
        } finally {
          this.busySince = 0;
        }
      },
      destroy() {
        instance.destroy();
      }
    };
    
    list.push(wrapper);
    return wrapper;
  }

  /**
   * Release adapter (no-op functionally, but good for lifecycle tracking)
   * @param {AdapterInstance} adapter 
   */
  release(adapter) {
    // Adapter state is internally tracked via 'busy' getter
  }

  /**
   * Get pool status for dashboard.
   */
  getStatus() {
    return {
      adapters: Object.fromEntries(
        [...this.instances.entries()].map(([type, list]) => [
          type,
          { total: list.length, busy: list.filter(a => a.busy).length }
        ])
      )
    };
  }

  /**
   * Cleanup all instances
   */
  destroy() {
    for (const list of this.instances.values()) {
      for (const adapter of list) {
        try { adapter.destroy(); } catch {}
      }
    }
    this.instances.clear();
  }
}
