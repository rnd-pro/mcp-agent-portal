/**
 * @file demo/native-panels-webgl-lab-data.js
 * @description Deterministic, generic mock data for the native panels WebGL lab.
 */

/**
 * @returns {Object<string, Object>} Family data keyed by stable panel id.
 */
export function createNativePanelLabData() {
  return {
    activity: {
      family: 'list-table',
      title: 'Activity',
      rows: [
        { id: 'row-alpha', title: 'Alpha entry', detail: 'First list row', badge: { text: 'ok', tone: 'success' } },
        { id: 'row-beta', title: 'Beta entry', detail: 'Second list row', tone: 'accent' },
        { id: 'row-gamma', title: 'Gamma entry', detail: 'Third list row', badge: { text: 'warn', tone: 'warning' } },
        { id: 'row-delta', title: 'Delta entry', detail: 'Fourth list row' },
        { id: 'row-epsilon', title: 'Epsilon entry', detail: 'Fifth list row', badge: { text: 'err', tone: 'danger' } },
        { id: 'row-zeta', title: 'Zeta entry', detail: 'Sixth list row', tone: 'accent' },
      ],
    },
    pipeline: {
      family: 'workflow-graph',
      title: 'Pipeline',
      nodes: [
        { id: 'node-source', label: 'Source' },
        { id: 'node-parse', label: 'Parse' },
        { id: 'node-score', label: 'Score', tone: 'accent' },
        { id: 'node-gate', label: 'Gate', tone: 'warning' },
        { id: 'node-sink', label: 'Sink', tone: 'success' },
      ],
      edges: [
        { source: 'node-source', target: 'node-parse' },
        { source: 'node-parse', target: 'node-score' },
        { source: 'node-score', target: 'node-gate' },
        { source: 'node-gate', target: 'node-sink' },
      ],
    },
    inspector: {
      family: 'detail-actions',
      title: 'Inspector',
      fields: [
        { id: 'field-id', label: 'Target', value: 'none' },
        { id: 'field-kind', label: 'Kind', value: 'unselected' },
        { id: 'field-state', label: 'State', value: 'idle' },
        { id: 'field-layer', label: 'Layer', value: 'content' },
      ],
      actions: [
        { id: 'apply', label: 'Apply', tone: 'accent' },
        { id: 'hold', label: 'Hold', tone: 'warning' },
        { id: 'discard', label: 'Discard', tone: 'danger' },
      ],
    },
  };
}
