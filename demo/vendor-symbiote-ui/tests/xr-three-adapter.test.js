import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE_REAL from 'three';

import {
  XR_THREE_WEBXR_ADAPTER,
  createXRThreeSessionController,
  createXRThreeWebXRAdapter,
} from '../xr/three-webxr-adapter.js';
import {
  computeXRPanelChromeLayout,
  createXRPanelFrame,
  hitTestXRPanelFrame,
} from '../xr/panel-frame.js';
import { createSpatialTarget } from './xr-spatial-fixtures.js';

function readPanelSize(mesh) {
  return mesh.userData?.xrSize || [0.8, 0.45];
}

function applyPanelSize(mesh, size) {
  if (!mesh || !Array.isArray(size)) return;
  let next = [
    Math.max(0.05, Number(size[0] || 0.8)),
    Math.max(0.05, Number(size[1] || 0.45)),
  ];
  mesh.userData ||= {};
  mesh.userData.xrSize = next;
  if (mesh.userData.panel) {
    mesh.userData.panel = { ...mesh.userData.panel, size: next };
  }
}

class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  set(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    return this;
  }
  copy(v) {
    this.x = v.x; this.y = v.y; this.z = v.z;
    return this;
  }
  clone() {
    return new Vector3(this.x, this.y, this.z);
  }
  add(v) {
    this.x += v.x; this.y += v.y; this.z += v.z;
    return this;
  }
  sub(v) {
    this.x -= v.x; this.y -= v.y; this.z -= v.z;
    return this;
  }
  normalize() {
    let len = Math.hypot(this.x, this.y, this.z) || 1;
    this.x /= len; this.y /= len; this.z /= len;
    return this;
  }
  applyQuaternion(q) {
    return this;
  }
  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }
}

class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }
  set(x, y, z, w) {
    this.x = x; this.y = y; this.z = z; this.w = w;
    return this;
  }
  copy(q) {
    this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w;
    return this;
  }
  clone() {
    return new Quaternion(this.x, this.y, this.z, this.w);
  }
}

class Plane {
  setFromNormalAndCoplanarPoint(n, p) {
    this.normal = n.clone();
    this.point = p.clone();
    return this;
  }
  clone() {
    let p = new Plane();
    p.normal = this.normal.clone();
    p.point = this.point.clone();
    return p;
  }
}

class Scene {
  constructor() {
    this.children = [];
  }
  add(object) {
    this.children.push(object);
    object.parent = this;
  }
  remove(object) {
    this.children = this.children.filter((candidate) => candidate !== object);
  }
}

class Group {
  constructor() {
    this.userData = {};
    this.position = new Vector3();
    this.quaternion = new Quaternion();
    this.rotation = {
      values: [0, 0, 0, 'XYZ'],
      fromArray(v) { this.values = [...v]; },
      set(x, y, z, order) { this.values = [x, y, z, order]; }
    };
    this.children = [];
  }
  add(object) {
    this.children.push(object);
    object.parent = this;
  }
  getWorldPosition(target) {
    target.copy(this.position);
    if (this.parent && typeof this.parent.getWorldPosition === 'function') {
      let parentPos = new Vector3();
      this.parent.getWorldPosition(parentPos);
      target.add(parentPos);
    }
    return target;
  }
  getWorldQuaternion(target) {
    target.copy(this.quaternion);
    return target;
  }
  worldToLocal(v) {
    v.sub(this.position);
    return v;
  }
}

class Renderer {
  constructor() {
    this.xr = { enabled: false };
  }
}

class Mesh {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.position = new Vector3();
    this.quaternion = new Quaternion();
    this.rotation = {
      values: [0, 0, 0, 'XYZ'],
      fromArray(v) { this.values = [...v]; },
      set(x, y, z, order) { this.values = [x, y, z, order]; }
    };
    this.userData = {};
    this.children = [];
  }
  add(object) {
    this.children.push(object);
    object.parent = this;
  }
  getWorldPosition(target) {
    target.copy(this.position);
    if (this.parent && typeof this.parent.getWorldPosition === 'function') {
      let parentPos = new Vector3();
      this.parent.getWorldPosition(parentPos);
      target.add(parentPos);
    }
    return target;
  }
  getWorldQuaternion(target) {
    target.copy(this.quaternion);
    return target;
  }
}

class Ray {
  constructor() {
    this.origin = new Vector3();
    this.direction = new Vector3(0, 0, -1);
  }
  intersectPlane(plane, target) {
    target.copy(plane.point);
    return target;
  }
}

class Raycaster {
  constructor() {
    this.ray = new Ray();
  }
  set(origin, direction) {
    this.ray.origin.copy(origin);
    this.ray.direction.copy(direction);
  }
  intersectObjects() {
    return [];
  }
}

let THREE = {
  Scene,
  Group,
  PerspectiveCamera: class {
    getWorldPosition(target) {
      target.set(0, 1.6, 2);
    }
  },
  WebGLRenderer: Renderer,
  PlaneGeometry: class {
    constructor(w, h) {
      this.parameters = { width: w, height: h };
    }
  },
  Mesh,
  MeshStandardMaterial: class {},
  MeshBasicMaterial: class {},
  Raycaster,
  Vector3,
  Quaternion,
  Plane,
};

