/**
 * io/http-request — Universal HTTP client node
 *
 * Performs HTTP requests using native fetch API.
 * Supports GET, POST, PUT, DELETE with configurable headers and timeout.
 *
 * @module symbiote-engine/packs/io/http-request
 */

/**
 * Build an abort signal for request timeout handling.
 * @returns {AbortSignal}
 */
function requestSignal(timeout, parentSignal) {
  let timeoutSignal = AbortSignal.timeout(timeout);
  return parentSignal && AbortSignal.any
    ? AbortSignal.any([parentSignal, timeoutSignal])
    : timeoutSignal;
}

export default {
  type: 'io/http-request',
  category: 'io',
  icon: 'http',

  driver: {
    description: 'HTTP request (fetch) — GET, POST, PUT, DELETE',
    inputs: [
      { name: 'url', type: 'string' },
      { name: 'body', type: 'any' },
    ],
    outputs: [
      { name: 'response', type: 'any' },
      { name: 'status', type: 'number' },
      { name: 'error', type: 'string' },
    ],
    params: {
      method: { type: 'string', default: 'GET', description: 'HTTP method' },
      headers: { type: 'object', default: {}, description: 'Request headers' },
      timeout: { type: 'int', default: 30000, description: 'Timeout (ms)' },
      responseType: { type: 'string', default: 'auto', description: 'json | text | auto' },
    },
  },

  lifecycle: {
    validate: (inputs) => {
      if (!inputs.url) return false;
      return true;
    },

    cacheKey: (inputs, params) =>
      `http:${params.method}:${inputs.url}:${JSON.stringify(inputs.body)}`,

    execute: async (inputs, params) => {
      let { url, body } = inputs;
      let { method, headers, timeout, responseType } = params;

      try {
        let fetchOptions = {
          method: method || 'GET',
          headers: { ...headers },
          signal: requestSignal(timeout, params.signal),
        };

        if (body && method !== 'GET' && method !== 'HEAD') {
          if (typeof body === 'object') {
            fetchOptions.body = JSON.stringify(body);
            fetchOptions.headers['Content-Type'] =
              fetchOptions.headers['Content-Type'] || 'application/json';
          } else {
            fetchOptions.body = String(body);
          }
        }

        let res = await fetch(url, fetchOptions);

        let response;
        let contentType = res.headers.get('content-type') || '';

        if (responseType === 'json' || (responseType === 'auto' && contentType.includes('json'))) {
          response = await res.json();
        } else {
          response = await res.text();
        }

        return { response, status: res.status, error: null };
      } catch (err) {
        return { response: null, status: 0, error: err.message };
      }
    },
  },
};
