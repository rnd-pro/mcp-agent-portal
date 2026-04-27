// @ctx gemini.ctx
import { spawn } from 'node:child_process';

let DEFAULT_TIMEOUT_SEC = 300;

export function createGeminiAdapter(config = {}) {
  let busy = false;
  let childProc = null;

  return {
    type: 'gemini',
    get busy() { return busy; },

    async run({ prompt, cwd, model, timeout }) {
      busy = true;
      try {
        return await new Promise((resolve) => {
          const args = [
            '-p', prompt,
            '--output-format', 'stream-json',
            '--approval-mode', 'yolo'
          ];
          
          const effectiveModel = model || config.model;
          if (effectiveModel) {
            args.push('--model', effectiveModel);
          }

          const timeoutMs = (timeout ?? DEFAULT_TIMEOUT_SEC) * 1000;

          const spawnOpts = {
            cwd: cwd ?? process.cwd(),
            env: { ...process.env, TERM: 'dumb', CI: '1' },
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: true,
          };

          childProc = spawn('gemini', args, spawnOpts);

          const events = [];
          let stderrData = '';
          let buffer = '';
          let timeoutHandle;
          let resolved = false;

          if (timeoutMs > 0) {
            timeoutHandle = setTimeout(() => {
              clearTimeout(timeoutHandle);
              timeoutHandle = null;
              resolved = true;
              
              const messages = events.filter((e) => e.type === 'message');
              const responseText = messages
                .filter((m) => m.role === 'assistant')
                .map((m) => m.content ?? m.text ?? '')
                .join('\n');

              resolve({
                response: responseText || '⏳ Timeout reached. Partial results returned.',
                exitCode: null,
                errors: stderrData ? [stderrData] : [],
                totalEvents: events.length,
              });
              
              if (childProc && childProc.pid) {
                try { process.kill(-childProc.pid, 'SIGTERM'); } catch {}
              }
            }, timeoutMs);
          }

          childProc.stdout.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                events.push(JSON.parse(trimmed));
              } catch {
                // Ignore non-JSON
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
              try { events.push(JSON.parse(buffer.trim())); } catch {}
            }

            const messages = events.filter((e) => e.type === 'message');
            const resultEvent = events.find((e) => e.type === 'result');
            const errors = events.filter((e) => e.type === 'error');

            const responseText = messages
              .filter((m) => m.role === 'assistant')
              .map((m) => m.content ?? m.text ?? '')
              .join('');

            resolve({
              response: resultEvent?.response ?? responseText,
              exitCode: code,
              errors: errors.map((e) => e.message ?? e.error ?? JSON.stringify(e)).concat(stderrData ? [stderrData] : []),
              totalEvents: events.length,
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
              errors: [`Failed to spawn gemini: ${err.message}`],
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
        try { process.kill(-childProc.pid, 'SIGTERM'); } catch {}
        childProc = null;
      }
      busy = false;
    }
  };
}