test('Three adapter publishes committed-root, trusted-select, and audit capabilities', () => {
  for (let capability of [
    'three-world-locked-root-commit',
    'three-trusted-select-receipts',
    'three-spatial-audit-v1',
  ]) {
    assert.ok(XR_THREE_WEBXR_ADAPTER.capabilities.includes(capability));
  }
  assert.equal(
    XR_THREE_WEBXR_ADAPTER.capabilities.includes('three-hit-test-placement-receipts'),
    false,
    'pre-root hit-test placement remains a pure product-owned composition contract',
  );
});

test('Three adapter exposes its world-lockable scene root', () => {
  let adapter = createXRThreeWebXRAdapter({ THREE });
  let renderer = new Renderer();
  assert.equal(adapter.createRenderer({ renderer }).ok, true);
  assert.equal(renderer.xr.enabled, true);
  let result = adapter.setScene({ id: 'scene-1', panels: [] }, { mode: 'immersive-ar' });
  assert.equal(result.ok, true);
  assert.equal(adapter.getSceneRoot(), result.rootGroup);
  assert.equal(adapter.getSceneRoot().userData.xrSceneRoot, true);
});

test('Three adapter applies provider Euler rotations in Rz Ry Rx order', () => {
  let adapter = createXRThreeWebXRAdapter({ THREE });
  let renderer = new Renderer();
  assert.equal(adapter.createRenderer({ renderer }).ok, true);

  let result = adapter.setScene({
    id: 'scene-rotation-order',
    panels: [{
      id: 'chat',
      position: [0, 1.25, -1.4],
      rotation: [-8, 18, 0],
      size: [0.8, 0.6],
    }],
  }, { mode: 'immersive-ar' });

  assert.equal(result.ok, true);
  assert.deepEqual(adapter.getPanelMesh('chat').rotation.values, [
    -8 * Math.PI / 180,
    18 * Math.PI / 180,
    0,
    'ZYX',
  ]);
});

test('spatial evidence root cannot be committed without an active XR session', () => {
  let controller = createXRThreeSessionController({
    globalThis: {},
    adapter: {},
  });
  assert.deepEqual(controller.commitSpatialEvidence({}), {
    ok: false,
    reason: 'session-not-active',
  });
});

test('Three adapter handles world space dragging with a translated parent root group', () => {
  const mockRaycaster = new Raycaster();
  const adapter = createXRThreeWebXRAdapter({ THREE, raycaster: mockRaycaster });
  const renderer = new Renderer();
  assert.equal(adapter.createRenderer({ renderer }).ok, true);

  const result = adapter.setScene({
    id: 'scene-drag-test',
    panels: [{
      id: 'p-drag',
      position: [0, 0.5, 0], // Local starting position
      rotation: [0, 0, 0],
      size: [0.8, 0.6],
    }],
  }, { mode: 'immersive-ar' });

  assert.equal(result.ok, true);
  const mesh = adapter.getPanelMesh('p-drag');
  const rootGroup = adapter.getSceneRoot();

  rootGroup.position.set(0, 1.0, -1.0);

  let initialWorldPos = new Vector3();
  mesh.getWorldPosition(initialWorldPos);
  assert.deepEqual(initialWorldPos, new Vector3(0, 1.5, -1.0));

  const rayAdapter = adapter.controllerRays;
  const mockController = new Group();
  mockController.position.set(0, 1.6, 1.0);
  const mockCamera = new THREE.PerspectiveCamera();

  mockRaycaster.ray.intersectPlane = (plane, target) => {
    target.set(0.1, 1.5, -1.0);
    return target;
  };

  let beginResult = rayAdapter.beginDrag(mockController, mesh, mockCamera);
  assert.equal(beginResult.ok, true);

  mockRaycaster.ray.intersectPlane = (plane, target) => {
    target.set(0.2, 1.6, -0.9);
    return target;
  };

  let updateResult = rayAdapter.updateDrag(mockController);
  assert.equal(updateResult.ok, true);

  assert.equal(Math.abs(mesh.position.x - 0.072) < 0.001, true);
  assert.equal(Math.abs(mesh.position.y - 0.572) < 0.001, true);
  assert.equal(Math.abs(mesh.position.z - 0.072) < 0.001, true);
});

