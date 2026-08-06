import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createThreeSpatialGraph } from '../xr/three-spatial-graph.js';
import { createSpatialGraphModel } from '../xr/spatial-graph.js';

// Simple Mock THREE library
const mockTHREE = {
  Group: class {
    constructor() {
      this.children = [];
      this.userData = {};
    }
    add(child) {
      this.children.push(child);
    }
    remove(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) this.children.splice(idx, 1);
    }
  },
  RingGeometry: class {
    dispose() {}
  },
  SphereGeometry: class {
    dispose() {}
  },
  MeshBasicMaterial: class {
    constructor(opts) {
      this.color = {
        setHex: (hex) => { this.hex = hex; }
      };
      this.color.setHex(opts.color);
    }
    dispose() {}
  },
  Mesh: class {
    constructor(geo, mat) {
      this.geometry = geo;
      this.material = mat;
      this.position = { set: (x, y, z) => { this.x = x; this.y = y; this.z = z; } };
      this.scale = { set: (x, y, z) => { this.sx = x; this.sy = y; this.sz = z; } };
    }
  },
  Vector3: class {
    constructor(x, y, z) {
      this.x = x; this.y = y; this.z = z;
    }
  },
  BufferGeometry: class {
    setFromPoints() { return this; }
    dispose() {}
  },
  LineBasicMaterial: class {
    dispose() {}
  },
  Line: class {
    constructor(geo, mat) {
      this.geometry = Object.create(geo);
      this.geometry.attributes = {
        position: {
          setXYZ: (idx, x, y, z) => {
            if (!this.coords) this.coords = [];
            this.coords[idx] = { x, y, z };
          },
          needsUpdate: false
        }
      };
      this.material = mat;
    }
  }
};

test('createThreeSpatialGraph generates spheres and lines using mock THREE', () => {
  const model = createSpatialGraphModel({
    nodes: [
      { id: '1', position: [1, 2, 3] },
      { id: '2', position: [4, 5, 6] }
    ],
    links: [
      { id: 'l1', source: '1', target: '2' }
    ]
  });

  const renderer = createThreeSpatialGraph(mockTHREE, model);
  assert.ok(renderer.group);

  // Group should contain 2 node meshes + 2 labels + 2 drag affordances + 1 link line
  assert.equal(renderer.group.children.length, 7);
  assert.equal(renderer.getLabelObject('1').userData.text, '1');
  assert.equal(renderer.getDragAffordance('1').userData.kind, 'spatial-drag-affordance');

  // Set selection and update
  const updatedModel = {
    ...model,
    selection: { activeNodeId: '1', focusedNodeId: null }
  };
  renderer.setModel(updatedModel);

  // Active node color should change (hex is red/pink: 0xff0055)
  const sphereMesh = renderer.group.children.find(c => c instanceof mockTHREE.Mesh && c.material.hex === 0xff0055);
  assert.ok(sphereMesh);

  const startRecord = renderer.startNodeDrag({
    kind: 'ray',
    origin: [1, 2, 8],
    direction: [0, 0, -1],
  });
  assert.equal(startRecord.phase, 'start');
  assert.equal(startRecord.nodeId, '1');

  const moveRecord = renderer.moveNodeDrag({
    kind: 'ray',
    origin: [1, 2, 8],
    direction: [0.2, 0, -1],
  });
  assert.equal(moveRecord.phase, 'move');
  assert.notDeepEqual(renderer.getModel().nodes.find((node) => node.id === '1').position, [1, 2, 3]);

  const endRecord = renderer.endNodeDrag();
  assert.equal(endRecord.phase, 'end');

  renderer.destroy();
  assert.equal(renderer.group.children.length, 0);
});
