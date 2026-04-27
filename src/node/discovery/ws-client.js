// @ctx ws-client.ctx
import WebSocket from 'ws';
import { MCPMultiplexer } from '../proxy/mcp-multiplexer.js';

/**
 * Starts a WebSocket client to connect to a Master node.
 * This effectively makes the current node a "Remote MCP Server" from the perspective of the master.
 * 
 * @param {string} url - The WebSocket URL of the master node
 * @param {import('../proxy/mcp-proxy.js').MCPProxyManager} proxyManager 
 */
export function startWSClient(url, proxyManager) {
  let ws = new WebSocket(url);
  let multiplexer = new MCPMultiplexer(proxyManager);
  
  // Replace stdio writing with WebSocket sending
  multiplexer.sendToIde = (msg) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  ws.on('open', () => {
    console.error(`✅ [WSClient] Connected to master at ${url}`);
    
    // Start listening to child servers if not already started
    // If the proxy is already running, this will just wire up the callback
    proxyManager.startAllServers((serverName, msg) => {
      multiplexer.handleChildMessage(serverName, msg);
    });
  });

  ws.on('message', (data) => {
    try {
      let msg = JSON.parse(data.toString());
      multiplexer.handleIdeMessage(msg);
    } catch (err) {
      console.error('🔴 [WSClient] Failed to parse message from master:', err);
    }
  });

  ws.on('close', () => {
    console.error('🟡 [WSClient] Disconnected from master. Reconnecting in 5s...');
    setTimeout(() => startWSClient(url, proxyManager), 5000);
  });
  
  ws.on('error', (err) => {
    console.error(`🔴 [WSClient] Error: ${err.message}`);
  });
}