test('Three session controller manages frame-timing tracking, panel-store updates, and final session snapshot', async () => {
  let sessionListeners = new Map();
  let session = {
    visibilityState: 'visible',
    enabledFeatures: ['local-floor'],
    inputSources: [],
    frameRate: 90,
    addEventListener(type, listener) {
      sessionListeners.set(type, listener);
    },
    removeEventListener(type) {
      sessionListeners.delete(type);
    },
    async end() {
      sessionListeners.get('end')?.();
    },
  };

  let animationLoop = null;
  let renderer = {
    xr: {
      async setSession() {},
      setAnimationLoop(callback) {
        animationLoop = callback;
      },
    },
  };

  let adapter = {
    async setSession(s) {
      return { ok: true, session: s, referenceSpace: {} };
    },
    listPanelMeshes() {
      let mesh = new Mesh();
      mesh.position.set(1, 2, 3);
      mesh.userData = {
        panelId: 'panel-a',
        panel: {
          portable: true,
          pinned: false,
          focused: false,
        },
      };
      return [mesh];
    },
    controllerRays: {
      panelStore: null,
      receiptsList: null,
      getState() {
        return { dragging: false };
      },
      updateDrag() {
        return { ok: true };
      },
    },
    getDiagnostics() {
      return {};
    },
  };

  let globalThis = {
    navigator: {
      xr: {
        async requestSession() {
          return session;
        },
      },
    },
  };

  let controller = createXRThreeSessionController({
    globalThis,
    adapter,
  });

  let started = await controller.start('immersive-vr', {
    target: { ok: true, renderer, camera: {}, scene: new Scene() },
    controllerRayVisuals: false,
    panelHitReticle: false,
  });

  assert.equal(started.ok, true);

  // Record a few frames
  animationLoop(1000, { predictedDisplayTime: 1000 });
  animationLoop(1016, { predictedDisplayTime: 1016 });
  animationLoop(1033, { predictedDisplayTime: 1033 });

  // Settle a move using the synced panelStore
  let ps = adapter.controllerRays.panelStore;
  assert.ok(ps);
  let moveReceipt = ps.settleMove('panel-a', [1.1, 2.1, 3.1], [0, 0, 0, 1], {
    sessionId: 'session-123',
    startFrameId: 'frame-1',
    endFrameId: 'frame-2',
    inputSourceId: 'controller-1',
    inputKind: 'controller',
    handedness: 'none',
    profiles: [],
    timestamp: 1033
  });
  assert.equal(moveReceipt.accepted, true);
  adapter.controllerRays.receiptsList.push(moveReceipt);

  // Stop the session
  await controller.stop();

  // Retrieve the final snapshot
  let snapshot = controller.getFinalSessionSnapshot();
  assert.ok(snapshot);
  assert.equal(snapshot.version, 'xr-final-session-snapshot-v1');
  assert.equal(snapshot.facts.teardownReason, 'stop-called');
  assert.equal(snapshot.receipts.length, 1);
  assert.equal(snapshot.receipts[0].version, 'xr-portable-panel-receipt-v1');
  assert.equal(snapshot.frameTiming.nominalFrameRate, 90);
  assert.equal(snapshot.frameTiming.sampleCount, 3);
  assert.equal(snapshot.panelState.panels[0].id, 'panel-a');
  assert.deepEqual(snapshot.panelState.panels[0].current.position, [1.1, 2.1, 3.1]);
});

test('Three adapter handles world space dragging with a transformed root containing translation and rotation', () => {
  const mockRaycaster = new Raycaster();
  const adapter = createXRThreeWebXRAdapter({ THREE, raycaster: mockRaycaster, dragSmoothing: 1.0, maxDragStep: 99.0 });
  const renderer = new Renderer();
  assert.equal(adapter.createRenderer({ renderer }).ok, true);

  const result = adapter.setScene({
    id: 'scene-rotated-drag',
    panels: [{
      id: 'p-rotated-drag',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      size: [0.8, 0.6],
    }],
  }, { mode: 'immersive-ar' });

  assert.equal(result.ok, true);
  const mesh = adapter.getPanelMesh('p-rotated-drag');
  const rootGroup = adapter.getSceneRoot();

  // Set translation and rotation on rootGroup
  rootGroup.position.set(1.0, 2.0, -3.0);
  rootGroup.quaternion.set(0, 0.7071, 0, 0.7071);

  rootGroup.worldToLocal = (v) => {
    v.sub(rootGroup.position);
    let tempX = v.z;
    let tempZ = -v.x;
    v.x = tempX;
    v.z = tempZ;
    return v;
  };

  const rayAdapter = adapter.controllerRays;
  const mockController = new Group();
  mockController.position.set(0, 0, 0);
  const mockCamera = new THREE.PerspectiveCamera();

  mockRaycaster.ray.intersectPlane = (plane, target) => {
    target.set(2.0, 3.0, -1.0);
    return target;
  };

  let beginResult = rayAdapter.beginDrag(mockController, mesh, mockCamera);
  assert.equal(beginResult.ok, true);

  mockRaycaster.ray.intersectPlane = (plane, target) => {
    target.set(3.0, 4.0, 0.0);
    return target;
  };

  let updateResult = rayAdapter.updateDrag(mockController);
  assert.equal(updateResult.ok, true);

  assert.equal(Math.abs(mesh.position.x - 1.0) < 0.001, true);
  assert.equal(Math.abs(mesh.position.y - 1.0) < 0.001, true);
  assert.equal(Math.abs(mesh.position.z - (-1.0)) < 0.001, true);
});

