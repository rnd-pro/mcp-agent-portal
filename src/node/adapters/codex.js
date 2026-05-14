// @ctx adapters.ctx
import { spawn } from 'node:child_process';

let DEFAULT_TIMEOUT_SEC = 300;

/**
 * Extract structured content blocks from Codex exec --json JSONL events.
 *
 * Verified event schema (codex-cli 0.130.0):
 *   thread.started  → { thread_id }
 *   turn.started    → {}
 *   item.started    → { item: { id, type, ... status:"in_progress" } }
 *   item.completed  → { item: { id, type, ... status:"completed" } }
 *     item types:
 *       agent_message      → { text: string }
 *       command_execution  → { command, aggregated_output, exit_code, status }
 *       file_change        → { changes: [{ kind, path }] }
 *       mcp_tool_call      → { name, arguments, output }
 *   turn.completed  → { usage: { input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens } }
 *
 * @param {Array} events - raw JSONL events
 * @returns {Array}
 */
function extractCodexBlocks(events) {
  let blocks = [];
  for (let ev of events) {
    if (ev.type === 'item.completed' && ev.item) {
      let item = ev.item;
      if (item.type === 'agent_message') {
        let text = item.text ?? '';
        if (text) {
          blocks.push({ type: 'text', text });
        }
      } else if (item.type === 'command_execution') {
        blocks.push({
          type: 'tool_use',
          name: 'shell',
          input: { command: item.command ?? '' },
          result: item.aggregated_output ?? '',
          exitCode: item.exit_code ?? null,
          status: item.status ?? 'completed',
        });
      } else if (item.type === 'file_change') {
        let changes = item.changes ?? [];
        blocks.push({
          type: 'tool_use',
          name: 'file_change',
          input: { changes: changes.map(c => `${c.kind}: ${c.path}`).join(', ') },
          result: `${changes.length} file(s) changed`,
        });
      } else if (item.type === 'mcp_tool_call') {
        blocks.push({
          type: 'tool_use',
          name: item.name ?? 'mcp_tool',
          input: item.arguments ?? item.input ?? {},
          result: item.output ?? item.result ?? '',
        });
      }
    }
  }
  return blocks;
}

/**
 * Extract response text from agent_message events.
 * @param {Array} events
 * @returns {string}
 */
function extractResponseText(events) {
  return events
    .filter(e => e.type === 'item.completed' && e.item?.type === 'agent_message')
    .map(e => e.item.text ?? '')
    .join('\n');
}

/**
 * Extract token usage from turn.completed event.
 * @param {Array} events
 * @returns {{inputTokens: number, cachedInputTokens: number, outputTokens: number, reasoningTokens: number}|null}
 */
function extractUsage(events) {
  let turnCompleted = events.find(e => e.type === 'turn.completed' && e.usage);
  if (!turnCompleted) return null;
  let u = turnCompleted.usage;
  return {
    inputTokens: u.input_tokens ?? 0,
    cachedInputTokens: u.cached_input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    reasoningTokens: u.reasoning_output_tokens ?? 0,
  };
}

/**
 * Extract thread ID for session resumption.
 * @param {Array} events
 * @returns {string|null}
 */
function extractThreadId(events) {
  let threadEvent = events.find(e => e.type === 'thread.started');
  return threadEvent?.thread_id ?? null;
}

/**
 * Filter benign Codex CLI stderr noise from error output.
 * 'Reading additional input from stdin...' is always emitted and is not an error.
 * @param {string} stderrData
 * @returns {string[]}
 */
function filteredStderrErrors(stderrData) {
  if (!stderrData) return [];
  let filtered = stderrData
    .split('\n')
    .filter(line => line.trim() !== 'Reading additional input from stdin...')
    .join('\n')
    .trim();
  return filtered ? [filtered] : [];
}

/**
 * Create an OpenAI Codex CLI adapter instance.
 * Uses `codex exec --json -s danger-full-access "prompt"`
 *
 * @param {object} [config]
 * @param {string} [config.model]
 * @returns {import('./base.js').AdapterInstance}
 */
export function createCodexAdapter(config = {}) {
  let busy = false;
  let childProc = null;

  return {
    type: 'codex',
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
            'exec',
            '--json',
            '-s', 'danger-full-access',
            finalPrompt,
          ];

          let effectiveModel = model || config.model;
          if (effectiveModel && effectiveModel !== 'default') {
            args.push('--model', effectiveModel);
          }

          let timeoutMs = (timeout ?? DEFAULT_TIMEOUT_SEC) * 1000;

          let spawnOpts = {
            cwd: cwd || process.env.HOME,
            env: { ...process.env, TERM: 'dumb', CI: '1' },
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: true,
          };

          childProc = spawn('codex', args, spawnOpts);

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

              resolve({
                response: extractResponseText(events) || '⏳ Timeout reached. Partial results returned.',
                exitCode: null,
                errors: filteredStderrErrors(stderrData),
                totalEvents: events.length,
                events: extractCodexBlocks(events),
                usage: extractUsage(events),
                threadId: extractThreadId(events),
              });

              if (childProc && childProc.pid) {
                try { process.kill(-childProc.pid, 'SIGTERM'); } catch (e) { console.warn('[codex] kill failed:', e.message); }
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
              } catch {
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
              try { events.push(JSON.parse(buffer.trim())); } catch (e) { console.warn('[codex] final parse error:', e.message); }
            }

            let errors = events
              .filter(e => e.type === 'error')
              .map(e => e.message ?? e.error ?? JSON.stringify(e));

            resolve({
              response: extractResponseText(events),
              exitCode: code,
              errors: errors.concat(filteredStderrErrors(stderrData)),
              totalEvents: events.length,
              events: extractCodexBlocks(events),
              usage: extractUsage(events),
              threadId: extractThreadId(events),
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
              errors: [`Failed to spawn codex: ${err.message}`],
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
        try { process.kill(-childProc.pid, 'SIGTERM'); } catch (e) { console.warn('[codex] destroy kill failed:', e.message); }
        childProc = null;
      }
      busy = false;
    },
  };
}

export default createCodexAdapter;
