/**
 * Portal — Named Reroutes for wireless connections
 *
 * Provides virtual sender/receiver pairs that act as invisible
 * connections. PortalManager tracks named channels and resolves
 * portal connections during graph evaluation.
 *
 * Usage:
 *   const pm = new PortalManager();
 *   pm.addSender('channelA', node1, 'output');
 *   pm.addReceiver('channelA', node2, 'input');
 *   pm.getConnections(); // returns virtual connections
 *
 * @module symbiote-ui/core/Portal
 */

/**
 * PortalManager — manages named reroute channels
 */
export class PortalManager {
  /** @type {Map<string, { senders: Array<{nodeId: string, portKey: string}>, receivers: Array<{nodeId: string, portKey: string}> }>} */
  #channels = new Map();

  /**
   * Register a sender portal
   * @param {string} channel - Named channel
   * @param {string} nodeId - Source node ID
   * @param {string} portKey - Output port key
   */
  addSender(channel, nodeId, portKey) {
    if (!this.#channels.has(channel)) {
      this.#channels.set(channel, { senders: [], receivers: [] });
    }
    this.#channels.get(channel).senders.push({ nodeId, portKey });
  }

  /**
   * Register a receiver portal
   * @param {string} channel - Named channel
   * @param {string} nodeId - Target node ID
   * @param {string} portKey - Input port key
   */
  addReceiver(channel, nodeId, portKey) {
    if (!this.#channels.has(channel)) {
      this.#channels.set(channel, { senders: [], receivers: [] });
    }
    this.#channels.get(channel).receivers.push({ nodeId, portKey });
  }

  /**
   * Remove all portals for a node
   * @param {string} nodeId
   */
  removeNode(nodeId) {
    for (const [, ch] of this.#channels) {
      ch.senders = ch.senders.filter((s) => s.nodeId !== nodeId);
      ch.receivers = ch.receivers.filter((r) => r.nodeId !== nodeId);
    }
  }

  /**
   * Get all virtual connections from portal channels
   * @returns {Array<{ from: string, out: string, to: string, in: string, channel: string }>}
   */
  getConnections() {
    let result = [];
    for (const [channel, ch] of this.#channels) {
      for (const sender of ch.senders) {
        for (const receiver of ch.receivers) {
          result.push({
            from: sender.nodeId,
            out: sender.portKey,
            to: receiver.nodeId,
            in: receiver.portKey,
            channel,
          });
        }
      }
    }
    return result;
  }

  /**
   * Get all channel names
   * @returns {string[]}
   */
  getChannels() {
    return [...this.#channels.keys()];
  }

  /**
   * Get channel info
   * @param {string} channel
   * @returns {{ senders: Array, receivers: Array }|undefined}
   */
  getChannel(channel) {
    return this.#channels.get(channel);
  }

  /** Clear all portals */
  clear() {
    this.#channels.clear();
  }
}

export { PortalManager as default };
