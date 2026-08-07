/**
 * AgentUICommands.js - Agent UI control command builders
 *
 * Pure data builders for WebSocket messages that control the UI.
 * No WebSocket dependency — produces message objects for P23 bridge to send.
 *
 * @module symbiote-engine/AgentUICommands
 */

/**
 * @typedef {object} UICommand
 * @property {string} type - Command type (ui:layout, ui:focus, etc.)
 * @property {object} payload - Command payload
 */

/**
 * Switch UI layout — control which panels are visible
 * @param {string[]} panels - Panel names to show
 * @param {string} [split='horizontal'] - Split direction
 * @returns {UICommand}
 */
export function layout(panels, split = 'horizontal') {
  return { type: 'ui:layout', payload: { panels, split } };
}

/**
 * Focus on a specific panel or node
 * @param {string} panel - Panel name to focus
 * @param {string} [nodeId] - Optional node to zoom to
 * @returns {UICommand}
 */
export function focus(panel, nodeId) {
  return { type: 'ui:focus', payload: { panel, nodeId } };
}

/**
 * Select nodes on canvas
 * @param {string[]} nodeIds - Node IDs to select
 * @returns {UICommand}
 */
export function select(nodeIds) {
  return { type: 'ui:select', payload: { nodeIds } };
}

/**
 * Navigate into a compound node
 * @param {string} compoundId - Compound node ID to enter
 * @returns {UICommand}
 */
export function navigate(compoundId) {
  return { type: 'ui:navigate', payload: { compoundId } };
}

/**
 * Control timeline playback
 * @param {'play'|'stop'|'seek'} action - Playback action
 * @param {number} [frame] - Frame to seek to (for 'seek' action)
 * @returns {UICommand}
 */
export function playback(action, frame) {
  let payload = { action };
  if (frame !== undefined) payload.frame = frame;
  return { type: 'ui:playback', payload };
}

/**
 * Show notification to user
 * @param {string} message - Notification text
 * @param {'info'|'success'|'warning'|'error'} [type='info'] - Notification type
 * @returns {UICommand}
 */
export function notify(message, type = 'info') {
  return { type: 'ui:notify', payload: { message, type } };
}

/**
 * Move virtual agent cursor on canvas
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {string} [label] - Cursor label text
 * @returns {UICommand}
 */
export function cursor(x, y, label) {
  let payload = { x, y };
  if (label) payload.label = label;
  return { type: 'ui:cursor', payload };
}

/**
 * All command types for reference
 */
export let COMMAND_TYPES = [
  'ui:layout',
  'ui:focus',
  'ui:select',
  'ui:navigate',
  'ui:playback',
  'ui:notify',
  'ui:cursor',
];
