/**
 * SubgraphNode — Node containing an embedded graph
 *
 * Extends Node with an inner NodeEditor that holds a sub-pipeline.
 * Ports are auto-generated from exposed inner nodes.
 * Supports drill-down navigation via SubgraphManager.
 *
 * @module symbiote-ui/core/SubgraphNode
 */

import { Node } from './Node.js';
import { NodeEditor } from './Editor.js';
import { Socket, Input, Output } from './Socket.js';

export class SubgraphNode extends Node {
  /** @type {NodeEditor} */
  innerEditor;

  /** @type {Object<string, { x: number, y: number }>} */
  innerPositions = {};

  /** @type {{ panX: number, panY: number, zoom: number }} */
  innerTransform = { panX: 0, panY: 0, zoom: 1 };

  /**
   * @param {string} label - Display name
   * @param {object} [options={}]
   * @param {string} [options.category='subgraph']
   * @param {string} [options.icon='account_tree']
   */
  constructor(label, options = {}) {
    super(label, {
      type: 'subgraph',
      category: options.category ?? 'subgraph',
      icon: options.icon ?? 'account_tree',
      shape: 'rect',
      ...options,
    });

    this.innerEditor = new NodeEditor();
    this._isSubgraph = true;
  }

  /**
   * Sync external ports with inner graph exposed nodes.
   * Inner nodes with `_exposed: 'input'` become subgraph inputs.
   * Inner nodes with `_exposed: 'output'` become subgraph outputs.
   */
  syncPorts() {

    for (const key of Object.keys(this.inputs)) {
      if (key.startsWith('sg_')) this.removeInput(key);
    }
    for (const key of Object.keys(this.outputs)) {
      if (key.startsWith('sg_')) this.removeOutput(key);
    }

    let anySocket = new Socket('any', { color: '#94a3b8' });


    for (const innerNode of this.innerEditor.getNodes()) {
      if (innerNode._exposed === 'input') {
        for (const [key, output] of Object.entries(innerNode.outputs)) {
          let portKey = `sg_${innerNode.id}_${key}`;
          this.addInput(portKey, new Input(output.socket ?? anySocket, innerNode.label ?? key));
        }
      }
      if (innerNode._exposed === 'output') {
        for (const [key, input] of Object.entries(innerNode.inputs)) {
          let portKey = `sg_${innerNode.id}_${key}`;
          this.addOutput(portKey, new Output(input.socket ?? anySocket, innerNode.label ?? key));
        }
      }
    }
  }

  /**
   * Get inner editor
   * @returns {NodeEditor}
   */
  getInnerEditor() {
    return this.innerEditor;
  }

  /**
   * Save inner node positions
   * @param {Object<string, { x: number, y: number }>} positions
   */
  setInnerPositions(positions) {
    this.innerPositions = { ...positions };
  }

  /**
   * Save inner viewport transform
   * @param {{ panX: number, panY: number, zoom: number }} transform
   */
  setInnerTransform(transform) {
    this.innerTransform = { ...transform };
  }

  /**
   * Serialize subgraph node including inner graph
   * @returns {object}
   */
  toJSON() {
    return {
      id: this.id,
      type: 'subgraph',
      label: this.label,
      category: this.category,
      innerGraph: this.innerEditor.toJSON(
        Object.fromEntries(
          Object.entries(this.innerPositions).map(([id, pos]) => [id, [pos.x, pos.y]])
        )
      ),
      innerTransform: this.innerTransform,
    };
  }
}

export { SubgraphNode as default };
