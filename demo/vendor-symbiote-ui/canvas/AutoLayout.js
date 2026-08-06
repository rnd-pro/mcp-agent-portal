/**
 * AutoLayout — Macro-Micro hierarchical graph layout
 *
 * Employs a 2-level strategy:
 * 1. Micro-Layout: Sugiyama-style layering with per-node dimensions.
 * 2. Macro-Layout: Radial Hub-and-Spoke spiraling to pack Group Bounds.
 *
 * Features (v2):
 * - Per-node width/height via `nodeSizes` map
 * - Bi-directional crossing minimization (forward + backward sweeps)
 * - Per-layer X offset based on actual max node width
 * - Per-node height-aware overlap resolution
 * - Optional sibling-layer wrapping via `maxLayerRows`
 * - Layout direction: 'LR' (left-right) or 'TB' (top-bottom)
 *
 * @module symbiote-ui/canvas/AutoLayout
 * @returns {Record<string, {x: number, y: number}>}
 */

export function computeAutoLayout(editor, options = {}) {
  let {
    nodeWidth = 180,
    nodeHeight = 140,
    gapX = 60,
    gapY = 30,
    startX = 60,
    startY = 60,
    crossingPasses = 4,
    existingPositions = null,
    groups = null,
    nodeSizes = null,
    direction = 'LR',
    maxLayerRows = Infinity,
  } = options;


  function getSize(nodeId) {
    if (nodeSizes && nodeSizes[nodeId]) {

      return {
        w: Math.max(nodeSizes[nodeId].w, nodeWidth),
        h: Math.max(nodeSizes[nodeId].h, nodeHeight),
      };
    }
    return { w: nodeWidth, h: nodeHeight };
  }

  function getDeterministicSign(a, b, salt = 0) {
    let value = salt;
    let key = `${a}:${b}`;
    for (let i = 0; i < key.length; i++) {
      value = (value * 31 + key.charCodeAt(i)) | 0;
    }
    return value % 2 === 0 ? 1 : -1;
  }

  function resolveFinalOverlaps(finalPositions, {
    paddingX = gapX * 0.35,
    paddingY = gapY * 0.5,
    passes = 12,
  } = {}) {
    let ids = Object.keys(finalPositions).sort();
    for (let pass = 0; pass < passes; pass++) {
      let overlaps = false;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          let id1 = ids[i];
          let id2 = ids[j];
          let p1 = finalPositions[id1];
          let p2 = finalPositions[id2];
          let s1 = getSize(id1);
          let s2 = getSize(id2);
          let c1x = p1.x + s1.w / 2;
          let c1y = p1.y + s1.h / 2;
          let c2x = p2.x + s2.w / 2;
          let c2y = p2.y + s2.h / 2;
          let dx = c1x - c2x;
          let dy = c1y - c2y;
          let minDx = (s1.w + s2.w) / 2 + paddingX;
          let minDy = (s1.h + s2.h) / 2 + paddingY;
          let overlapX = minDx - Math.abs(dx);
          let overlapY = minDy - Math.abs(dy);

          if (overlapX <= 0 || overlapY <= 0) continue;
          overlaps = true;

          if (overlapX < overlapY) {
            let sign = dx === 0 ? getDeterministicSign(id1, id2, pass) : Math.sign(dx);
            let fix = overlapX / 2 + 1;
            p1.x += sign * fix;
            p2.x -= sign * fix;
          } else {
            let sign = dy === 0 ? getDeterministicSign(id1, id2, pass + 17) : Math.sign(dy);
            let fix = overlapY / 2 + 1;
            p1.y += sign * fix;
            p2.y -= sign * fix;
          }
        }
      }
      if (!overlaps) break;
    }
  }

  let nodes = [...editor.getNodes()];
  let connections = [...editor.getConnections()];
  if (nodes.length === 0) return {};

  let outgoing = new Map();
  let incoming = new Map();
  for (const node of nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }

  for (const conn of connections) {
    let from = conn.from;
    let to = conn.to;
    if (outgoing.has(from) && incoming.has(to)) {
      outgoing.get(from).push(to);
      incoming.get(to).push(from);
    }
  }


  let nodeGroupId = new Map();
  let groupNodes = new Map();
  if (groups) {
    for (const [gId, gNodes] of Object.entries(groups)) {
      groupNodes.set(gId, []);
      for (const n of gNodes) {
        nodeGroupId.set(n, gId);
      }
    }
  }
  for (const n of nodes) {
    let gId = nodeGroupId.get(n.id);
    if (!gId) {
      gId = '__root__';
      nodeGroupId.set(n.id, gId);
    }
    if (!groupNodes.has(gId)) groupNodes.set(gId, []);
    groupNodes.get(gId).push(n.id);
  }


  let groupCrossLinks = new Map();
  let groupDegrees = new Map();
  for (const gId of groupNodes.keys()) {
    groupDegrees.set(gId, { in: 0, out: 0, total: 0 });
    groupCrossLinks.set(gId, { incoming: new Map(), outgoing: new Map() });
  }

  for (const [fromId, targets] of outgoing.entries()) {
    let gFrom = nodeGroupId.get(fromId);
    for (const toId of targets) {
      let gTo = nodeGroupId.get(toId);
      if (gFrom !== gTo) {
        groupDegrees.get(gFrom).out++;
        groupDegrees.get(gFrom).total++;
        groupDegrees.get(gTo).in++;
        groupDegrees.get(gTo).total++;

        let outMap = groupCrossLinks.get(gFrom).outgoing;
        outMap.set(gTo, (outMap.get(gTo) || 0) + 1);

        let inMap = groupCrossLinks.get(gTo).incoming;
        inMap.set(gFrom, (inMap.get(gFrom) || 0) + 1);
      }
    }
  }


  let centerGroup = null;
  let maxCross = -1;
  for (const [gId, deg] of groupDegrees.entries()) {
    if (deg.total > maxCross || (deg.total === maxCross && gId === './')) {
      maxCross = deg.total;
      centerGroup = gId;
    }
  }


  function computeMicroLayout(gId, subNodes) {
    let finalOut = new Map();
    let internalDegree = new Map();
    for (const n of subNodes) {
      finalOut.set(n, []);
      internalDegree.set(n, 0);
    }


    for (const n of subNodes) {
      for (const child of outgoing.get(n) || []) {
        if (finalOut.has(child)) {
          internalDegree.set(n, internalDegree.get(n) + 1);
          internalDegree.set(child, internalDegree.get(child) + 1);
        }
      }
    }


    let linkedNodes = [];
    let isolatedNodes = [];
    for (const n of subNodes) {
      if (internalDegree.get(n) === 0) isolatedNodes.push(n);
      else linkedNodes.push(n);
    }

    let localPositions = {};
    let maxLinkedW = 0,
      maxLinkedH = 0;


    if (linkedNodes.length > 0) {
      let state = new Map();
      for (const n of linkedNodes) state.set(n, 0);

      function dfs(nId) {
        state.set(nId, 1);
        for (const child of outgoing.get(nId) || []) {
          if (!finalOut.has(child)) continue;
          if (state.get(child) === 1) continue;
          finalOut.get(nId).push(child);
          if (state.get(child) === 0) dfs(child);
        }
        state.set(nId, 2);
      }
      for (const n of linkedNodes) {
        if (state.get(n) === 0) dfs(n);
      }

      let layers = new Map();
      for (const n of linkedNodes) layers.set(n, 0);

      for (let i = 0; i < linkedNodes.length; i++) {
        let changed = false;
        for (const n of linkedNodes) {
          let cur = layers.get(n);
          for (const child of finalOut.get(n)) {
            if (layers.get(child) < cur + 1) {
              layers.set(child, cur + 1);
              changed = true;
            }
          }
        }
        if (!changed) break;
      }

      let minL = Infinity,
        maxL = -Infinity;
      for (const n of linkedNodes) {
        let l = layers.get(n);
        if (l < minL) minL = l;
        if (l > maxL) maxL = l;
      }
      if (minL === Infinity) {
        minL = 0;
        maxL = 0;
      }

      let layerArr = [];
      for (let l = 0; l <= maxL - minL; l++) layerArr.push([]);
      for (const n of linkedNodes) layerArr[layers.get(n) - minL].push(n);


      let yPos = new Map();
      for (let l = 0; l < layerArr.length; l++) {
        let curY = 0;
        for (let i = 0; i < layerArr[l].length; i++) {
          yPos.set(layerArr[l][i], curY);
          curY += getSize(layerArr[l][i]).h + gapY;
        }
      }


      function resolveOverlaps(layer, yMap) {
        if (layer.length === 0) return;

        for (let i = 1; i < layer.length; i++) {
          let prevId = layer[i - 1];
          let curId = layer[i];
          let prevBottom = yMap.get(prevId) + getSize(prevId).h + gapY;
          if (yMap.get(curId) < prevBottom) {
            yMap.set(curId, prevBottom);
          }
        }

        for (let i = layer.length - 2; i >= 0; i--) {
          let curId = layer[i];
          let nextId = layer[i + 1];
          let maxY = yMap.get(nextId) - getSize(curId).h - gapY;
          if (yMap.get(curId) > maxY) {
            yMap.set(curId, maxY);
          }
        }
      }


      for (let pass = 0; pass < crossingPasses; pass++) {

        for (let l = 1; l < layerArr.length; l++) {
          for (let i = 0; i < layerArr[l].length; i++) {
            let node = layerArr[l][i];
            let parents = (incoming.get(node) || []).filter((n) => layerArr[l - 1].includes(n));
            if (parents.length > 0) {
              parents.sort((a, b) => yPos.get(a) - yPos.get(b));
              let mid = Math.floor(parents.length / 2);
              let tY = yPos.get(parents[mid]);
              if (parents.length % 2 === 0)
                tY = (yPos.get(parents[mid - 1]) + yPos.get(parents[mid])) / 2;
              yPos.set(node, tY);
            }
          }
          resolveOverlaps(layerArr[l], yPos);
        }

        for (let l = layerArr.length - 2; l >= 0; l--) {
          for (let i = 0; i < layerArr[l].length; i++) {
            let node = layerArr[l][i];
            let children = (finalOut.get(node) || []).filter((n) => layerArr[l + 1].includes(n));
            if (children.length > 0) {
              children.sort((a, b) => yPos.get(a) - yPos.get(b));
              let mid = Math.floor(children.length / 2);
              let tY = yPos.get(children[mid]);
              if (children.length % 2 === 0)
                tY = (yPos.get(children[mid - 1]) + yPos.get(children[mid])) / 2;
              yPos.set(node, tY);
            }
          }
          resolveOverlaps(layerArr[l], yPos);
        }
      }

      let rowLimit = Number.isFinite(maxLayerRows)
        ? Math.max(1, Math.floor(maxLayerRows))
        : Infinity;
      let layerMetrics = [];
      let packedPositions = new Map();

      for (let l = 0; l < layerArr.length; l++) {
        let ordered = [...layerArr[l]].sort((a, b) => {
          let dy = yPos.get(a) - yPos.get(b);
          return dy === 0 ? a.localeCompare(b) : dy;
        });
        let maxRows = rowLimit === Infinity ? Math.max(1, ordered.length) : rowLimit;
        let columns = [];
        for (let i = 0; i < ordered.length; i++) {
          let node = ordered[i];
          let colIndex = Math.floor(i / maxRows);
          if (!columns[colIndex]) {
            columns[colIndex] = { nodes: [], rowY: [], width: 0, height: 0 };
          }
          let col = columns[colIndex];
          let size = getSize(node);
          col.nodes.push(node);
          col.rowY.push(col.height);
          col.width = Math.max(col.width, size.w);
          col.height += size.h + gapY;
        }

        let layerW = 0;
        let layerH = 0;
        let colX = 0;
        for (const col of columns) {
          for (let i = 0; i < col.nodes.length; i++) {
            packedPositions.set(col.nodes[i], { x: colX, y: col.rowY[i] });
          }
          layerH = Math.max(layerH, col.height);
          colX += col.width + gapX;
        }
        if (columns.length > 0) {
          layerW = colX - gapX;
        }
        layerMetrics[l] = { w: layerW, h: layerH };
      }

      let layerXOffsets = [];
      let xAccum = 0;
      for (let l = 0; l < layerArr.length; l++) {
        layerXOffsets.push(xAccum);
        xAccum += (layerMetrics[l]?.w || nodeWidth) + gapX;
      }

      for (let l = 0; l < layerArr.length; l++) {
        for (const node of layerArr[l]) {
          let packed = packedPositions.get(node) || { x: 0, y: 0 };
          localPositions[node] = {
            x: layerXOffsets[l] + packed.x,
            y: packed.y,
          };
        }
      }

      maxLinkedW = xAccum;
      maxLinkedH = Math.max(...layerMetrics.map((metric) => metric?.h || 0), 0) + gapY;
    }


    let isolatedW = 0,
      isolatedH = 0;
    if (isolatedNodes.length > 0) {
      const MAX_COLS = 6;

      let colWidths = [];
      let rowHeights = [];
      for (let i = 0; i < isolatedNodes.length; i++) {
        let col = i % MAX_COLS;
        let row = Math.floor(i / MAX_COLS);
        let size = getSize(isolatedNodes[i]);
        if (!colWidths[col] || size.w > colWidths[col]) colWidths[col] = size.w;
        if (!rowHeights[row] || size.h > rowHeights[row]) rowHeights[row] = size.h;
      }


      let colX = [0];
      for (let c = 1; c < colWidths.length; c++) {
        colX[c] = colX[c - 1] + (colWidths[c - 1] || nodeWidth) + gapX;
      }

      let rowY = [0];
      for (let r = 1; r < rowHeights.length; r++) {
        rowY[r] = rowY[r - 1] + (rowHeights[r - 1] || nodeHeight) + gapY;
      }

      for (let i = 0; i < isolatedNodes.length; i++) {
        let node = isolatedNodes[i];
        let col = i % MAX_COLS;
        let row = Math.floor(i / MAX_COLS);

        localPositions[node] = {
          x: colX[col] || 0,
          y: maxLinkedH + (rowY[row] || 0),
        };
      }

      let lastCol = Math.min(isolatedNodes.length, MAX_COLS) - 1;
      let lastRow = rowHeights.length - 1;
      isolatedW = (colX[lastCol] || 0) + (colWidths[lastCol] || nodeWidth) + gapX;
      isolatedH = (rowY[lastRow] || 0) + (rowHeights[lastRow] || nodeHeight) + gapY;
    }

    let w = Math.max(maxLinkedW, isolatedW || nodeWidth + gapX);
    let h = maxLinkedH + isolatedH;

    return { localPositions, bounds: { w, h } };
  }


  let groupResults = new Map();
  for (const [gId, subNodes] of groupNodes.entries()) {
    groupResults.set(gId, computeMicroLayout(gId, subNodes));
  }


  const M_PI = Math.PI;
  let macroPositions = new Map();
  let placedRects = [];

  function hitTest(r1, r2, padding = 40) {
    return !(
      r2.x >= r1.x + r1.w + padding ||
      r2.x + r2.w + padding <= r1.x ||
      r2.y >= r1.y + r1.h + padding ||
      r2.y + r2.h + padding <= r1.y
    );
  }

  function placeGroup(gId) {
    let res = groupResults.get(gId);
    let prefAngle = 0;


    let vecX = 0,
      vecY = 0;
    let links = groupCrossLinks.get(gId);
    for (const p of placedRects) {
      let pId = p.id;
      let toPlaced = links.outgoing.get(pId) || 0;
      let fromPlaced = links.incoming.get(pId) || 0;

      let netForce = fromPlaced - toPlaced;
      if (netForce !== 0) {

        let cx = p.x + p.w / 2;
        let cy = p.y + p.h / 2;

        vecX += Math.cos(Math.atan2(cy, cx)) * netForce;
        vecY += Math.sin(Math.atan2(cy, cx)) * netForce;
      }
    }
    if (vecX !== 0 || vecY !== 0) prefAngle = Math.atan2(vecY, vecX);


    let step = Math.max(20, Math.min(res.bounds.w, res.bounds.h) * 0.2);
    let maxR = 6000;
    let angularStep = M_PI / 12;
    for (let r = 0; r < maxR; r += step) {
      for (let delta = 0; delta <= M_PI; delta += angularStep) {
        for (const sign of [1, -1]) {
          let a = prefAngle + delta * sign;
          let x = Math.round(Math.cos(a) * r);
          let y = Math.round(Math.sin(a) * r);

          let rect = { x, y, w: res.bounds.w, h: res.bounds.h, id: gId };
          let overlap = false;
          for (const p of placedRects) {
            if (hitTest(rect, p)) {
              overlap = true;
              break;
            }
          }
          if (!overlap) {
            macroPositions.set(gId, { x, y });
            placedRects.push(rect);
            return;
          }
          if (delta === 0) break;
        }
      }

      if (r > 500) step = Math.max(step, 60);
      if (r > 1500) step = Math.max(step, 120);
    }

    macroPositions.set(gId, { x: placedRects.length * 300, y: placedRects.length * 300 });
    placedRects.push({
      x: placedRects.length * 300,
      y: placedRects.length * 300,
      w: res.bounds.w,
      h: res.bounds.h,
      id: gId,
    });
  }


  if (centerGroup) {
    macroPositions.set(centerGroup, { x: 0, y: 0 });
    let cRes = groupResults.get(centerGroup);
    placedRects.push({ x: 0, y: 0, w: cRes.bounds.w, h: cRes.bounds.h, id: centerGroup });
  }


  let remainingGroups = Array.from(groupNodes.keys()).filter((id) => id !== centerGroup);
  remainingGroups.sort((a, b) => groupDegrees.get(b).total - groupDegrees.get(a).total);

  for (const gId of remainingGroups) {
    placeGroup(gId);
  }


  let finalPositions = {};
  for (const [gId, res] of groupResults.entries()) {
    let macro = macroPositions.get(gId);
    for (const [nId, loc] of Object.entries(res.localPositions)) {
      finalPositions[nId] = {
        x: startX + macro.x + loc.x,
        y: startY + macro.y + loc.y,
      };
    }
  }


  if (direction === 'TB') {
    for (const id in finalPositions) {
      let p = finalPositions[id];
      let tmp = p.x;
      p.x = p.y;
      p.y = tmp;
    }
  }


  if (existingPositions) {
    let sumDx = 0,
      sumDy = 0,
      count = 0;
    for (const [id, oldPos] of Object.entries(existingPositions)) {
      if (finalPositions[id] && !isNaN(oldPos.x) && !isNaN(oldPos.y)) {
        sumDx += oldPos.x - finalPositions[id].x;
        sumDy += oldPos.y - finalPositions[id].y;
        count++;
      }
    }
    if (count > 0) {
      let avgDx = sumDx / count;
      let avgDy = sumDy / count;
      for (const id in finalPositions) {
        finalPositions[id].x += avgDx;
        finalPositions[id].y += avgDy;
      }


    }
  }

  resolveFinalOverlaps(finalPositions, options.overlap);

  for (const k in finalPositions) {
    if (isNaN(finalPositions[k].x) || isNaN(finalPositions[k].y)) {
      console.error('[AutoLayout] NaN intercepted for node:', k);
      finalPositions[k] = { x: 0, y: 0 };
    }
  }

  return finalPositions;
}

