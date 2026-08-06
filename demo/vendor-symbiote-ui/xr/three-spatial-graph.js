/**
 * @file xr/three-spatial-graph.js
 * @description Optional Three.js renderer adapter. Host supplies the THREE instance.
 */

import { createSpatialDragController, hitTestSpatialNode } from './spatial-drag-controller.js';
import { updateSpatialNodePosition } from './spatial-graph.js';

function setObjectPosition(object, position) {
  if (object?.position?.set) {
    object.position.set(position[0], position[1], position[2]);
  }
}

function setObjectScale(object, scale) {
  if (object?.scale?.set) {
    object.scale.set(scale[0], scale[1], scale[2]);
  }
}

function disposeObject(object) {
  object?.geometry?.dispose?.();
  object?.material?.dispose?.();
  object?.map?.dispose?.();
}

/**
 * Creates an orchestrator to render the spatial graph using Three.js.
 *
 * @param {Object} THREE - The Three.js library instance.
 * @param {Object} model - Spatial Graph Model v1.
 * @param {Object} [options]
 * @returns {Object} ThreeSpatialGraph controller.
 */
export function createThreeSpatialGraph(THREE, model, options = {}) {
  const container = new THREE.Group();
  const meshes = new Map(); // nodeId -> THREE.Mesh
  const linkLines = new Map(); // linkId -> THREE.Line
  const labels = new Map(); // nodeId -> label object
  const dragAffordances = new Map(); // nodeId -> focus/drag ring object
  let dragController = options.dragController || createSpatialDragController(options.drag || {});

  // Shared geometry and materials
  const sphereGeo = new THREE.SphereGeometry(1, 16, 16);
  const affordanceGeo = THREE.RingGeometry ? new THREE.RingGeometry(1.1, 1.25, 32) : sphereGeo;

  function getNodeColor(node) {
    let isSelected = model.selection?.activeNodeId === node.id;
    let isFocused = model.selection?.focusedNodeId === node.id;

    if (isSelected) return 0xff0055;
    if (isFocused) return 0x00ffcc;
    return 0x88aaff;
  }

  function createLabelObject(node) {
    if (options.createLabelObject) return options.createLabelObject(THREE, node);
    let label = new THREE.Group();
    label.userData = {
      kind: 'spatial-label',
      nodeId: node.id,
      text: node.label || node.id,
    };
    return label;
  }

  function createDragAffordance(node) {
    if (options.createDragAffordance) return options.createDragAffordance(THREE, node);
    let mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 });
    let ring = new THREE.Mesh(affordanceGeo, mat);
    ring.userData = {
      kind: 'spatial-drag-affordance',
      nodeId: node.id,
    };
    return ring;
  }

  function removeNodeObjects(id) {
    let mesh = meshes.get(id);
    let label = labels.get(id);
    let affordance = dragAffordances.get(id);
    if (mesh) {
      container.remove(mesh);
      disposeObject(mesh);
      meshes.delete(id);
    }
    if (label) {
      container.remove(label);
      disposeObject(label);
      labels.delete(id);
    }
    if (affordance) {
      container.remove(affordance);
      disposeObject(affordance);
      dragAffordances.delete(id);
    }
  }

  function update() {
    let activeNodeIds = new Set(model.nodes.map(n => n.id));

    for (let id of meshes.keys()) {
      if (!activeNodeIds.has(id)) {
        removeNodeObjects(id);
      }
    }

    for (let node of model.nodes) {
      let mesh = meshes.get(node.id);
      let label = labels.get(node.id);
      let affordance = dragAffordances.get(node.id);
      let color = getNodeColor(node);
      let isSelected = model.selection?.activeNodeId === node.id;
      let isFocused = model.selection?.focusedNodeId === node.id;

      if (!mesh) {
        let mat = new THREE.MeshBasicMaterial({ color });
        mesh = new THREE.Mesh(sphereGeo, mat);
        mesh.userData = {
          kind: 'spatial-node',
          nodeId: node.id,
        };
        container.add(mesh);
        meshes.set(node.id, mesh);
      } else {
        mesh.material.color.setHex(color);
      }

      if (!label) {
        label = createLabelObject(node);
        container.add(label);
        labels.set(node.id, label);
      }
      label.userData = {
        ...(label.userData || {}),
        kind: 'spatial-label',
        nodeId: node.id,
        text: node.label || node.id,
      };

      if (!affordance) {
        affordance = createDragAffordance(node);
        container.add(affordance);
        dragAffordances.set(node.id, affordance);
      }
      affordance.visible = Boolean(isSelected || isFocused || node.draggable);

      let pos = node.position || [0, 0, 0];
      let r = node.radius || 0.08;
      setObjectPosition(mesh, pos);
      setObjectScale(mesh, [r, r, r]);
      setObjectPosition(label, [pos[0], pos[1] + r * 1.6, pos[2]]);
      setObjectScale(label, [r, r, r]);
      setObjectPosition(affordance, pos);
      setObjectScale(affordance, [r, r, r]);
    }

    let activeLinkIds = new Set(model.links.map(l => l.id));

    for (let [id, line] of linkLines.entries()) {
      if (!activeLinkIds.has(id)) {
        container.remove(line);
        disposeObject(line);
        linkLines.delete(id);
      }
    }

    let nodesById = new Map(model.nodes.map(n => [n.id, n]));

    for (let link of model.links) {
      let sourceNode = nodesById.get(link.source);
      let targetNode = nodesById.get(link.target);

      if (!sourceNode || !targetNode) continue;

      let p1 = sourceNode.position || [0, 0, 0];
      let p2 = targetNode.position || [0, 0, 0];

      let line = linkLines.get(link.id);

      if (!line) {
        let geom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(p1[0], p1[1], p1[2]),
          new THREE.Vector3(p2[0], p2[1], p2[2]),
        ]);
        let mat = new THREE.LineBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.6 });
        line = new THREE.Line(geom, mat);
        line.userData = {
          kind: 'spatial-link',
          linkId: link.id,
        };
        container.add(line);
        linkLines.set(link.id, line);
      } else {
        let posAttr = line.geometry.attributes.position;
        posAttr.setXYZ(0, p1[0], p1[1], p1[2]);
        posAttr.setXYZ(1, p2[0], p2[1], p2[2]);
        posAttr.needsUpdate = true;
      }
    }
  }

  function startNodeDrag(pointer, hitOptions = {}) {
    let hit = hitTestSpatialNode(model.nodes, pointer, hitOptions);
    if (!hit) return null;
    return dragController.startDrag(hit.node, pointer);
  }

  function moveNodeDrag(pointer) {
    let record = dragController.moveDrag(pointer);
    if (record?.phase === 'move') {
      model = updateSpatialNodePosition(model, record.nodeId, record.position);
      update();
    }
    return record;
  }

  function endNodeDrag() {
    let record = dragController.endDrag();
    if (record?.phase === 'end') {
      model = updateSpatialNodePosition(model, record.nodeId, record.position);
      update();
    }
    return record;
  }

  function cancelNodeDrag(pointer) {
    return dragController.cancelDrag(pointer);
  }

  update();

  return {
    group: container,
    update,
    setModel: (newModel) => {
      model = newModel;
      update();
    },
    getModel: () => model,
    getNodeObject: (nodeId) => meshes.get(String(nodeId)) || null,
    getLabelObject: (nodeId) => labels.get(String(nodeId)) || null,
    getDragAffordance: (nodeId) => dragAffordances.get(String(nodeId)) || null,
    startNodeDrag,
    moveNodeDrag,
    endNodeDrag,
    cancelNodeDrag,
    destroy: () => {
      for (let id of [...meshes.keys()]) {
        removeNodeObjects(id);
      }
      for (let line of linkLines.values()) {
        container.remove(line);
        disposeObject(line);
      }
      meshes.clear();
      linkLines.clear();
      labels.clear();
      dragAffordances.clear();
      sphereGeo.dispose?.();
      if (affordanceGeo !== sphereGeo) affordanceGeo.dispose?.();
    },
  };
}
