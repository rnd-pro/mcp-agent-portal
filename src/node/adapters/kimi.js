// @ctx kimi.ctx
import { spawn } from 'node:child_process';

let DEFAULT_TIMEOUT_SEC = 300;

const KIMI_THINKING_EFFORTS = new Set(['low', 'high', 'max']);

function normalizeThinkingEffort(value) {
  let normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized === 'default') return null;
  return KIMI_THINKING_EFFORTS.has(normalized) ? normalized : null;
}

/**
 * Extract structured content blocks from Kimi Code stream-json events.
 * Kimi emits role-based JSONL events:
 *   {"role":"assistant","content":"text"}
 *   {"role":"assistant","tool_calls":[{"type":"function","id":"x","function":{"name":"Tool","arguments":"{...}"}}]}
 *   {"role":"tool","tool_call_id":"x","content":"result"}
 * Returns an array of { type, text?, name?, input?, result? } blocks.
 * @param {Array} events - raw stream-json events
 * @returns {Array}
 */
function extractContentBlocks(events) {
  let blocks = [];
  for (let ev of events) {
    if (ev.role === 'assistant') {
      if (typeof ev.content === 'string' && ev.content) {
        blocks.push({ type: 'text', text: ev.content });
      }
      if (Array.isArray(ev.tool_calls)) {
        for (let call of ev.tool_calls) {
          let rawArgs = call.function?.arguments;
          let input = rawArgs;
          if (typeof rawArgs === 'string') {
            try { input = JSON.parse(rawArgs); } catch (e) { input = rawArgs; }
          }
          blocks.push({ type: 'tool_use', name: call.function?.name ?? 'unknown', input, id: call.id });
        }
      }
    } else if (ev.role === 'tool') {
      // Match tool result to its call by id
      let existingTool = blocks.find(b => b.type === 'tool_use' && b.id === ev.tool_call_id);
      if (existingTool) {
        existingTool.result = typeof ev.content === 'string' ? ev.content : JSON.stringify(ev.content ?? '');
      }
    }
  }
  return blocks;
}

/**
 * Extract the plain-text response from Kimi stream-json events.
 * @param {Array} events
 * @returns {string}
 */
function extractResponseText(events) {
  return events
    .filter((e) => e.role === 'assistant' && typeof e.content === 'string' && e.content)
    .map((e) => e.content)
    .join('\n');
}

/**
 * Extract the session id from the meta session.resume_hint event.
 * @param {Array} events
 * @returns {string|null}
 */
function extractSessionId(events) {
  return events.find((e) => e.role === 'meta' && e.type === 'session.resume_hint' && e.session_id)?.session_id
    ?? events.find((e) => e.session_id)?.session_id
    ?? null;
}

/**
 * Create a Kimi Code CLI adapter instance.
 * Uses `kimi -p "prompt" --output-format stream-json`
 *
 * @param {object} [config]
 * @param {string} [config.model]
 * @returns {import('./base.js').AdapterInstance}
 */
export function createKimiAdapter(config = {}) {
  let busy = false;
  let childProc = null;

  return {
    type: 'kimi',
    get busy() { return busy; },

    async run({ prompt, cwd, model, timeout, thinkingEffort }) {
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
          if (effectiveModel === 'default') effectiveModel = null;
          if (effectiveModel) {
            args.push('-m', effectiveModel);
          }

          let effectiveThinkingEffort = normalizeThinkingEffort(thinkingEffort);
          let timeoutMs = (timeout ?? DEFAULT_TIMEOUT_SEC) * 1000;

          let spawnOpts = {
            cwd: cwd || process.env.HOME,
            env: {
              ...process.env,
              TERM: 'dumb',
              CI: '1',
              // Unconditional: an explicit effort wins, otherwise scrub any
              // inherited value so runs stay deterministic.
              KIMI_MODEL_THINKING_EFFORT: effectiveThinkingEffort || undefined,
            },
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: true,
          };

          childProc = spawn('kimi', args, spawnOpts);

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

              let responseText = extractResponseText(events);

              resolve({
                response: responseText || '⏳ Timeout reached. Partial results returned.',
                exitCode: null,
                errors: stderrData ? [stderrData] : [],
                totalEvents: events.length,
                events: extractContentBlocks(events),
                sessionId: extractSessionId(events),
              });

              if (childProc && childProc.pid) {
                try { process.kill(-childProc.pid, 'SIGTERM'); } catch (e) { console.warn('[kimi] kill failed:', e.message); }
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
              try { events.push(JSON.parse(buffer.trim())); } catch (e) { console.warn('[kimi] final parse error:', e.message); }
            }

            let errors = events.filter((e) => e.role === 'error' || e.type === 'error');

            resolve({
              response: extractResponseText(events),
              exitCode: code,
              errors: errors.map((e) => e.message ?? JSON.stringify(e)).concat(stderrData ? [stderrData] : []),
              totalEvents: events.length,
              events: extractContentBlocks(events),
              sessionId: extractSessionId(events),
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
              errors: [`Failed to spawn kimi: ${err.message}`],
              totalEvents: 0,
              sessionId: null,
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
        try { process.kill(-childProc.pid, 'SIGTERM'); } catch (e) { console.warn('[kimi] destroy kill failed:', e.message); }
        childProc = null;
      }
      busy = false;
    },
  };
}

export default createKimiAdapter;
