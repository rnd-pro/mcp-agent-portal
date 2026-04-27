// @ctx adapter-opencode.ctx
import http from 'node:http';

const DEFAULT_TIMEOUT_SEC = 300;

/**
 * Create an OpenCode/Crush adapter instance.
 * Connects to a locally running OpenCode instance via HTTP API.
 *
 * @param {object} [config]
 * @param {string} [config.baseUrl] - OpenCode API URL (default: http://127.0.0.1:4100)
 * @param {string} [config.model]
 * @returns {import('./base.js').AdapterInstance}
 */
export function createOpencodeAdapter(config = {}) {
  let busy = false;
  let baseUrl = config.baseUrl || 'http://127.0.0.1:4100';

  /**
   * @param {string} method
   * @param {string} path
   * @param {object} [data]
   * @param {number} [timeoutMs]
   * @returns {Promise<any>}
   */
  function request(method, path, data, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      let url = new URL(path, baseUrl);
      let options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: { 'Content-Type': 'application/json' },
        timeout: timeoutMs,
      };

      let req = http.request(options, (res) => {
        let chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let raw = Buffer.concat(chunks).toString();
          try { resolve(JSON.parse(raw)); }
          catch { resolve({ response: raw }); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      if (data) req.write(JSON.stringify(data));
      req.end();
    });
  }

  return {
    type: 'opencode',
    get busy() { return busy; },

    async run({ prompt, cwd, model, timeout }) {
      busy = true;
      try {
        let timeoutMs = (timeout ?? DEFAULT_TIMEOUT_SEC) * 1000;
        let result = await request('POST', '/v1/chat', {
          prompt,
          cwd: cwd ?? process.cwd(),
          model: model || config.model || 'auto',
        }, timeoutMs);

        return {
          response: result.response ?? result.text ?? JSON.stringify(result),
          exitCode: 0,
          errors: result.error ? [result.error] : [],
          totalEvents: 1,
        };
      } catch (err) {
        return {
          response: '',
          exitCode: null,
          errors: [`OpenCode adapter error: ${err.message}`],
          totalEvents: 0,
        };
      } finally {
        busy = false;
      }
    },

    destroy() {
      busy = false;
    },
  };
}

export default createOpencodeAdapter;
