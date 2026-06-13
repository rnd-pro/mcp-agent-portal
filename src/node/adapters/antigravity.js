// @ctx adapters.ctx
import { spawn } from 'node:child_process';

let DEFAULT_TIMEOUT_SEC = 300;

function extractAntigravityBlocks(events, plainText) {
  let blocks = [];
  for (let ev of events) {
    if (ev.type === 'message' && ev.role === 'assistant') {
      let content = ev.content ?? ev.text ?? '';
      if (typeof content === 'string' && content) blocks.push({ type: 'text', text: content });
    }
    if (ev.type === 'functionCall' || ev.functionCall) {
      let fc = ev.functionCall || ev;
      blocks.push({ type: 'tool_use', name: fc.name, input: fc.args || fc.arguments || {} });
    }
    if (ev.type === 'functionResponse' || ev.functionResponse) {
      let fr = ev.functionResponse || ev;
      let lastTool = [...blocks].reverse().find(b => b.type === 'tool_use' && !b.result);
      if (lastTool) lastTool.result = typeof fr.response === 'string' ? fr.response : JSON.stringify(fr.response ?? '');
    }
    if (ev.type === 'tool_use') {
      blocks.push({ type: 'tool_use', name: ev.name, input: ev.input || {}, id: ev.id });
    }
    if (ev.type === 'tool_result') {
      let match = blocks.find(b => b.type === 'tool_use' && b.id === ev.tool_use_id && !b.result);
      if (match) match.result = ev.content?.map?.(c => c.text)?.join('') ?? ev.output ?? '';
    }
  }
  if (blocks.length === 0 && plainText.trim()) {
    blocks.push({ type: 'text', text: plainText.trim() });
  }
  return blocks;
}

function parseJsonLine(line) {
  let trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;
  try { return JSON.parse(trimmed); } catch { return null; }
}

function buildResponse(events, plainText) {
  let messages = events.filter((e) => e.type === 'message');
  let resultEvent = events.find((e) => e.type === 'result');
  let responseText = messages
    .filter((m) => m.role === 'assistant')
    .map((m) => m.content ?? m.text ?? '')
    .join('\n');
  return resultEvent?.response ?? (responseText || plainText.trim());
}

export function createAntigravityAdapter(config = {}) {
  let busy = false;
  let childProc = null;

  return {
    type: 'antigravity',
    get busy() { return busy; },

    async run({ prompt, cwd, model, timeout }) {
      busy = true;
      try {
        let { getGlobalTeamRules } = await import('../server/context-injector.js');
        let rules = getGlobalTeamRules();
        let finalPrompt = prompt;
        if (rules) {
          finalPrompt = `[GLOBAL TEAM CONTEXT AND RULES]\n${rules}\n[/GLOBAL TEAM CONTEXT AND RULES]\n\nTask:\n${prompt}`;
        }

        return await new Promise((resolve) => {
          let args = ['-p', finalPrompt, '--dangerously-skip-permissions'];
          let effectiveModel = model || config.model;
          if (effectiveModel && effectiveModel !== 'default') args.push('--model', effectiveModel);
          if (cwd) args.push('--cwd', cwd);

          let timeoutMs = (timeout ?? DEFAULT_TIMEOUT_SEC) * 1000;
          let spawnOpts = {
            cwd: cwd || process.env.HOME,
            env: { ...process.env, TERM: 'dumb', CI: '1' },
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: true,
          };

          childProc = spawn('agy', args, spawnOpts);

          const events = [];
          let stderrData = '';
          let buffer = '';
          let plainText = '';
          let timeoutHandle;
          let resolved = false;

          if (timeoutMs > 0) {
            timeoutHandle = setTimeout(() => {
              clearTimeout(timeoutHandle);
              timeoutHandle = null;
              resolved = true;

              resolve({
                response: buildResponse(events, plainText) || 'Timeout reached. Partial results returned.',
                exitCode: null,
                errors: stderrData ? [stderrData] : [],
                totalEvents: events.length,
                events: extractAntigravityBlocks(events, plainText),
              });

              if (childProc && childProc.pid) {
                try { process.kill(-childProc.pid, 'SIGTERM'); } catch (e) { console.warn('[antigravity] kill failed:', e.message); }
              }
            }, timeoutMs);
          }

          childProc.stdout.on('data', (chunk) => {
            buffer += chunk.toString();
            let lines = buffer.split('\n');
            buffer = lines.pop();

            for (let line of lines) {
              let parsed = parseJsonLine(line);
              if (parsed) {
                events.push(parsed);
              } else if (line.trim()) {
                plainText += `${line}\n`;
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
              let parsed = parseJsonLine(buffer);
              if (parsed) events.push(parsed);
              else plainText += buffer;
            }

            let errors = events.filter((e) => e.type === 'error');

            resolve({
              response: buildResponse(events, plainText),
              exitCode: code,
              errors: errors.map((e) => e.message ?? e.error ?? JSON.stringify(e)).concat(stderrData && code !== 0 ? [stderrData] : []),
              totalEvents: events.length,
              events: extractAntigravityBlocks(events, plainText),
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
              errors: [`Failed to spawn agy: ${err.message}`],
              totalEvents: events.length,
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
        try { process.kill(-childProc.pid, 'SIGTERM'); } catch (e) { console.warn('[antigravity] destroy kill failed:', e.message); }
        childProc = null;
      }
      busy = false;
    },
  };
}
