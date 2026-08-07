/**
 * ai/opencode — AI inference via OpenCode REST API + OpenRouter
 *
 * Connects to a running OpenCode (Crush) instance, creates a session,
 * sends a prompt, and polls a file for the AI's JSON output.
 * Model-agnostic: works with any model available through OpenRouter
 * (DeepSeek, Claude, Gemini, etc.).
 *
 * Pattern from radio-conversation-service.js:
 *   POST /session → create session
 *   POST /session/:id/message → send prompt (fire & forget)
 *   Poll output file → wait for JSON result
 *
 * @module symbiote-engine/packs/ai/opencode
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

function requestSignal(timeoutMs, parentSignal) {
  let timeoutSignal = AbortSignal.timeout(timeoutMs);
  return parentSignal && AbortSignal.any
    ? AbortSignal.any([parentSignal, timeoutSignal])
    : timeoutSignal;
}

export default {
  type: 'ai/opencode',
  category: 'ai',
  icon: 'psychology',

  driver: {
    description: 'AI inference via OpenCode + OpenRouter (DeepSeek, Claude, Gemini, etc.)',
    inputs: [
      { name: 'prompt', type: 'string' },
      { name: 'context', type: 'any' },
    ],
    outputs: [
      { name: 'result', type: 'any' },
      { name: 'error', type: 'string' },
    ],
    params: {
      model: {
        type: 'string',
        default: 'deepseek/deepseek-v3.2',
        description: 'OpenRouter model ID',
      },
      provider: { type: 'string', default: 'openrouter', description: 'Model provider' },
      opencodeUrl: {
        type: 'string',
        default: 'http://127.0.0.1:4096',
        description: 'OpenCode API URL',
      },
      timeout: { type: 'int', default: 300000, description: 'Max wait time (ms)' },
      outputDir: { type: 'string', default: '', description: 'Workspace dir for file exchange' },
    },
  },

  lifecycle: {
    validate: (inputs) => {
      if (!inputs.prompt) return false;
      return true;
    },

    cacheKey: (inputs, params) =>
      `opencode:${params.model}:${inputs.prompt}:${JSON.stringify(inputs.context)}`,

    execute: async (inputs, params) => {
      let { prompt, context } = inputs;
      let { model, provider, opencodeUrl, timeout, outputDir } = params;

      let baseUrl = opencodeUrl || process.env.OPENCODE_URL || 'http://127.0.0.1:4096';
      let modelConfig = {
        providerID: provider || process.env.OPENCODE_PROVIDER || 'openrouter',
        modelID: model || process.env.OPENCODE_MODEL || 'deepseek/deepseek-v3.2',
      };


      let workspace =
        outputDir || process.env.OPENCODE_WORKSPACE || path.join(os.tmpdir(), 'symbiote-engine-opencode');
      await fs.mkdir(workspace, { recursive: true });

      let taskPath = path.join(workspace, 'task.json');
      let outputPath = path.join(workspace, 'output.json');


      await fs.writeFile(
        taskPath,
        JSON.stringify(
          {
            type: 'symbiote-engine-ai',
            prompt,
            context,
            timestamp: Date.now(),
          },
          null,
          2,
        ),
        'utf8',
      );


      try {
        await fs.unlink(outputPath);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw new Error(`Failed to clean previous OpenCode output ${outputPath}: ${err.message}`);
        }
      }

      try {

        let sessionRes = await fetch(`${baseUrl}/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: `symbiote-engine ${Date.now()}` }),
          signal: requestSignal(30000, params.signal),
        });

        if (!sessionRes.ok) {
          return { result: null, error: `Session creation failed: ${sessionRes.status}` };
        }

        let session = await sessionRes.json();


        let contextBlock = context
          ? `\n\n## Context\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\``
          : '';

        let fullPrompt = `${prompt}${contextBlock}

## Workspace: ${workspace}

### Instructions:
1. Read task from ${taskPath}
2. Process the request
3. Write result as JSON to ${outputPath}

Output format: { "result": <your_result> }`;


        let msgRes = await fetch(`${baseUrl}/session/${session.id}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelConfig,
            parts: [{ type: 'text', text: fullPrompt }],
          }),
          signal: requestSignal(120000, params.signal),
        });

        if (!msgRes.ok) {
          return { result: null, error: `Message send failed: ${msgRes.status}` };
        }


        let startTime = Date.now();
        let pollInterval = 3000;

        while (Date.now() - startTime < timeout) {
          if (params.signal?.aborted) {
            return { result: null, error: 'OpenCode request aborted' };
          }

          let content;

          try {
            content = await fs.readFile(outputPath, 'utf8');
          } catch (err) {
            if (err.code !== 'ENOENT') {
              return {
                result: null,
                error: `Failed to read OpenCode output ${outputPath}: ${err.message}`,
              };
            }

            await new Promise((resolve) => setTimeout(resolve, pollInterval));
            continue;
          }

          let parsed;

          try {
            parsed = JSON.parse(content);
          } catch (err) {
            return {
              result: null,
              error: `Invalid JSON in OpenCode output ${outputPath}: ${err.message}`,
            };
          }

          if (parsed.result !== undefined) {
            return { result: parsed.result, error: null };
          }

          if (Object.keys(parsed).length > 0) {
            return { result: parsed, error: null };
          }

          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }

        return { result: null, error: `Timeout after ${timeout}ms waiting for AI response` };
      } catch (err) {
        return { result: null, error: err.message };
      }
    },
  },
};
