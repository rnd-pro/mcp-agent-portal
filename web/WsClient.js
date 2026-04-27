/**
 * WsClient — static singleton WebSocket client.
 * Pattern from cloud-images-toolkit: auto-connect, auto-reconnect, callback registry.
 *
 * Usage:
 *   WsClient.onUpdate(cb)    — register for data updates
 *   WsClient.onStatus(cb)    — register for connection status changes
 *   WsClient.send(msg)       — send JSON message (auto-connects if needed)
 *   WsClient.call(method, params) — JSON-RPC tool call with timeout
 *
 * @module WsClient
 */
export class WsClient {

  /** @type {WebSocket|null} */
  static ws = null;
  static _reconnectTimer = null;
  static _updateCallbacks = [];
  static _eventCallbacks = [];
  static _statusCallbacks = [];
  static _pendingCalls = new Map();
  static _callId = 1;

  static connect() {
    if (this.ws) return;

    let base = new URL('.', import.meta.url).href.replace(/^http/, 'ws');
    this.ws = new WebSocket(`${base}ws/monitor`);

    this._statusCallbacks.forEach(cb => cb('connecting'));

    this.ws.onopen = () => {
      this._statusCallbacks.forEach(cb => cb('connected'));
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }
    };

    this.ws.onmessage = ({ data }) => {
      try {
        let msg = JSON.parse(data);

        // JSON-RPC response
        if (msg.id && (msg.result !== undefined || msg.error)) {
          let pending = this._pendingCalls.get(msg.id);
          if (pending) {
            this._pendingCalls.delete(msg.id);
            if (msg.error) pending.reject(new Error(msg.error.message || 'Tool error'));
            else pending.resolve(msg.result);
          }
          return;
        }

        // Snapshot update
        if (msg.method === 'snapshot') {
          this._updateCallbacks.forEach(cb => cb(msg.params.state));
          return;
        }

        // Generic event
        this._eventCallbacks.forEach(cb => cb(msg));
      } catch (err) {
        console.error('🔴 [WsClient] Failed to parse message:', err);
      }
    };

    this.ws.onclose = () => {
      this._statusCallbacks.forEach(cb => cb('disconnected'));
      this.ws = null;

      // Reject all pending calls
      for (let [id, { reject }] of this._pendingCalls) {
        reject(new Error('WebSocket disconnected'));
      }
      this._pendingCalls.clear();

      // Auto-reconnect with 2s delay
      this._reconnectTimer = setTimeout(() => {
        this._reconnectTimer = null;
        this.connect();
      }, 2000);
    };

    this.ws.onerror = () => {
      // onclose will handle reconnect
    };
  }

  /**
   * Send a raw JSON message. Auto-connects if needed.
   * @param {object} msg
   */
  static send(msg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect();
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * JSON-RPC tool call with timeout.
   * @param {string} method
   * @param {object} [params]
   * @param {number} [timeoutMs]
   * @returns {Promise<any>}
   */
  static call(method, params = {}, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('WebSocket not connected'));
      }
      let id = this._callId++;
      this._pendingCalls.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tool',
        params: { name: method, args: params },
      }));
      setTimeout(() => {
        if (this._pendingCalls.has(id)) {
          this._pendingCalls.delete(id);
          reject(new Error(`Tool call timeout: ${method}`));
        }
      }, timeoutMs);
    });
  }

  /**
   * Register callback for state updates (snapshot messages).
   * @param {(state: object) => void} cb
   * @returns {() => void} unsubscribe
   */
  static onUpdate(cb) {
    this._updateCallbacks.push(cb);
    return () => {
      this._updateCallbacks = this._updateCallbacks.filter(c => c !== cb);
    };
  }

  /**
   * Register callback for raw events.
   * @param {(event: object) => void} cb
   * @returns {() => void} unsubscribe
   */
  static onEvent(cb) {
    this._eventCallbacks.push(cb);
    return () => {
      this._eventCallbacks = this._eventCallbacks.filter(c => c !== cb);
    };
  }

  /**
   * Register callback for connection status changes.
   * @param {(status: 'connected' | 'disconnected' | 'connecting') => void} cb
   * @returns {() => void} unsubscribe
   */
  static onStatus(cb) {
    this._statusCallbacks.push(cb);
    return () => {
      this._statusCallbacks = this._statusCallbacks.filter(c => c !== cb);
    };
  }

  static close() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export default WsClient;