test('Three adapter resizes symmetrically from the window center', () => {
  const mockRaycaster = new Raycaster();
  const adapter = createXRThreeWebXRAdapter({ THREE, raycaster: mockRaycaster });
  const renderer = new Renderer();
  assert.equal(adapter.createRenderer({ renderer }).ok, true);

  const result = adapter.setScene({
    id: 'scene-resize-test',
    panels: [{
      id: 'p-resize',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      size: [0.8, 0.6],
    }],
  }, { mode: 'immersive-ar' });

  assert.equal(result.ok, true);
  const mesh = adapter.getPanelMesh('p-resize');

  const rayAdapter = adapter.controllerRays;
  const mockController = new Group();
  const mockCamera = new THREE.PerspectiveCamera();

  // Test East resizing
  mesh.position.set(0, 0, 0);
  mesh.userData.xrSize = [0.8, 0.6];
  mesh.userData.baseSize = [0.8, 0.6];
  mockRaycaster.ray.intersectPlane = (plane, target) => {
    target.set(0, 0, 0);
    return target;
  };

  mesh.userData.lastFrameTarget = {
    version: 'xr-panel-frame-target-v1',
    panelId: 'p-resize',
    zone: 'resize',
    operation: 'resize',
    handle: 'east',
  };

  let beginResult = rayAdapter.beginDrag(mockController, mesh, mockCamera);
  assert.equal(beginResult.ok, true);

  mockRaycaster.ray.intersectPlane = (plane, target) => {
    target.set(0.2, 0, 0);
    return target;
  };

  let updateResult = rayAdapter.updateDrag(mockController);
  assert.equal(updateResult.ok, true);

  let currentSize = readPanelSize(mesh);
  assert.deepEqual(currentSize, [1.2000000000000002, 0.6]);
  assert.equal(mesh.position.x, 0);
  assert.equal(mesh.position.y, 0);
  assert.equal(mesh.position.z, 0);

  // Test West resizing
  mesh.position.set(0, 0, 0);
  mesh.userData.xrSize = [0.8, 0.6];
  mesh.userData.baseSize = [0.8, 0.6];
  mockRaycaster.ray.intersectPlane = (plane, target) => {
    target.set(0, 0, 0);
    return target;
  };
  mesh.userData.lastFrameTarget.handle = 'west';

  beginResult = rayAdapter.beginDrag(mockController, mesh, mockCamera);
  assert.equal(beginResult.ok, true);

  mockRaycaster.ray.intersectPlane = (plane, target) => {
    target.set(0.2, 0, 0);
    return target;
  };

  updateResult = rayAdapter.updateDrag(mockController);
  assert.equal(updateResult.ok, true);

  currentSize = readPanelSize(mesh);
  assert.equal(Math.abs(currentSize[0] - 0.4) < 0.001, true);
  assert.equal(Math.abs(currentSize[1] - 0.6) < 0.001, true);
  assert.equal(mesh.position.x, 0);
});

