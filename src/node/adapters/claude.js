// @ctx claude.ctx
import { spawn } from 'node:child_process';

let DEFAULT_TIMEOUT_SEC = 300;

/**
 * Extract structured content blocks from Claude stream-json events.
 * Returns an array of { type, text?, name?, input?, result? } blocks.
 * @param {Array} events - raw stream-json events
 * @returns {Array}
 */
function extractContentBlocks(events) {
  let blocks = [];
  for (let ev of events) {
    if (ev.type === 'assistant' && ev.message?.content) {
      for (let block of ev.message.content) {
        if (block.type === 'text' && block.text) {
          blocks.push({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use') {
          blocks.push({ type: 'tool_use', name: block.name, input: block.input, id: block.id });
        }
      }
    } else if (ev.type === 'tool_result' || ev.type === 'result_tool_use') {
      // Match tool result to its call by id
      let existingTool = blocks.find(b => b.type === 'tool_use' && b.id === ev.tool_use_id);
      if (existingTool) {
        existingTool.result = ev.content?.map?.(c => c.text)?.join('') ?? ev.output ?? '';
      }
    }
  }
  return blocks;
}

/**
 * Create a Claude Code CLI adapter instance.
 * Uses @anthropic-ai/claude-code — `claude -p "prompt" --output-format stream-json`
 *
 * @param {object} [config]
 * @param {string} [config.model]
 * @returns {import('./base.js').AdapterInstance}
 */
export function createClaudeAdapter(config = {}) {
  let busy = false;
  let childProc = null;

  return {
    type: 'claude',
    get busy() { return busy; },

    async run({ prompt, cwd, model, timeout }) {
      busy = true;
      try {
        const { getGlobalTeamRules } = await import('../server/context-injector.js');
        const rules = getGlobalTeamRules();
        let finalPrompt = prompt;
        if (rules) {
          finalPrompt = `[GLOBAL TEAM CONTEXT AND RULES]\n${rules}\n[/GLOBAL TEAM CONTEXT AND RULES]\n\nTask:\n${prompt}`;
        }

        return await new Promise((resolve) => {
          let args = [
            '-p', finalPrompt,
            '--output-format', 'stream-json',
          ];

          let effectiveModel = model || config.model;
          if (effectiveModel) {
            args.push('--model', effectiveModel);
          }

          let timeoutMs = (timeout ?? DEFAULT_TIMEOUT_SEC) * 1000;

          let spawnOpts = {
            cwd: cwd || process.env.HOME,
            env: { ...process.env, TERM: 'dumb', CI: '1' },
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: true,
          };

          childProc = spawn('claude', args, spawnOpts);

          let events = [];
          let stderrData = '';
          let buffer = '';
          let timeoutHandle;
          let resolved = false;

          if (timeoutMs > 0) {
            timeoutHandle = setTimeout(() => {
              clearTimeout(timeoutHandle);
              timeoutHandle = null;
              resolved = true;

              let responseText = events
                .filter((e) => e.type === 'assistant')
                .map((e) => e.message?.content?.map(b => b.text)?.join('') ?? '')
                .join('\n');

              resolve({
                response: responseText || '⏳ Timeout reached. Partial results returned.',
                exitCode: null,
                errors: stderrData ? [stderrData] : [],
                totalEvents: events.length,
                events: extractContentBlocks(events),
              });

              if (childProc && childProc.pid) {
                try { process.kill(-childProc.pid, 'SIGTERM'); } catch (e) { console.warn('[claude] kill failed:', e.message); }
              }
            }, timeoutMs);
          }

          childProc.stdout.on('data', (chunk) => {
            buffer += chunk.toString();
            let lines = buffer.split('\n');
            buffer = lines.pop();
            for (let line of lines) {
              let trimmed = line.trim();
              if (!trimmed) continue;
              try {
                events.push(JSON.parse(trimmed));
              } catch (e) {
                // Ignore partial JSON chunks during stream
              }
            }
          });

          childProc.stderr.on('data', (chunk) => {
            stderrData += chunk.toString();
          });

          childProc.on('close', (code) => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            if (resolved) return;
            resolved = true;
            childProc = null;

            if (buffer.trim()) {
              try { events.push(JSON.parse(buffer.trim())); } catch (e) { console.warn('[claude] final parse error:', e.message); }
            }

            // Claude stream-json: result event has the final response
            let resultEvent = events.find((e) => e.type === 'result');
            let assistantMessages = events
              .filter((e) => e.type === 'assistant')
              .map((e) => e.message?.content?.map(b => b.text)?.join('') ?? '');
            let errors = events.filter((e) => e.type === 'error');

            resolve({
              response: resultEvent?.result ?? assistantMessages.join(''),
              exitCode: code,
              errors: errors.map((e) => e.error?.message ?? JSON.stringify(e)).concat(stderrData ? [stderrData] : []),
              totalEvents: events.length,
              events: extractContentBlocks(events),
            });
          });

          childProc.on('error', (err) => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            if (resolved) return;
            resolved = true;
            childProc = null;
            resolve({
              response: '',
              exitCode: null,
              errors: [`Failed to spawn claude: ${err.message}`],
              totalEvents: 0,
            });
          });

          childProc.stdin.end();
        });
      } finally {
        busy = false;
        childProc = null;
      }
    },

    destroy() {
      if (childProc && childProc.pid) {
        try { process.kill(-childProc.pid, 'SIGTERM'); } catch (e) { console.warn('[claude] destroy kill failed:', e.message); }
        childProc = null;
      }
      busy = false;
    },
  };
}

export default createClaudeAdapter;