/**
 * Tree Layout — positions nodes like a directory tree / file explorer.
 *
 * Algorithm: Compact tree (Reingold-Tilford inspired) with per-node dimensions.
 * - Builds a tree from either: (a) dirPaths parent-child hierarchy, or (b) DAG edges
 * - Positions root at top-left, children below with indentation
 * - Sibling subtrees are packed tightly without overlap
 * - Supports per-node dimensions via `nodeSizes`
 *
 * @param {NodeEditor} editor - The node editor
 * @param {object} options
 * @param {Object<string, { w: number, h: number }>} [options.nodeSizes] - Per-node dimensions
 * @param {number} [options.gapX=40] - Horizontal indentation per depth level
 * @param {number} [options.gapY=20] - Vertical gap between sibling nodes
 * @param {number} [options.nodeWidth=250] - Default node width
 * @param {number} [options.nodeHeight=100] - Default node height
 * @param {number} [options.startX=60] - Starting X
 * @param {number} [options.startY=60] - Starting Y
 * @param {Object<string, string>} [options.dirPaths] - { nodeId: dirPath } — enables directory hierarchy detection
 * @returns {Object<string, { x: number, y: number }>}
 */
export function computeTreeLayout(editor, options = {}) {

  let {
    gapX = 40,
    gapY = 20,
    nodeWidth = 250,
    nodeHeight = 100,
    startX = 60,
    startY = 60,
    nodeSizes = null,
    dirPaths = null,
  } = options;

  function getSize(nodeId) {
    if (nodeSizes && nodeSizes[nodeId]) {

      return {
        w: Math.max(nodeSizes[nodeId].w, nodeWidth),
        h: Math.max(nodeSizes[nodeId].h, nodeHeight),
      };
    }
    return { w: nodeWidth, h: nodeHeight };
  }

  let nodes = [...editor.getNodes()];
  let connections = [...editor.getConnections()];
  if (nodes.length === 0) return {};


  let children = new Map();
  let parent = new Map();
  let nodeIds = new Set(nodes.map((n) => n.id));

  for (const id of nodeIds) {
    children.set(id, []);
  }

  if (dirPaths) {


    let pathToId = new Map();
    for (const [nodeId, path] of Object.entries(dirPaths)) {
      pathToId.set(path, nodeId);
    }


    let sortedPaths = [...pathToId.keys()].sort((a, b) => {
      let depthA = a.split('/').filter(Boolean).length;
      let depthB = b.split('/').filter(Boolean).length;
      return depthA - depthB || a.localeCompare(b);
    });

    for (const path of sortedPaths) {
      let nodeId = pathToId.get(path);


      let segments = path.replace(/\/$/, '').split('/');
      segments.pop();

      let foundParent = false;

      while (segments.length > 0) {
        let parentPath = segments.join('/') + '/';
        let parentId = pathToId.get(parentPath);
        if (parentId && parentId !== nodeId) {
          parent.set(nodeId, parentId);
          children.get(parentId).push(nodeId);
          foundParent = true;
          break;
        }
        segments.pop();
      }

      if (!foundParent) {
        let rootId = pathToId.get('./');
        if (rootId && rootId !== nodeId) {
          parent.set(nodeId, rootId);
          children.get(rootId).push(nodeId);
        }
      }
    }
  } else {


    for (const conn of connections) {
      let from = conn.from;
      let to = conn.to;
      if (nodeIds.has(from) && nodeIds.has(to) && !parent.has(to)) {
        parent.set(to, from);
        children.get(from).push(to);
      }
    }
  }


  let roots = [];
  for (const id of nodeIds) {
    if (!parent.has(id)) roots.push(id);
  }


  let nodeMap = new Map(nodes.map((n) => [n.id, n]));
  let dirIdSet = dirPaths ? new Set(Object.keys(dirPaths)) : new Set();
  roots.sort((a, b) => {
    let aIsDir = dirIdSet.has(a) || nodeMap.get(a)?._isSubgraph;
    let bIsDir = dirIdSet.has(b) || nodeMap.get(b)?._isSubgraph;
    if (aIsDir && !bIsDir) return -1;
    if (!aIsDir && bIsDir) return 1;
    let la = nodeMap.get(a)?.label || '';
    let lb = nodeMap.get(b)?.label || '';
    return la.localeCompare(lb);
  });


  for (const [, kids] of children) {
    kids.sort((a, b) => {
      let la = nodeMap.get(a)?.label || '';
      let lb = nodeMap.get(b)?.label || '';
      return la.localeCompare(lb);
    });
  }


  let positions = {};
  let cursorY = startY;

  function layoutSubtree(nodeId, depth) {
    let size = getSize(nodeId);
    let x = startX + depth * (gapX + nodeWidth);
    let y = cursorY;

    positions[nodeId] = { x, y };
    cursorY += size.h + gapY;


    let kids = children.get(nodeId) || [];
    for (const childId of kids) {
      layoutSubtree(childId, depth + 1);
    }
  }

  for (const rootId of roots) {
    layoutSubtree(rootId, 0);
  }

  return positions;
}