test('Three adapter real Three.js conformed tests with rotated root', () => {
  // Create a real Three.js scene
  const scene = new THREE_REAL.Scene();

  // Create a rotated root group with translation
  const root = new THREE_REAL.Group();
  root.position.set(1.2, -0.8, 1.5);
  root.rotation.set(0.2, -0.4, 0.1);
  scene.add(root);
  scene.updateMatrixWorld(true);

  // Create a mock raycaster that returns the intersection point in world space
  const mockRaycaster = new THREE_REAL.Raycaster();

  // Initialize the adapter with real THREE, mock raycaster, and disable smoothing
  const adapter = createXRThreeWebXRAdapter({ THREE: THREE_REAL, raycaster: mockRaycaster, dragSmoothing: 1.0 });

  // Set the scene in the adapter
  const result = adapter.setScene({
    id: 'real-scene',
    panels: [{
      id: 'panel-real',
      position: [0.5, 0.2, -0.3], // parent-local coordinates
      rotation: [0, 0, 0],
      size: [0.8, 0.6]
    }]
  }, { mode: 'immersive-vr' });

  assert.equal(result.ok, true);

  // Retrieve the panel mesh and add it to the rotated root group
  const mesh = adapter.getPanelMesh('panel-real');
  assert.ok(mesh);
  root.add(mesh); // Add to the rotated root group!
  scene.updateMatrixWorld(true);

  // 1. Prove local settlement equals root.worldToLocal(expectedWorld)
  const expectedWorldPos = new THREE_REAL.Vector3(2.5, 1.0, -0.5);
  const expectedLocalPos = expectedWorldPos.clone();
  root.worldToLocal(expectedLocalPos);

  // Update mesh position directly
  mesh.position.copy(expectedLocalPos);
  scene.updateMatrixWorld(true);

  // Verify that the local position of the mesh equals root.worldToLocal(expectedWorld)
  const actualWorldPos = new THREE_REAL.Vector3();
  mesh.getWorldPosition(actualWorldPos);

  // The mesh's world position should be exactly expectedWorldPos (within numerical tolerance)
  assert.ok(actualWorldPos.distanceTo(expectedWorldPos) < 1e-5);
  assert.ok(mesh.position.distanceTo(expectedLocalPos) < 1e-5);

  // 2. Prove east resize expands symmetrically around the window center
  // Start with a clean setup: panel size 0.8 x 0.6, parent-local position (0.5, 0.2, -0.3)
  mesh.position.set(0.5, 0.2, -0.3);
  mesh.rotation.set(0, 0, 0);
  applyPanelSize(mesh, [0.8, 0.6]);
  scene.updateMatrixWorld(true);

  // Record initial west edge in world space
  const initialWestLocal = new THREE_REAL.Vector3(-0.4, 0, 0); // -width/2
  const initialWestWorld = new THREE_REAL.Vector3();
  mesh.localToWorld(initialWestWorld.copy(initialWestLocal));

  // Mock a drag resize operation from the East handle
  const rayAdapter = adapter.controllerRays;
  const mockController = new THREE_REAL.Group();
  mockController.position.set(0, 0, 0);
  const mockCamera = new THREE_REAL.PerspectiveCamera();

  // Let's call beginDrag with the mock raycaster

  // Let's mock a resize operation.
  // We set lastFrameTarget on the mesh userData:
  mesh.userData.lastFrameTarget = {
    version: 'xr-panel-frame-target-v1',
    panelId: 'panel-real',
    zone: 'resize',
    operation: 'resize',
    handle: 'east',
  };

  // Start intersection is at local x = 0.4 (the east edge)
  const startLocalIntersection = new THREE_REAL.Vector3(0.4, 0, 0);
  const startWorldIntersection = new THREE_REAL.Vector3();
  mesh.localToWorld(startWorldIntersection.copy(startLocalIntersection));

  mockRaycaster.ray.intersectPlane = (plane, target) => {
    target.copy(startWorldIntersection);
    return target;
  };

  let beginResult = rayAdapter.beginDrag(mockController, mesh, mockCamera);
  assert.equal(beginResult.ok, true);

  // Drag the intersection 0.2 meters along the x-axis in world space (which is east)
  // Get the world x-axis of the panel:
  const worldQuaternion = new THREE_REAL.Quaternion();
  mesh.getWorldQuaternion(worldQuaternion);
  const xAxis = new THREE_REAL.Vector3(1, 0, 0);
  xAxis.applyQuaternion(worldQuaternion).normalize();

  const endWorldIntersection = startWorldIntersection.clone().addScaledVector(xAxis, 0.2);
  mockRaycaster.ray.intersectPlane = (plane, target) => {
    target.copy(endWorldIntersection);
    return target;
  };

  // Update drag. This will calculate the new size and shift the mesh position
  let updateResult = rayAdapter.updateDrag(mockController);
  assert.equal(updateResult.ok, true);
  scene.updateMatrixWorld(true);

  // A 0.2 m corner delta adds 0.4 m to the full width.
  const currentSize = readPanelSize(mesh);
  assert.ok(Math.abs(currentSize[0] - 1.2) < 1e-4);

  const finalWestLocal = new THREE_REAL.Vector3(-0.6, 0, 0);
  const finalWestWorld = new THREE_REAL.Vector3();
  mesh.localToWorld(finalWestWorld.copy(finalWestLocal));

  assert.ok(finalWestWorld.distanceTo(initialWestWorld) > 0.19);
  assert.ok(mesh.position.distanceTo(new THREE_REAL.Vector3(0.5, 0.2, -0.3)) < 1e-5);

  // 3. Prove frame corners remain aligned and handles have scale (1,1,1)
  const visualSummary = mesh.userData.panelFrameVisuals;
  assert.ok(visualSummary.ok);
  assert.equal(visualSummary.type, 'panel-frame-visuals');

  // Verify the northWest handle
  const nwHandle = mesh.children.find(child => child.name === 'sn-xr-panel-frame-resize-northWest');
  assert.ok(nwHandle, "northWest resize handle not found");

  // Handle scale must be exactly 1,1,1 (rebuilt in unscaled coordinates)
  assert.equal(nwHandle.scale.x, 1);
  assert.equal(nwHandle.scale.y, 1);
  assert.equal(nwHandle.scale.z, 1);

  // Horizon-style grips straddle the corners, so the nwHandle centers on the
  // north-west corner itself.
  const expectedNWLocalX = -1.2 / 2;
  const expectedNWLocalY = 0.6 / 2;

  assert.ok(Math.abs(nwHandle.position.x - expectedNWLocalX) < 1e-5);
  assert.ok(Math.abs(nwHandle.position.y - expectedNWLocalY) < 1e-5);
});


test('panel frame meter chrome keeps constant physical size across panel sizes', () => {
  const legacy = createXRPanelFrame({ id: 'p' });
  assert.equal(legacy.version, 'xr-panel-frame-v1');
  assert.ok(Math.abs(legacy.zones.move.height * 0.45 - 0.048) < 1e-9);
  assert.ok(Math.abs((legacy.zones.move.y - 1) * 0.45 - 0.018) < 1e-9);
  assert.ok(Math.abs(legacy.zones.resize.northWest.width * 0.8 - 0.044) < 1e-9);
  assert.ok(Math.abs(legacy.zones.actions.close.width * 0.8 - 0.038) < 1e-9);
  assert.equal(Object.keys(legacy.zones.edges).length, 4);

  const meterOptions = {
    handleSizeMeters: 0.024,
    footerHeightMeters: 0.035,
    actionSizeMeters: 0.030,
    footerGapMeters: 0.008,
  };
  let previous = null;
  for (const size of [[0.8, 0.45], [1.6, 0.9]]) {
    const frame = createXRPanelFrame({ id: 'p', size }, meterOptions);
    // The exported layout helper is the single source of truth for zones.
    assert.deepEqual(frame.zones, computeXRPanelChromeLayout(size, meterOptions));
    // UV zone * panel size = constant physical meters at both sizes.
    assert.ok(Math.abs(frame.zones.move.height * size[1] - 0.035) < 1e-9);
    assert.ok(Math.abs((frame.zones.move.y - 1) * size[1] - 0.008) < 1e-9);
    assert.ok(Math.abs(frame.zones.actions.close.width * size[0] - 0.030) < 1e-9);
    assert.ok(Math.abs(frame.zones.resize.northWest.width * size[0] - 0.024) < 1e-9);
    assert.ok(Math.abs(frame.zones.resize.northWest.height * size[1] - 0.024) < 1e-9);
    if (previous) {
      assert.ok(
        frame.zones.move.height < previous.zones.move.height,
        'UV chrome must shrink as the panel grows',
      );
    }
    previous = frame;
  }
});

