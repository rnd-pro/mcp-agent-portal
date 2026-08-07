/**
 * flow/agent — AI Agent trigger node
 *
 * Pauses graph execution and invokes an AI agent with prompt + context.
 * The agent bridge is injected via params.agentBridge or a global registry.
 * Without a bridge, returns a placeholder indicating agent invocation is needed.
 *
 * @module symbiote-engine/packs/flow/agent */

export default {
  type: 'flow/agent',
  category: 'flow',
  icon: 'smart_toy',

  driver: {
    description: 'AI Agent trigger — invoke agent in pipeline',
    inputs: [
      { name: 'prompt', type: 'string' },
      { name: 'context', type: 'any' },
    ],
    outputs: [
      { name: 'result', type: 'any' },
      { name: 'error', type: 'string' },
    ],
    params: {
      timeout: { type: 'int', default: 30000, description: 'Agent timeout (ms)' },
      allowedTools: { type: 'array', default: [], description: 'Tools the agent can use' },
      model: { type: 'string', default: '', description: 'AI model override' },
    },
  },

  lifecycle: {
    validate: (inputs) => {
      if (!inputs.prompt) return false;
      return true;
    },

    cacheKey: (inputs) => `agent:${inputs.prompt}:${JSON.stringify(inputs.context)}`,

    execute: async (inputs, params) => {
      let { prompt, context } = inputs;
      let { timeout, allowedTools, model } = params;


      let bridge = params._agentBridge || globalThis.__symbioteNodeAgentBridge;
      if (!bridge) {

        return {
          result: {
            _agentPending: true,
            prompt,
            context,
            message: 'Agent bridge not connected. Connect via WebSocket (P23) to enable.',
          },
          error: null,
        };
      }

      try {
        let controller = new AbortController();
        let timeoutId = setTimeout(() => controller.abort(new Error('Agent timeout')), timeout);
        let parentSignal = params.signal;
        let abortFromParent = () => controller.abort(parentSignal.reason || new Error('Agent aborted'));

        if (parentSignal) {
          if (parentSignal.aborted) abortFromParent();
          else parentSignal.addEventListener('abort', abortFromParent, { once: true });
        }

        let response;
        try {
          response = await bridge.run({
            prompt,
            context,
            tools: allowedTools,
            model,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
          parentSignal?.removeEventListener('abort', abortFromParent);
        }

        return { result: response.data, error: null };
      } catch (err) {
        return { result: null, error: err.message };
      }
    },
  },
};
