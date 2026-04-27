// @ctx adapter-stubs.ctx

export function createClaudeAdapter(config = {}) {
  let busy = false;
  return {
    type: 'claude',
    get busy() { return busy; },
    async run() {
      busy = true;
      try {
        await new Promise(r => setTimeout(r, 500));
        return { 
          response: 'Claude adapter not implemented yet.', 
          exitCode: null, 
          errors: ['not_implemented'], 
          totalEvents: 0 
        };
      } finally {
        busy = false;
      }
    },
    destroy() {},
  };
}

export function createOpencodeAdapter(config = {}) {
  let busy = false;
  return {
    type: 'opencode',
    get busy() { return busy; },
    async run() {
      busy = true;
      try {
        await new Promise(r => setTimeout(r, 500));
        return { 
          response: 'OpenCode adapter not implemented yet.', 
          exitCode: null, 
          errors: ['not_implemented'], 
          totalEvents: 0 
        };
      } finally {
        busy = false;
      }
    },
    destroy() {},
  };
}