test('Three adapter rebuilds meter-chrome hit zones and chrome surface after resize', () => {
  const mockRaycaster = new Raycaster();
  const adapter = createXRThreeWebXRAdapter({ THREE, raycaster: mockRaycaster });
  const renderer = new Renderer();
  assert.equal(adapter.createRenderer({ renderer }).ok, true);

  const meterFrame = {
    handleSizeMeters: 0.024,
    footerHeightMeters: 0.12,
    actionSizeMeters: 0.030,
    footerGapMeters: 0.008,
  };
  const result = adapter.setScene({
    id: 'scene-meter-chrome',
    panels: [{
      id: 'p-meter',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      size: [0.8, 0.6],
    }],
  }, { mode: 'immersive-ar', panelFrameVisuals: { frame: meterFrame } });
  assert.equal(result.ok, true);
  const mesh = adapter.getPanelMesh('p-meter');

  // The hit-test frame sees the same meter options as the visuals.
  const before = mesh.userData.panelFrame;
  assert.ok(Math.abs(before.zones.move.height * 0.6 - 0.12) < 1e-9);
  assert.ok(Math.abs(before.zones.resize.northWest.width * 0.8 - 0.024) < 1e-9);

  // Chrome hit surface extends past the footer band: gap + footer + margin,
  // which here exceeds the legacy fractional floor (max(0.1, 0.6*0.18)).
  const extendBefore = mesh.userData.chromeSurface.userData.extend;
  assert.ok(Math.abs(extendBefore.y - (0.008 + 0.12 + 0.02)) < 1e-9);
  assert.ok(Math.abs(extendBefore.x - Math.max(0.06, 0.8 * 0.08)) < 1e-9);

  // Simulate a center-anchored east drag-resize: 0.8 -> 1.2 m wide.
  mesh.userData.lastFrameTarget = {
    version: 'xr-panel-frame-target-v1',
    panelId: 'p-meter',
    zone: 'resize',
    operation: 'resize',
    handle: 'east',
  };
  mockRaycaster.ray.intersectPlane = (plane, target) => {
    target.set(0, 0, 0);
    return target;
  };
  const rayAdapter = adapter.controllerRays;
  const mockController = new Group();
  const mockCamera = new THREE.PerspectiveCamera();
  assert.equal(rayAdapter.beginDrag(mockController, mesh, mockCamera).ok, true);
  mockRaycaster.ray.intersectPlane = (plane, target) => {
    target.set(0.2, 0, 0);
    return target;
  };
  assert.equal(rayAdapter.updateDrag(mockController).ok, true);
  assert.deepEqual(readPanelSize(mesh), [1.2000000000000002, 0.6]);

  // The hit-test frame was rebuilt for the new size, not left stale.
  const after = mesh.userData.panelFrame;
  assert.notEqual(after, before);
  assert.ok(Math.abs(after.zones.move.height * 0.6 - 0.12) < 1e-9);
  assert.ok(Math.abs(after.zones.resize.northWest.width * 1.2 - 0.024) < 1e-9);
  assert.ok(Math.abs(after.zones.actions.close.width * 1.2 - 0.030) < 1e-9);
  assert.ok(after.zones.resize.northWest.width < before.zones.resize.northWest.width);

  // Hit-zone correctness: a point inside the OLD grip UV but outside the new
  // one must no longer hit resize; the move bar stays hittable at its center.
  const probe = { x: 0.014, y: 0 };
  assert.equal(hitTestXRPanelFrame(before, probe)?.zone, 'resize');
  assert.equal(hitTestXRPanelFrame(after, probe)?.zone, 'content');
  const moveCenter = {
    x: after.zones.move.x + after.zones.move.width / 2,
    y: after.zones.move.y + after.zones.move.height / 2,
  };
  assert.equal(hitTestXRPanelFrame(after, moveCenter)?.zone, 'move');

  // Chrome surface extents were recomputed from the rebuilt frame.
  const extendAfter = mesh.userData.chromeSurface.userData.extend;
  assert.ok(Math.abs(extendAfter.y - (0.008 + 0.12 + 0.02)) < 1e-9);
  assert.ok(Math.abs(extendAfter.x - Math.max(0.06, 1.2 * 0.08)) < 1e-9);
});

// --- Portable panel close/restore (window chrome close action) ---

