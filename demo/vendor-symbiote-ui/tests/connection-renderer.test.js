import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';

import { ConnectionRenderer } from '../canvas/ConnectionRenderer.js';
import { alignSampledRouteEndpoints } from '../canvas/CanvasGraph/CanvasGraphViewport.js';

function createNodeElement({ shape = 'disc', ports = { out: {} } } = {}) {
  return {
    _cachedW: 100,
    _cachedH: 100,
    _nodeData: { outputs: ports, inputs: ports },
    _position: { x: 0, y: 0 },
    getAttribute(name) {
      return name === 'node-shape' ? shape : '';
    },
  };
}

test('dynamic SVG edge connector exits a single round node toward the target', () => {
  let renderer = new ConnectionRenderer({
    svgLayer: null,
    nodeViews: new Map(),
    editor: null,
    onConnectionClick: () => {},
    getZoom: () => 1,
  });
  let nodeEl = createNodeElement();

  let offset = renderer.getSocketOffset(nodeEl, 'out', 'output', { x: 200, y: 50 });

  assert.equal(Math.round(offset.x), 100);
  assert.equal(Math.round(offset.y), 50);
  assert.equal(Math.round(offset.angle), 0);
});

test('connection route exposes only participating nodes and connections', () => {
  let previousDocument = globalThis.document;
  let { document } = parseHTML('<!doctype html><html><body></body></html>');
  globalThis.document = document;

  try {
    let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (let [id, offset] of [['a-b', 0], ['b-c', 100], ['a-x', 200]]) {
      let path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('data-conn-id', id);
      path.getTotalLength = () => 100;
      path.getPointAtLength = (distance) => ({ x: offset + distance, y: offset });
      svg.append(path);
    }
    let renderer = new ConnectionRenderer({
      svgLayer: svg,
      nodeViews: new Map(),
      editor: {
        getConnections: () => [
          { id: 'a-b', from: 'a', to: 'b' },
          { id: 'b-c', from: 'b', to: 'c' },
          { id: 'a-x', from: 'a', to: 'x' },
        ],
      },
      onConnectionClick: () => {},
      getZoom: () => 1,
    });

    let route = renderer.getRouteBetweenNodes('a', 'c');

    assert.deepEqual(route.nodeIds, ['a', 'b', 'c']);
    assert.deepEqual(route.connectionIds, ['a-b', 'b-c']);
    assert.ok(route.points.length >= 2);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('canvas connection renderer keeps single dynamic SVG ports free of side-gap offsets', async () => {
  let source = await readFile(new URL('../canvas/CanvasConnectionRenderer.js', import.meta.url), 'utf8');

  assert.match(source, /let angle = baseAngle;/);
  assert.match(source, /if \(total > 1\) \{\s*let sideGap = Math\.PI \/ 6;/s);
  assert.doesNotMatch(source, /let angle = baseAngle \+ \(side === 'output' \? -sideGap : sideGap\);/);
});

function createPlainRouteNode(x, y) {
  return {
    _position: { x, y },
    offsetWidth: 180,
    offsetHeight: 60,
    style: {},
    getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

function createSvgRouteRenderer(nodeViews) {
  let previousDocument = globalThis.document;
  let { document } = parseHTML('<!doctype html><html><body></body></html>');
  globalThis.document = document;
  let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  let path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('data-conn-id', 'a-b');
  path.setAttribute('d', 'M 0 0 L 50 200 L 100 100');
  path.getTotalLength = () => 0;
  path.getPointAtLength = () => ({ x: 0, y: 0 });
  svg.append(path);
  let renderer = new ConnectionRenderer({
    svgLayer: svg,
    nodeViews,
    editor: {
      getNode: (id) => ({ id, shape: null, outputs: {}, inputs: {} }),
      getConnections: () => [{ id: 'a-b', from: 'a', to: 'b', out: 'out', in: 'in' }],
    },
    onConnectionClick: () => {},
    getZoom: () => 1,
  });
  return { renderer, restore: () => { globalThis.document = previousDocument; } };
}

test('SVG focus route starts and ends at live connector positions', () => {
  let nodeA = createPlainRouteNode(0, 0);
  let nodeB = createPlainRouteNode(400, 0);
  let { renderer, restore } = createSvgRouteRenderer(new Map([['a', nodeA], ['b', nodeB]]));
  try {
    nodeA._position = { x: 250, y: 120 };
    let route = renderer.getRouteBetweenNodes('a', 'b').points;
    let endpoints = renderer.getConnectionEndpoints('a-b');

    assert.ok(route.length >= 3);
    assert.deepEqual(route[0], endpoints.start);
    assert.deepEqual(route.at(-1), endpoints.end);
  } finally {
    restore();
  }
});

test('alignSampledRouteEndpoints distributes endpoint correction by route distance', () => {
  let start = { x: 0, y: 0 };
  let end = { x: 101, y: 100 };
  let sampled = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 101, y: 0 }];
  let aligned = alignSampledRouteEndpoints(sampled, start, end);

  assert.deepEqual(aligned[0], start);
  assert.deepEqual(aligned.at(-1), end);
  assert.ok(Math.abs(aligned[1].y - 100 / 101) < 1e-9);
});

test('canvas connection renderer uses live positions for aligned route endpoints', async () => {
  let source = await readFile(new URL('../canvas/CanvasConnectionRenderer.js', import.meta.url), 'utf8');

  assert.match(source, /getConnectionEndpoints\(connId\) \{/);
  assert.match(source, /let fromPos = fromEl\._position \|\| \(fromRect \?/);
  assert.match(source, /let toPos = toEl\._position \|\| \(toRect \?/);
  assert.match(source, /alignSampledRouteEndpoints\(sampled, start, end\)/);
});

test('connection renderer supports scoped transient path styles', async () => {
  let source = await readFile(new URL('../canvas/ConnectionRenderer.js', import.meta.url), 'utf8');

  assert.match(source, /setTransientPathStyle\(style = '', options = \{\}\)/);
  assert.match(source, /options\.connectionIds/);
  assert.match(source, /#transientPathScope\(\)/);
  assert.match(source, /#pathStyleForConnection\(conn\)/);
  assert.match(source, /request\.connectionIds\.has\(conn\.id\)/);
  assert.match(source, /'pcb-drag-proxy'/);
  assert.match(source, /#buildPcbDragProxyPath\(conn, transientRequest/);
  assert.match(source, /#renderDragProxy\(connId, d\)/);
  assert.match(source, /data-conn-proxy-id/);
  assert.match(source, /#removeDragProxyPaths\(/);
  assert.match(source, /#scheduleProgressivePcb\(conn\.id\)/);
  assert.match(source, /#processProgressivePcb\(\)/);
  assert.match(source, /#connectionHasTransientRequest\(connId\)/);
  assert.match(source, /#progressivePcbSuspended\(\)/);
  assert.match(source, /#cancelProgressivePcbFrame\(\)/);
  assert.match(source, /#requestProgressivePcbFrame\(\)/);
  assert.match(source, /suspendProgressivePcb: options\.suspendProgressivePcb === true/);
  assert.match(source, /if \(!connectionIds\) this\.#cancelProgressivePcb\(\);/);
  assert.doesNotMatch(source, /if \(nextStyle\) \{\s*this\.#cancelProgressivePcb\(\);/s);
  assert.doesNotMatch(source, /if \(this\.#transientPathStyleRequests\.size\) return;/);
  assert.doesNotMatch(source, /if \(this\.#transientPathStyleRequests\.size\) \{\s*this\.#cancelProgressivePcb\(\);/s);
  assert.match(source, /let renderFullPcb = options\.fullPcb === true \|\| this\.#progressivePcbSuspended\(\);/);
  assert.match(source, /quality: renderFullPcb \? 'full' : 'draft'/);
  assert.match(source, /if \(!renderFullPcb\) \{/);
  assert.match(source, /#pcbPathSignature\(conn, pathStyle/);
  assert.match(source, /data-pcb-quality/);
  assert.match(source, /data-pcb-signature/);
  assert.match(source, /path\?\.getAttribute\('data-pcb-quality'\) === 'full'/);
  assert.doesNotMatch(source, /routed\.strategy === 'pcb-draft'/);
  assert.match(source, /options\.reuseFrozenPaths === true/);
  assert.match(source, /let anchor = frozen\[0\]/);
  assert.match(source, /let anchor = frozen\.at\(-1\)/);
});

test('canvas connection renderer supports pcb drag proxy without invalidating frozen paths', async () => {
  let source = await readFile(new URL('../canvas/CanvasConnectionRenderer.js', import.meta.url), 'utf8');

  assert.match(source, /setTransientPathStyle\(style = '', options = \{\}\)/);
  assert.match(source, /'pcb-drag-proxy'/);
  assert.match(source, /#activePcbDragProxyConnectionIds\(\)/);
  assert.match(source, /#buildPcbDragProxyPath\(conn, transientRequest/);
  assert.match(source, /dragProxyPath2D/);
  assert.match(source, /options\.reuseFrozenPaths === true/);
  assert.match(source, /options\.freezeLayer === true/);
  assert.match(source, /#captureFrozenConnectionLayer\(\)/);
  assert.match(source, /#drawFrozenDragProxies\(ctx, zoom, frozenProxyIds\)/);
  assert.match(source, /#scheduleProgressivePcb\(conn\.id\)/);
  assert.match(source, /#processProgressivePcb\(\)/);
  assert.match(source, /#connectionHasTransientRequest\(connId\)/);
  assert.match(source, /#progressivePcbSuspended\(\)/);
  assert.match(source, /#cancelProgressivePcbFrame\(\)/);
  assert.match(source, /#requestProgressivePcbFrame\(\)/);
  assert.match(source, /suspendProgressivePcb: options\.suspendProgressivePcb === true/);
  assert.doesNotMatch(source, /if \(this\.#transientPathStyleRequests\.size\) return;/);
  assert.doesNotMatch(source, /if \(this\.#transientPathStyleRequests\.size\) \{\s*this\.#cancelProgressivePcb\(\);/s);
  assert.match(source, /let renderFullPcb = options\.fullPcb === true \|\| this\.#progressivePcbSuspended\(\);/);
  assert.match(source, /quality: renderFullPcb \? 'full' : 'draft'/);
  assert.match(source, /if \(!renderFullPcb\) \{/);
  assert.match(source, /pathStyle: cachePathStyle/);
  assert.doesNotMatch(source, /routed\.strategy === 'pcb-draft'/);
  assert.match(source, /parent\.getBoundingClientRect\(\)/);
  assert.match(source, /let anchor = frozen\[0\]/);
  assert.match(source, /let anchor = frozen\.at\(-1\)/);
  assert.match(source, /if \(!this\.#hasPcbDragProxyForNode\(nodeId\)\)/);
  assert.doesNotMatch(source, /updateForNode\(_nodeId\) \{\s*this\.#invalidatePathCache\(\);/s);
});

test('scoped transient paths update only affected SVG connections', () => {
  let previousDocument = globalThis.document;
  let { document } = parseHTML('<!doctype html><html><body></body></html>');
  let createElementNS = document.createElementNS.bind(document);
  document.createElementNS = (namespace, tagName) => {
    let element = createElementNS(namespace, tagName);
    if (tagName === 'path') {
      element.getTotalLength = () => 100;
      element.getPointAtLength = (length) => ({ x: length, y: 0 });
    }
    return element;
  };
  globalThis.document = document;

  try {
    let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    let dots = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    let nodeViews = new Map();
    let editorNodes = new Map();
    let connections = [];

    for (let index = 0; index < 24; index += 1) {
      let id = `node-${index}`;
      let el = document.createElement('graph-node');
      el.setAttribute('node-shape', 'rect');
      el._cachedW = 160;
      el._cachedH = 80;
      el._position = {
        x: (index % 6) * 240,
        y: Math.floor(index / 6) * 150,
      };
      el._nodeData = {
        inputs: { in: { socket: { name: 'data' } } },
        outputs: { out: { socket: { name: 'data' } } },
      };
      nodeViews.set(id, el);
      editorNodes.set(id, {
        id,
        shape: 'rect',
        inputs: el._nodeData.inputs,
        outputs: el._nodeData.outputs,
      });
    }

    for (let index = 0; index < 48; index += 1) {
      connections.push({
        id: `conn-${index}`,
        from: `node-${index % 24}`,
        out: 'out',
        to: `node-${(index * 7 + 11) % 24}`,
        in: 'in',
      });
    }

    let renderer = new ConnectionRenderer({
      svgLayer: svg,
      dotLayer: dots,
      nodeViews,
      editor: {
        getNode: (id) => editorNodes.get(id),
      },
      onConnectionClick: () => {},
      getZoom: () => 1,
    });
    renderer.setPathStyle('pcb');
    renderer.addBatch(connections);

    let dWrites = 0;
    for (let path of svg.querySelectorAll('.sn-conn-path')) {
      let setAttribute = path.setAttribute.bind(path);
      path.setAttribute = (name, value) => {
        if (name === 'd') dWrites += 1;
        return setAttribute(name, value);
      };
    }

    let scopedIds = connections
      .filter((conn) => conn.from === 'node-0' || conn.to === 'node-0')
      .map((conn) => conn.id);

    renderer.setTransientPathStyle('straight', {
      source: 'node-drag',
      connectionIds: scopedIds,
    });
    assert.equal(dWrites, scopedIds.length);

    dWrites = 0;
    renderer.setTransientPathStyle('', { source: 'node-drag' });
    assert.equal(dWrites, scopedIds.length);

    dWrites = 0;
    renderer.setTransientPathStyle('pcb-drag-proxy', {
      source: 'node-drag',
      connectionIds: scopedIds,
      draggedNodeId: 'node-0',
    });
    assert.equal(dWrites, 0);
    assert.equal(svg.querySelectorAll('[data-conn-proxy-id]').length, scopedIds.length);

    renderer.setTransientPathStyle('', { source: 'node-drag' });
    assert.equal(svg.querySelectorAll('[data-conn-proxy-id]').length, 0);
    assert.equal(dWrites, scopedIds.length);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('node drag scopes transient paths to the dragged node connections', async () => {
  let source = await readFile(new URL('../canvas/NodeCanvas/NodeCanvas.js', import.meta.url), 'utf8');

  assert.match(source, /_connectionIdsForNode\(nodeId\)/);
  assert.match(source, /getNodeConnections\?\.\(nodeId\)/);
  assert.match(source, /getConnections\?\.\(\)\?\.filter/);
  assert.match(source, /let dragStyle = this\._pathStyle === 'pcb' \? 'pcb-drag-proxy' : 'straight';/);
  assert.match(source, /this\.setTransientPathStyle\(dragStyle, 'node-drag', \{/);
  assert.match(source, /draggedNodeId: nodeId/);
  assert.match(source, /freezeLayer: dragStyle === 'pcb-drag-proxy'/);
  assert.match(source, /suspendProgressivePcb: dragStyle === 'pcb-drag-proxy'/);
  assert.match(source, /suspendProgressivePcb: options\.suspendProgressivePcb/);
  assert.match(source, /_releaseNodeDragTransient\(\)/);
  assert.match(source, /this\._clearScheduledConnectionUpdates\(\);/);
  assert.doesNotMatch(source, /reuseFrozenPaths: true/);
  assert.doesNotMatch(source, /setTransientPathStyle\('pcb-drag-proxy', 'node-drag'/);
  assert.match(source, /_scheduleDragConnectionUpdate\(\)/);
  assert.match(source, /_dragConnectionUpdateInterval = 33/);
  assert.match(source, /_connectionUpdateTimer/);
  assert.doesNotMatch(source, /this\.setTransientPathStyle\('straight', 'node-drag'\);/);
});
