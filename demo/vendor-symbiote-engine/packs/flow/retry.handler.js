/**
 * flow/retry — Retry on error node
 *
 * If input has an error, re-invokes the action up to maxRetries times.
 * Passes through successful results immediately.
 *
 * @module symbiote-engine/packs/flow/retry
 */

export default {
  type: 'flow/retry',
  category: 'flow',
  icon: 'refresh',

  driver: {
    description: 'Retry action on error — up to N attempts',
    inputs: [
      { name: 'action', type: 'any' },
      { name: 'error', type: 'any' },
    ],
    outputs: [
      { name: 'result', type: 'any' },
      { name: 'error', type: 'string' },
    ],
    params: {
      maxRetries: { type: 'int', default: 3, description: 'Maximum retry attempts' },
      delay: { type: 'int', default: 1000, description: 'Delay between retries (ms)' },
    },
  },

  lifecycle: {
    execute: async (inputs, params) => {

      if (inputs.error == null && inputs.action != null) {
        return { result: inputs.action, error: null };
      }


      if (inputs.action?._retryFn) {
        let { maxRetries, delay } = params;
        let lastError = inputs.error;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          if (delay > 0 && attempt > 1) {
            await new Promise((r) => setTimeout(r, delay));
          }
          try {
            let result = await inputs.action._retryFn();
            return { result, error: null };
          } catch (err) {
            lastError = err.message;
          }
        }

        return { result: null, error: `Failed after ${maxRetries} retries: ${lastError}` };
      }


      return {
        result: inputs.action,
        error: inputs.error ? String(inputs.error) : null,
      };
    },
  },
};