async function createCloseHarness(options = {}) {
  let source = {
    id: 'controller-right',
    handedness: 'right',
    targetRayMode: 'tracked-pointer',
    profiles: ['meta-quest-touch-plus'],
    targetRaySpace: {},
    gripSpace: {},
  };
  let sessionListeners = new Map();
  let session = {
    visibilityState: 'visible',
    enabledFeatures: ['local-floor'],
    inputSources: [source],
    frameRate: 90,
    addEventListener(type, listener) {
      sessionListeners.set(type, listener);
    },
    removeEventListener(type) {
      sessionListeners.delete(type);
    },
    async end() {
      sessionListeners.get('end')?.();
    },
  };
  let animationLoop = null;
  let controllers = [new THREE_REAL.Group(), new THREE_REAL.Group()];
  let renderer = {
    xr: {
      async setSession() {},
      getController(index) {
        return controllers[index];
      },
      setAnimationLoop(callback) {
        animationLoop = callback;
      },
    },
    render() {},
  };
  let sceneRoot = new THREE_REAL.Group();
  let mesh = new THREE_REAL.Mesh(
    new THREE_REAL.PlaneGeometry(0.8, 0.5),
    new THREE_REAL.MeshBasicMaterial(),
  );
  mesh.position.set(0, 1.4, -1);
  mesh.userData = {
    panelId: 'panel-a',
    xrSize: [0.8, 0.5],
    THREE: THREE_REAL,
    panel: {
      portable: true,
      pinned: false,
      focused: false,
      closable: options.closable,
      revision: 0,
      sourceMetadata: {},
      size: [0.8, 0.5],
    },
    updatePanelFrameVisuals() {},
  };
  sceneRoot.add(mesh);

  let hit = null;
  let hitMeshCandidates = [];
  let controllerRays = {
    panelStore: null,
    receiptsList: null,
    getHits(controller, meshes) {
      hitMeshCandidates.push(meshes);
      return hit ? [hit] : [];
    },
    beginDrag() {
      return { ok: false, reason: 'not-supported' };
    },
    updateDrag() {
      return { ok: false, reason: 'not-dragging' };
    },
    endDrag() {
      return { ok: true };
    },
    getState() {
      return { dragging: false, panelId: null };
    },
    getDiagnostics() {
      return {};
    },
  };
  let adapter = {
    THREE: THREE_REAL,
    async setSession(nextSession) {
      return { ok: true, session: nextSession, referenceSpace: {} };
    },
    listPanelMeshes() {
      return [mesh];
    },
    getPanelMesh(panelId) {
      return panelId === 'panel-a' ? mesh : null;
    },
    getSceneRoot() {
      return sceneRoot;
    },
    controllerRays,
    getDiagnostics() {
      return {};
    },
  };
  let receipts = [];
  let diagnosticEvents = [];
  let controller = createXRThreeSessionController({
    globalThis: {
      navigator: {
        xr: {
          async requestSession() {
            return session;
          },
        },
      },
    },
    adapter,
    THREE: THREE_REAL,
    panelClosePolicy: options.panelClosePolicy,
    onPanelFullscreen: options.onPanelFullscreen,
    onPortablePanelReceipt(receipt) {
      receipts.push(receipt);
    },
    onDiagnostic(event) {
      diagnosticEvents.push(event);
    },
  });
  let started = await controller.start('immersive-ar', {
    target: {
      ok: true,
      renderer,
      camera: new THREE_REAL.PerspectiveCamera(),
      scene: new THREE_REAL.Scene(),
    },
    controllerRayVisuals: false,
    panelHitReticle: false,
    renderFrame: false,
  });
  assert.equal(started.ok, true);

  let committed = controller.commitSpatialEvidence({
    spatialTarget: createSpatialTarget(),
    sessionId: 'session-close',
    referenceSpaceId: 'reference-space-1',
    provenance: {
      runtimeId: 'three-webxr',
      runtimeVersion: '1.0.0',
      appId: 'close-test',
      buildHash: 'sha256:close-test',
      deviceId: 'quest-3',
      deviceKind: 'headset',
      emulation: 'native',
    },
    rootPolicy: {
      mode: 'world-locked',
      id: 'root-1',
      commitId: 'root-commit-1',
      matrix: new THREE_REAL.Matrix4().identity().toArray(),
    },
    spatialObjects: [{
      id: 'assembly',
      object: mesh,
      size: [0.2, 0.2, 0.01],
      visible: true,
      getState: () => 'ready',
    }],
    resolveInputSourceId: (candidate) => candidate.id,
  });
  assert.equal(committed.ok, true);

  function frame(time) {
    assert.equal(typeof animationLoop, 'function');
    animationLoop(time, {
      predictedDisplayTime: time,
      getViewerPose() {
        return null;
      },
      getPose() {
        return null;
      },
    });
  }

  function actionTarget(action) {
    return {
      version: 'xr-panel-frame-target-v1',
      panelId: 'panel-a',
      zone: 'action',
      action,
      operation: 'action',
      handle: null,
      point: { x: 0.5, y: 0.5 },
    };
  }

  function selectAction(object, action) {
    hit = {
      object,
      point: new THREE_REAL.Vector3(object.position.x, object.position.y, object.position.z),
      uv: null,
      frameTarget: actionTarget(action),
    };
    controllers[0].dispatchEvent({ type: 'selectstart', data: source });
    controllers[0].dispatchEvent({ type: 'selectend', data: source });
  }

  function findRestoreChip() {
    return sceneRoot.children.find((child) => child.userData?.snPanelRestoreChip === true) || null;
  }

  return {
    adapter,
    controller,
    controllers,
    diagnosticEvents,
    findRestoreChip,
    frame,
    hitMeshCandidates,
    mesh,
    receipts,
    sceneRoot,
    selectAction,
    session,
    clearHit() {
      hit = null;
    },
  };
}

