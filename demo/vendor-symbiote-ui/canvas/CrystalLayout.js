import { normalizeForceGroups } from './graph-layout.js';

const CRYSTAL_DEFAULTS = Object.freeze({
  nodeWidth: 260,
  nodeHeight: 40,
  linkDistance: 150,
  groupDistance: 120,
  spokes: 6,
  angleJitter: 0.16,
});

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeId(value) {
  return String(value ?? '').trim();
}

function hashUnit(value) {
  let text = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function normalizeMass(value) {
  return clamp(finiteNumber(value, 1), 0.35, 8);
}

function resolveSize(node, options) {
  let configured = options.nodeSizes?.[node.id] || {};
  let defaultWidth = positiveNumber(options.nodeWidth, CRYSTAL_DEFAULTS.nodeWidth);
  let defaultHeight = positiveNumber(options.nodeHeight, CRYSTAL_DEFAULTS.nodeHeight);
  let width = positiveNumber(
    configured.w,
    positiveNumber(configured.width, positiveNumber(node.w, positiveNumber(node.width, defaultWidth))),
  );
  let height = positiveNumber(
    configured.h,
    positiveNumber(configured.height, positiveNumber(node.h, positiveNumber(node.height, defaultHeight))),
  );
  let scale = clamp(positiveNumber(node.layoutSizeScale, 1), 0.12, 1);
  return {
    w: Math.max(1, width * scale),
    h: Math.max(1, height * scale),
  };
}

function normalizeNodes(rawNodes, options) {
  let normalized = [];
  let seen = new Set();
  let ordered = [...rawNodes]
    .filter((node) => normalizeId(node?.id))
    .sort((left, right) => normalizeId(left.id).localeCompare(normalizeId(right.id)));
  for (let node of ordered) {
    let id = normalizeId(node.id);
    if (seen.has(id)) continue;
    seen.add(id);
    let size = resolveSize({ ...node, id }, options);
    normalized.push({
      ...node,
      id,
      parentId: normalizeId(node.parentId) || null,
      children: [...new Set(
        (Array.isArray(node.children) ? node.children : []).map(normalizeId).filter(Boolean),
      )].sort(),
      w: size.w,
      h: size.h,
      radius: Math.hypot(size.w, size.h) / 2,
      mass: normalizeMass(node.mass),
    });
  }
  return normalized;
}

function endpointId(edge, key) {
  let endpoint = edge?.[key] ?? edge?.[key === 'from' ? 'source' : 'target'];
  if (typeof endpoint === 'object') endpoint = endpoint?.node ?? endpoint?.id;
  return normalizeId(endpoint);
}

function createGraph(nodes, rawEdges) {
  let nodeIndex = new Map(nodes.map((node, index) => [node.id, index]));
  let nodeIds = new Set(nodeIndex.keys());
  let adjacency = nodes.map(() => new Set());
  let degree = new Array(nodes.length).fill(0);
  let edgeKeys = new Set();
  let addEdge = (sourceId, targetId) => {
    let source = nodeIndex.get(normalizeId(sourceId));
    let target = nodeIndex.get(normalizeId(targetId));
    if (source === undefined || target === undefined || source === target) return;
    let key = source < target ? `${source}\0${target}` : `${target}\0${source}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    adjacency[source].add(target);
    adjacency[target].add(source);
    degree[source] += 1;
    degree[target] += 1;
  };

  let edges = [...rawEdges]
    .map((edge) => ({ from: endpointId(edge, 'from'), to: endpointId(edge, 'to') }))
    .filter((edge) => edge.from && edge.to)
    .sort((left, right) => `${left.from}\0${left.to}`.localeCompare(`${right.from}\0${right.to}`));
  for (let edge of edges) addEdge(edge.from, edge.to);
  for (let node of nodes) {
    if (node.parentId && nodeIds.has(node.parentId)) addEdge(node.id, node.parentId);
    for (let childId of node.children) {
      if (nodeIds.has(childId)) addEdge(node.id, childId);
    }
  }

  return { nodeIndex, nodeIds, adjacency, degree, addEdge };
}

function nodeScore(node, index, degree) {
  let childScore = node.children.length * 1.15;
  let groupScore = node.isGroup ? 5 : 0;
  let parentScore = node.parentId ? 0 : 0.35;
  return (degree[index] || 0) + childScore + groupScore + node.mass * 0.35 + parentScore;
}

function sortByNodeScore(indexes, nodes, degree) {
  return [...indexes].sort((left, right) => (
    nodeScore(nodes[right], right, degree) - nodeScore(nodes[left], left, degree)
    || nodes[left].id.localeCompare(nodes[right].id)
  ));
}

function resolveGroupHub(groupId, memberIds, nodes, nodeIndex, degree) {
  if (nodeIndex.has(groupId)) return groupId;
  let groupNodes = memberIds
    .map((memberId) => nodes[nodeIndex.get(memberId)])
    .filter(Boolean);
  let explicit = groupNodes.filter((node) => node.isGroup);
  let candidates = explicit.length ? explicit : groupNodes;
  candidates.sort((left, right) => {
    let leftIndex = nodeIndex.get(left.id);
    let rightIndex = nodeIndex.get(right.id);
    return (degree[rightIndex] || 0) - (degree[leftIndex] || 0)
      || left.id.localeCompare(right.id);
  });
  return candidates[0]?.id || '';
}

function resolveGroups(rawGroups, nodes, graph) {
  let normalized = normalizeForceGroups(rawGroups || {}, graph.nodeIds);
  let preferredHubByMember = new Map();
  let groupHubIds = new Set();
  let entries = Object.entries(normalized)
    .map(([groupId, memberIds]) => [groupId, [...memberIds].sort()])
    .sort(([left], [right]) => left.localeCompare(right));

  for (let [groupId, memberIds] of entries) {
    if (memberIds.length < 2) continue;
    let hubId = resolveGroupHub(groupId, memberIds, nodes, graph.nodeIndex, graph.degree);
    if (!hubId) continue;
    groupHubIds.add(hubId);
    for (let memberId of memberIds) {
      if (memberId === hubId) continue;
      graph.addEdge(hubId, memberId);
      if (!preferredHubByMember.has(memberId)) preferredHubByMember.set(memberId, hubId);
    }
  }

  return { preferredHubByMember, groupHubIds };
}

function resolveRootId(options, nodes, nodeIndex, candidates) {
  let explicitRootId = normalizeId(options.rootNodeId);
  if (explicitRootId) {
    return nodeIndex.has(explicitRootId) ? explicitRootId : nodes[candidates[0] ?? 0].id;
  }
  let activeRootId = normalizeId(options.activeVisualNodeId);
  if (activeRootId && nodeIndex.has(activeRootId)) return activeRootId;
  return nodes[candidates[0] ?? 0].id;
}

function resolveOptions(rawOptions) {
  let linkDistance = positiveNumber(rawOptions.linkDistance, CRYSTAL_DEFAULTS.linkDistance);
  let groupDistance = positiveNumber(rawOptions.groupDistance, CRYSTAL_DEFAULTS.groupDistance);
  let configuredRingDistance = positiveNumber(rawOptions.crystalRingDistance, 0);
  let ringDistance = configuredRingDistance || Math.max(
    92,
    linkDistance * 0.72,
    groupDistance * 0.62,
  );
  return {
    ...rawOptions,
    linkDistance,
    groupDistance,
    ringDistance,
    spokes: Math.round(clamp(
      positiveNumber(rawOptions.crystalSpokes, CRYSTAL_DEFAULTS.spokes),
      3,
      12,
    )),
    angleJitter: clamp(
      finiteNumber(rawOptions.crystalAngleJitter, CRYSTAL_DEFAULTS.angleJitter),
      0,
      0.22,
    ),
  };
}

function targetCenter(nodes, ignorePositions) {
  if (ignorePositions) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  let totalMass = 0;
  for (let node of nodes) {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) continue;
    x += node.x * node.mass;
    y += node.y * node.mass;
    totalMass += node.mass;
  }
  return totalMass > 0 ? { x: x / totalMass, y: y / totalMass } : { x: 0, y: 0 };
}

function memberOrder(indexes, nodes) {
  return [...indexes].sort((left, right) => {
    let hashDelta = hashUnit(`${nodes[left].id}:crystal-slot`)
      - hashUnit(`${nodes[right].id}:crystal-slot`);
    return Math.abs(hashDelta) > 0.0001 ? hashDelta : nodes[left].id.localeCompare(nodes[right].id);
  });
}

function takeCrystalRingEntries(remaining, capacity, tailLimit) {
  let take = Math.min(capacity, remaining.length);
  let tail = remaining.length - take;
  if (tail > 0 && tail <= tailLimit) take += tail;
  return remaining.splice(0, take);
}

function assignHubMembers(nodes, graph, groupData, hubIndexes, rootIndex) {
  let semanticHubIndexes = new Set([...groupData.groupHubIds]
    .map((id) => graph.nodeIndex.get(id))
    .filter((index) => index !== undefined));
  let membersByHub = new Map([...hubIndexes].map((index) => [index, []]));
  let assign = (memberIndex, hubIndex) => {
    if (!hubIndexes.has(hubIndex) || hubIndexes.has(memberIndex)) return false;
    let members = membersByHub.get(hubIndex);
    if (!members.includes(memberIndex)) members.push(memberIndex);
    return true;
  };

  for (let index = 0; index < nodes.length; index++) {
    if (hubIndexes.has(index)) continue;
    let node = nodes[index];
    let preferredIndex = graph.nodeIndex.get(groupData.preferredHubByMember.get(node.id));
    if (assign(index, preferredIndex)) continue;
    let isAllowedHub = (hubIndex) => (
      hubIndexes.has(hubIndex) && !semanticHubIndexes.has(hubIndex)
    );
    let parentIndex = graph.nodeIndex.get(node.parentId);
    if (isAllowedHub(parentIndex) && assign(index, parentIndex)) continue;

    let childOwner = [...hubIndexes]
      .filter((hubIndex) => (
        isAllowedHub(hubIndex) && nodes[hubIndex].children.includes(node.id)
      ))
      .sort((left, right) => nodes[left].id.localeCompare(nodes[right].id))[0];
    if (assign(index, childOwner)) continue;

    let adjacentHub = sortByNodeScore(
      [...graph.adjacency[index]].filter(isAllowedHub),
      nodes,
      graph.degree,
    ).sort((left, right) => {
      let rootDelta = Number(left === rootIndex) - Number(right === rootIndex);
      return rootDelta || nodeScore(nodes[right], right, graph.degree)
        - nodeScore(nodes[left], left, graph.degree)
        || nodes[left].id.localeCompare(nodes[right].id);
    })[0];
    if (!assign(index, adjacentHub)) assign(index, rootIndex);
  }

  for (let [hubIndex, memberIndexes] of membersByHub) {
    membersByHub.set(hubIndex, memberOrder(memberIndexes, nodes));
  }
  return membersByHub;
}

function createMemberPattern(hub, members, options) {
  let placements = [];
  let padding = Math.max(16, options.ringDistance * 0.32);
  let previousRadius = 0;
  let previousMaxNodeRadius = hub.radius;
  let remaining = [...members];
  let ringIndex = 0;

  while (remaining.length) {
    let ringCapacity = options.spokes * (ringIndex + 1);
    let ringMembers = takeCrystalRingEntries(
      remaining,
      ringCapacity,
      Math.ceil(options.spokes / 2) - 1,
    );
    let count = ringMembers.length;
    let maxNodeRadius = Math.max(...ringMembers.map((node) => node.radius));
    let radius = Math.max(
      options.ringDistance,
      hub.radius + maxNodeRadius + padding,
    );
    if (count > 1) {
      let minAngle = (Math.PI * 2 / count) * (1 - options.angleJitter);
      let chordRadius = (maxNodeRadius * 2 + padding) / (2 * Math.sin(minAngle / 2));
      radius = Math.max(radius, chordRadius);
    }
    if (ringIndex > 0) {
      radius = Math.max(
        radius,
        previousRadius + previousMaxNodeRadius + maxNodeRadius + padding,
      );
    }

    let step = Math.PI * 2 / count;
    let offset = ringIndex % 2 === 0 ? 0 : step / 2;
    for (let slot = 0; slot < count; slot++) {
      let member = ringMembers[slot];
      let jitter = (hashUnit(`${member.id}:crystal-angle`) - 0.5)
        * step * options.angleJitter;
      placements.push({ node: member, radius, angle: offset + slot * step + jitter, ringIndex });
    }
    previousRadius = radius;
    previousMaxNodeRadius = maxNodeRadius;
    ringIndex += 1;
  }

  let clusterRadius = hub.radius;
  for (let placement of placements) {
    clusterRadius = Math.max(clusterRadius, placement.radius + placement.node.radius);
  }
  return { placements, clusterRadius };
}

function createHubTargets(rootIndex, hubIndexes, patterns, nodes, graph, options, center) {
  let targets = new Map();
  targets.set(rootIndex, { ...center, angle: -Math.PI / 2, shell: 0 });
  let orderedHubs = [...hubIndexes]
    .filter((index) => index !== rootIndex)
    .sort((left, right) => {
      let linkedDelta = Number(graph.adjacency[rootIndex].has(right))
        - Number(graph.adjacency[rootIndex].has(left));
      return linkedDelta || nodeScore(nodes[right], right, graph.degree)
        - nodeScore(nodes[left], left, graph.degree)
        || nodes[left].id.localeCompare(nodes[right].id);
    });
  let rootClusterRadius = patterns.get(rootIndex).clusterRadius;
  let hubPadding = Math.max(options.ringDistance * 1.3, 48);
  let previousRadius = 0;
  let previousMaxClusterRadius = rootClusterRadius;
  let shellIndex = 0;

  while (orderedHubs.length) {
    let shellCapacity = options.spokes * (shellIndex + 1);
    let shellHubs = takeCrystalRingEntries(
      orderedHubs,
      shellCapacity,
      Math.ceil(options.spokes / 2) - 1,
    );
    let count = shellHubs.length;
    let maxClusterRadius = Math.max(
      ...shellHubs.map((hubIndex) => patterns.get(hubIndex).clusterRadius),
    );
    let radius = Math.max(
      options.ringDistance * (3.2 + shellIndex * 1.8),
      rootClusterRadius + maxClusterRadius + hubPadding,
    );
    if (count > 1) {
      let minAngle = (Math.PI * 2 / count) * (1 - options.angleJitter);
      let chordRadius = (maxClusterRadius * 2 + hubPadding) / (2 * Math.sin(minAngle / 2));
      radius = Math.max(radius, chordRadius);
    }
    if (shellIndex > 0) {
      radius = Math.max(
        radius,
        previousRadius + previousMaxClusterRadius + maxClusterRadius + hubPadding,
      );
    }

    let step = Math.PI * 2 / count;
    let offset = shellIndex % 2 === 0 ? 0 : step / 2;
    for (let slot = 0; slot < count; slot++) {
      let hubIndex = shellHubs[slot];
      let jitter = (hashUnit(`${nodes[hubIndex].id}:crystal-hub-angle`) - 0.5)
        * step * options.angleJitter;
      let angle = -Math.PI / 2 + offset + slot * step + jitter;
      targets.set(hubIndex, {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
        angle,
        shell: shellIndex + 1,
      });
    }
    previousRadius = radius;
    previousMaxClusterRadius = maxClusterRadius;
    shellIndex += 1;
  }
  return targets;
}

function createCrystalPlan(rawNodes, rawEdges, rawGroups, rawOptions, ignorePositions) {
  let options = resolveOptions(rawOptions || {});
  let nodes = normalizeNodes(Array.isArray(rawNodes) ? rawNodes : [], options);
  if (!nodes.length) return { rootId: '', nodes, targets: {} };
  let graph = createGraph(nodes, Array.isArray(rawEdges) ? rawEdges : []);
  let groupData = resolveGroups(rawGroups, nodes, graph);
  let candidates = sortByNodeScore(nodes.map((node, index) => index), nodes, graph.degree);
  let rootId = resolveRootId(options, nodes, graph.nodeIndex, candidates);
  let rootIndex = graph.nodeIndex.get(rootId);
  let semanticHubIndexes = new Set([...groupData.groupHubIds]
    .map((id) => graph.nodeIndex.get(id))
    .filter((index) => index !== undefined));
  let hubIndexes = new Set(semanticHubIndexes);
  let hasExplicitGroups = semanticHubIndexes.size > 0;
  for (let index = 0; index < nodes.length; index++) {
    let node = nodes[index];
    if (node.isGroup
      || node.children.length
      || (!hasExplicitGroups && graph.degree[index] >= 5)) {
      hubIndexes.add(index);
    }
  }
  hubIndexes.add(rootIndex);

  let membersByHub = assignHubMembers(nodes, graph, groupData, hubIndexes, rootIndex);
  let patterns = new Map();
  for (let hubIndex of hubIndexes) {
    patterns.set(hubIndex, createMemberPattern(
      nodes[hubIndex],
      membersByHub.get(hubIndex).map((memberIndex) => nodes[memberIndex]),
      options,
    ));
  }
  let hubs = createHubTargets(
    rootIndex,
    hubIndexes,
    patterns,
    nodes,
    graph,
    options,
    targetCenter(nodes, ignorePositions),
  );
  let targets = {};
  for (let hubIndex of hubIndexes) {
    let hub = nodes[hubIndex];
    let hubTarget = hubs.get(hubIndex);
    targets[hub.id] = {
      x: hubTarget.x,
      y: hubTarget.y,
      seedX: hubTarget.x,
      seedY: hubTarget.y,
      shell: hubTarget.shell,
      center: true,
      layoutParentId: hubIndex === rootIndex ? null : nodes[rootIndex].id,
    };
    for (let placement of patterns.get(hubIndex).placements) {
      let angle = hubTarget.angle + placement.angle;
      let x = hubTarget.x + Math.cos(angle) * placement.radius;
      let y = hubTarget.y + Math.sin(angle) * placement.radius;
      targets[placement.node.id] = {
        x,
        y,
        seedX: x,
        seedY: y,
        shell: hubTarget.shell + placement.ringIndex + 1,
        center: false,
        layoutParentId: hub.id,
      };
    }
  }
  return { rootId, nodes, targets };
}

/**
 * @param {Array<object>} [nodes]
 * @param {Array<object>} [edges]
 * @param {Object<string, string[]>|Array<object>} [groups]
 * @param {object} [options]
 * @returns {Record<string, {x: number, y: number, seedX: number, seedY: number, shell: number, center: boolean, layoutParentId: string|null}>}
 */
export function computeCrystalTargets(nodes = [], edges = [], groups = {}, options = {}) {
  return createCrystalPlan(nodes, edges, groups, options, false).targets;
}

/**
 * @param {{getNodes: Function, getConnections: Function}} editor
 * @param {object} [options]
 * @returns {Record<string, {x: number, y: number}>}
 */
export function computeCrystalLayout(editor, options = {}) {
  let nodes = [...editor.getNodes()];
  let connections = [...editor.getConnections()];
  let plan = createCrystalPlan(nodes, connections, options.groups || {}, options, true);
  if (!plan.rootId) return {};
  let startX = finiteNumber(options.startX, 0);
  let startY = finiteNumber(options.startY, 0);
  let root = plan.nodes.find((node) => node.id === plan.rootId);
  let rootTarget = plan.targets[plan.rootId];
  let shiftX = startX + root.w / 2 - rootTarget.x;
  let shiftY = startY + root.h / 2 - rootTarget.y;
  let positions = {};
  for (let node of plan.nodes) {
    let target = plan.targets[node.id];
    positions[node.id] = {
      x: target.x + shiftX - node.w / 2,
      y: target.y + shiftY - node.h / 2,
    };
  }
  return positions;
}