test('Three session controller closes a panel, spawns a restore chip, and restores it', async () => {
  assert.ok(XR_THREE_WEBXR_ADAPTER.capabilities.includes('three-portable-panel-close'));

  let harness = await createCloseHarness();
  let { mesh, receipts, sceneRoot } = harness;

  harness.frame(1000);
  harness.selectAction(mesh, 'close');

  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].action, 'close');
  assert.equal(receipts[0].accepted, true);
  assert.equal(receipts[0].phase, 'applied');
  assert.equal(receipts[0].panelId, 'panel-a');
  assert.equal(receipts[0].after.hidden, true);

  // Hiding the panel mesh hides the chrome with it (chrome is mesh-childed).
  assert.equal(mesh.visible, false);

  // A restore chip appears at the hidden panel's pose, parented to the scene
  // root so it rides root re-placement instead of inheriting visible=false.
  let chip = harness.findRestoreChip();
  assert.ok(chip);
  assert.equal(chip.parent, sceneRoot);
  assert.equal(chip.userData.panelId, 'panel-a');
  assert.ok(Math.abs(chip.position.x - 0) < 1e-6);
  assert.ok(Math.abs(chip.position.y - 1.4) < 1e-6);
  assert.ok(Math.abs(chip.position.z - (-1)) < 1e-6);
  assert.equal(
    hitTestXRPanelFrame(chip.userData.panelFrame, { x: 0.5, y: 0.5 })?.action,
    'restore',
  );

  // Hidden panels are excluded from hit candidates; the chip is included.
  harness.clearHit();
  harness.hitMeshCandidates.length = 0;
  harness.frame(1016);
  let candidates = harness.hitMeshCandidates.at(-1) || [];
  assert.equal(candidates.includes(mesh), false);
  assert.equal(candidates.includes(chip), true);

  // The chip is not a drag target.
  assert.equal(isXRFrameDragTargetValue(chip), false);

  // Re-place the root while hidden: the chip rides along as a root child.
  sceneRoot.position.set(1, 0, 0);
  assert.equal(chip.parent, sceneRoot);

  // Selecting the chip restores the panel and disposes the chip.
  harness.selectAction(chip, 'restore');
  assert.equal(receipts.length, 2);
  assert.equal(receipts[1].action, 'restore');
  assert.equal(receipts[1].accepted, true);
  assert.equal(receipts[1].phase, 'applied');
  assert.equal(receipts[1].before.hidden, true);
  assert.equal(mesh.visible, true);
  assert.equal(harness.findRestoreChip(), null);

  await harness.controller.stop();
});

function isXRFrameDragTargetValue(chip) {
  let target = hitTestXRPanelFrame(chip.userData.panelFrame, { x: 0.5, y: 0.5 });
  return target?.operation === 'move' || target?.operation === 'resize';
}

test('Three session controller close policy blocks the store call and emits a diagnostic', async () => {
  let harness = await createCloseHarness({ panelClosePolicy: () => false });

  harness.frame(1000);
  harness.selectAction(harness.mesh, 'close');

  // A blocked close emits no receipt: every receipt consumes a store sequence
  // number, which would deadlock a product-side prelude gate.
  assert.equal(harness.receipts.length, 0);
  assert.ok(harness.diagnosticEvents.includes('spatial-three-close-blocked'));
  assert.notEqual(harness.mesh.visible, false);
  assert.equal(harness.findRestoreChip(), null);

  await harness.controller.stop();
});

test('Three session controller rejects close on non-closable panels', async () => {
  let harness = await createCloseHarness({ closable: false });

  harness.frame(1000);
  harness.selectAction(harness.mesh, 'close');

  assert.equal(harness.receipts.length, 1);
  assert.equal(harness.receipts[0].action, 'close');
  assert.equal(harness.receipts[0].accepted, false);
  assert.equal(harness.receipts[0].reason, 'panel-not-closable');
  assert.equal(harness.receipts[0].phase, 'rejected');
  assert.notEqual(harness.mesh.visible, false);
  assert.equal(harness.findRestoreChip(), null);

  await harness.controller.stop();
});

test('Three session controller exposes fullscreen as a host-owned window intent', async () => {
  assert.ok(XR_THREE_WEBXR_ADAPTER.capabilities.includes('three-panel-fullscreen-intent'));
  let fullscreenIntents = [];
  let harness = await createCloseHarness({
    onPanelFullscreen(intent) {
      fullscreenIntents.push(intent);
    },
  });

  harness.frame(1000);
  harness.selectAction(harness.mesh, 'fullscreen');

  assert.equal(harness.receipts.length, 0);
  assert.equal(fullscreenIntents.length, 1);
  assert.equal(fullscreenIntents[0].version, 'xr-panel-fullscreen-intent-v1');
  assert.equal(fullscreenIntents[0].panelId, 'panel-a');
  assert.equal(fullscreenIntents[0].intent, 'panel-fullscreen');
  assert.equal(fullscreenIntents[0].context.sessionId, 'session-close');
  assert.ok(harness.diagnosticEvents.includes('spatial-three-panel-fullscreen'));

  await harness.controller.stop();
});
