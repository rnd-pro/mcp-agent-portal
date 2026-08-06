import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';

class TestCSSStyleSheet {
  replaceSync(text) {
    this.cssText = text;
  }
}

function installSsrDom() {
  let { window } = parseHTML('<!doctype html><html><body></body></html>');
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    customElements: window.customElements,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    KeyboardEvent: window.KeyboardEvent,
    MutationObserver: window.MutationObserver,
    CSSStyleSheet: TestCSSStyleSheet,
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
  });
  window.document.adoptedStyleSheets = [];
  Object.defineProperty(window.HTMLElement.prototype, 'adoptedStyleSheets', {
    configurable: true,
    get() {
      return this.__symbioteSsrSheets || [];
    },
    set(value) {
      this.__symbioteSsrSheets = value;
    },
  });
  return window;
}

installSsrDom();

// Import geometry helpers
import {
  isPointInRect,
  isRectIntersecting,
  isRectContaining,
  computeSelectionBounds,
  isNodeInMarquee,
  areEdgeEndpointsInSelection,
  isEdgeIntersectingRect,
  alignNodes,
  distributeNodes,
} from '../interactions/SelectionGeometry.js';

// Import Selector
import { Selector } from '../interactions/Selector.js';

import { SelectionSync } from '../canvas/SelectionSync.js';
import { CanvasViewport } from '../canvas/CanvasViewport.js';

// Import graph-model helpers
import {
  groupNodes,
  ungroupNodes,
  addNodesToGroup,
  removeNodesFromGroup,
  createCanvasGraphStore
} from '../canvas/graph-model.js';

// Import ViewportActions
import { ViewportActions } from '../canvas/ViewportActions.js';

describe('SelectionGeometry Helpers', () => {
  it('isPointInRect verifies coordinate bounds correctly', () => {
    assert.equal(isPointInRect(5, 5, 0, 0, 10, 10), true);
    assert.equal(isPointInRect(15, 5, 0, 0, 10, 10), false);
    assert.equal(isPointInRect(0, 0, 0, 0, 10, 10), true);
    assert.equal(isPointInRect(10, 10, 0, 0, 10, 10), true);
  });

  it('isRectIntersecting verifies overlapping bounds', () => {
    let r1 = { x: 0, y: 0, width: 10, height: 10 };
    let r2 = { x: 5, y: 5, width: 10, height: 10 };
    let r3 = { x: 20, y: 20, width: 10, height: 10 };
    assert.equal(isRectIntersecting(r1, r2), true);
    assert.equal(isRectIntersecting(r1, r3), false);
  });

  it('isRectContaining verifies containment correctly', () => {
    let parent = { x: 0, y: 0, width: 20, height: 20 };
    let child1 = { x: 2, y: 2, width: 5, height: 5 };
    let child2 = { x: 15, y: 15, width: 10, height: 10 };
    assert.equal(isRectContaining(parent, child1), true);
    assert.equal(isRectContaining(parent, child2), false);
  });

  it('computeSelectionBounds calculates bounding box of multiple selected nodes', () => {
    let positions = {
      node1: { x: 10, y: 20 },
      node2: { x: 50, y: 60 },
    };
    let sizes = {
      node1: { width: 100, height: 40 },
      node2: { width: 80, height: 50 },
    };
    let bounds = computeSelectionBounds(positions, sizes, ['node1', 'node2']);
    assert.deepEqual(bounds, {
      x: 10,
      y: 20,
      width: 120, // max X (50+80=130) - min X (10) = 120
      height: 90, // max Y (60+50=110) - min Y (20) = 90
    });
  });

  it('isNodeInMarquee supports intersect and contain options', () => {
    let marquee = { x: 0, y: 0, width: 10, height: 10 };
    let nodeRect = { x: 5, y: 5, width: 10, height: 10 };

    assert.equal(isNodeInMarquee(nodeRect, marquee, { containment: 'intersect' }), true);
    assert.equal(isNodeInMarquee(nodeRect, marquee, { containment: 'contain' }), false);
  });

  it('isEdgeIntersectingRect detects wire intersections', () => {
    let rect = { x: 10, y: 10, width: 10, height: 10 };
    // Segment passes right through the middle of the rect
    let p1 = { x: 5, y: 15 };
    let p2 = { x: 25, y: 15 };
    assert.equal(isEdgeIntersectingRect(p1, p2, rect), true);

    // Segment is completely outside
    let p3 = { x: 0, y: 0 };
    let p4 = { x: 5, y: 5 };
    assert.equal(isEdgeIntersectingRect(p3, p4, rect), false);
  });

  it('alignNodes aligns left, right, top, bottom, horizontal center, and vertical center correctly', () => {
    let positions = {
      n1: { x: 10, y: 20 },
      n2: { x: 50, y: 40 },
    };
    let sizes = {
      n1: { width: 100, height: 40 },
      n2: { width: 80, height: 60 },
    };

    // Align left should align both to x=10
    let alignedLeft = alignNodes(positions, sizes, ['n1', 'n2'], 'left');
    assert.equal(alignedLeft.n1.x, 10);
    assert.equal(alignedLeft.n2.x, 10);

    // Align right should align both to max right edge: max(10+100, 50+80) = 130.
    // n1.x becomes 130 - 100 = 30. n2.x becomes 130 - 80 = 50.
    let alignedRight = alignNodes(positions, sizes, ['n1', 'n2'], 'right');
    assert.equal(alignedRight.n1.x, 30);
    assert.equal(alignedRight.n2.x, 50);

    // Align top should align both to y=20
    let alignedTop = alignNodes(positions, sizes, ['n1', 'n2'], 'top');
    assert.equal(alignedTop.n1.y, 20);
    assert.equal(alignedTop.n2.y, 20);

    // Align bottom should align both to max bottom edge: max(20+40, 40+60) = 100.
    // n1.y becomes 100 - 40 = 60. n2.y becomes 100 - 60 = 40.
    let alignedBottom = alignNodes(positions, sizes, ['n1', 'n2'], 'bottom');
    assert.equal(alignedBottom.n1.y, 60);
    assert.equal(alignedBottom.n2.y, 40);

    // Align horizontal center (average along Y-axis center)
    // n1 center Y = 20 + 20 = 40. n2 center Y = 40 + 30 = 70. Avg = 55.
    // n1.y = 55 - 20 = 35. n2.y = 55 - 30 = 25.
    let alignedH = alignNodes(positions, sizes, ['n1', 'n2'], 'horizontal');
    assert.equal(alignedH.n1.y, 35);
    assert.equal(alignedH.n2.y, 25);

    // Align vertical center (average along X-axis center)
    // n1 center X = 10 + 50 = 60. n2 center X = 50 + 40 = 90. Avg = 75.
    // n1.x = 75 - 50 = 25. n2.x = 75 - 40 = 35.
    let alignedV = alignNodes(positions, sizes, ['n1', 'n2'], 'vertical');
    assert.equal(alignedV.n1.x, 25);
    assert.equal(alignedV.n2.x, 35);
  });

  it('distributeNodes distributes nodes evenly horizontally and vertically', () => {
    let positions = {
      n1: { x: 0, y: 0 },
      n2: { x: 40, y: 0 },
      n3: { x: 200, y: 0 },
    };
    let sizes = {
      n1: { width: 50, height: 20 },
      n2: { width: 50, height: 20 },
      n3: { width: 50, height: 20 },
    };

    // Distribute horizontally
    // Sort order: n1, n2, n3.
    // Total span: 200 + 50 - 0 = 250. Total width: 150. Total gap = 100. Gap count = 2. Gap size = 50.
    // n1.x = 0, n2.x = 100, n3.x = 200.
    let distH = distributeNodes(positions, sizes, ['n1', 'n2', 'n3'], 'horizontal');
    assert.equal(distH.n1.x, 0);
    assert.equal(distH.n2.x, 100);
    assert.equal(distH.n3.x, 200);
  });
});

describe('Selector Model Extensions', () => {
  it('selects, toggles and checks nodes/connections', () => {
    let selector = new Selector();
    selector.selectNode('node-a');
    assert.equal(selector.isNodeSelected('node-a'), true);

    selector.toggleNode('node-a');
    assert.equal(selector.isNodeSelected('node-a'), false);

    selector.selectNodes(['node-a', 'node-b']);
    assert.deepEqual(Array.from(selector.getSelectedNodes()), ['node-a', 'node-b']);

    selector.selectConnections(['conn-1']);
    assert.deepEqual(Array.from(selector.getSelectedConnections()), ['conn-1']);

    selector.toggleConnection('conn-1');
    assert.equal(selector.isConnectionSelected('conn-1'), false);

    selector.selectConnection('conn-2');
    selector.deselectConnection('conn-2');
    assert.equal(selector.isConnectionSelected('conn-2'), false);
  });

  it('can retain selected nodes while adding marquee-selected connections', () => {
    let selector = new Selector();
    selector.selectNodes(['node-a', 'node-b']);
    selector.selectConnections(['conn-1'], true);

    assert.deepEqual(Array.from(selector.getSelectedNodes()), ['node-a', 'node-b']);
    assert.deepEqual(Array.from(selector.getSelectedConnections()), ['conn-1']);
  });

  it('returns selection snapshots instead of mutable internal sets', () => {
    let selector = new Selector();
    selector.selectNodes(['node-a']);
    selector.selectConnections(['conn-1'], true);

    selector.getSelectedNodes().add('external-node');
    selector.getSelectedConnections().delete('conn-1');

    assert.deepEqual(Array.from(selector.getSelectedNodes()), ['node-a']);
    assert.deepEqual(Array.from(selector.getSelectedConnections()), ['conn-1']);
  });
});

describe('SelectionSync Connection Focus', () => {
  it('keeps node geometry stable across visual LOD changes', async () => {
    let source = await readFile(new URL('../node/GraphNode/GraphNode.css.js', import.meta.url), 'utf8');
    let medium = source.match(/&\[data-lod='medium'\] \{([\s\S]*?)\n    \}/)?.[1] || '';

    assert.match(medium, /visibility: hidden;/);
    assert.match(medium, /pointer-events: none;/);
    assert.doesNotMatch(medium, /display: none;/);
    assert.doesNotMatch(medium, /sn-node-lod-body-padding/);
  });

  it('prewarms an explicitly protected node before viewport motion starts', () => {
    let target = document.createElement('graph-node');
    target.style.visibility = 'hidden';
    let warmedConnectors = [];
    let viewport = new CanvasViewport({
      canvas: {},
      nodeViews: new Map([['target', target]]),
      viewManager: { addView() {} },
      getConnRenderer: () => ({
        prewarmNodes: (nodeIds) => warmedConnectors.push(...nodeIds),
      }),
    });

    let protectedIds = viewport.prewarmFocusNodes({ nodeIds: ['target'] });

    assert.deepEqual(protectedIds, ['target']);
    assert.equal(target.style.visibility, '');
    assert.deepEqual(warmedConnectors, ['target']);
  });

  it('releases viewport transition state when the graph is cleared mid-flight', () => {
    let resumed = [];
    let canvas = {
      _viewportProtectedNodeIds: new Set(['target']),
      _viewportResizeSettleSuppressUntil: Number.POSITIVE_INFINITY,
      _viewportAnimating: true,
      toggleAttribute(name, active) {
        this[name] = active;
      },
    };
    let viewport = new CanvasViewport({
      canvas,
      nodeViews: new Map(),
      viewManager: { addView() {} },
      getConnRenderer: () => ({
        resumeProgressiveRendering: (source) => resumed.push(source),
      }),
    });

    viewport.clear();

    assert.equal(canvas._viewportProtectedNodeIds, null);
    assert.equal(canvas._viewportResizeSettleSuppressUntil, 0);
    assert.equal(canvas._viewportAnimating, false);
    assert.equal(canvas['data-viewport-animating'], false);
    assert.deepEqual(resumed, ['viewport-motion']);
  });

  it('settles connection geometry after viewport and layout changes', async () => {
    let source = await readFile(
      new URL('../canvas/NodeCanvas/NodeCanvas.js', import.meta.url),
      'utf8'
    );

    assert.match(source, /_settleConnectionsAfterViewport\(_passes = 3\) \{/);
    assert.match(source, /this\._connRenderer\?\.refreshViewportTransform\?\.\(\);/);
    let settleBlock = source.match(/_settleConnectionsAfterViewport\(_passes = 3\) \{([\s\S]*?)\n  \}/)?.[1] || '';
    assert.doesNotMatch(settleBlock, /_scheduleConnectionSettleRefresh/);
    assert.doesNotMatch(settleBlock, /refreshConnections/);
    assert.match(source, /fitView\(\) \{\s+this\._viewport\?\.fitView\(\);\s+this\._settleConnectionsAfterViewport\(3\);/);
    assert.match(source, /selectNode\(nodeId\) \{\s+let options = this\._activeFocusTransitionOptions \|\| \{\};\s+let prepared = this\._prepareFocusTransition\(nodeId, options\);/);
    assert.match(source, /this\._runFocusTransition\(nodeId, prepared, options\);/);
    assert.match(source, /this\._connRenderer\?\.getRouteBetweenNodes\?\.\(fromId, target\)/);
    assert.match(source, /onSvgShapeReady: \(nodeId\) => this\._connRenderer\?\.prewarmNodes\?\.\(\[nodeId\]\)/);
    assert.match(source, /let routePoints = route\?\.points \|\| null;/);
    assert.match(source, /let routeNodeIds = route\?\.nodeIds\?\.length \? route\.nodeIds : \[fromId, target\];/);
    assert.match(source, /focusBounds = this\._getFocusTransitionBounds\(routeNodeIds, routePoints\);/);
    assert.match(source, /_getRouteGraphBounds\(routePoints\) \{/);
    assert.doesNotMatch(source, /_resolveFocusViewportPhases/);
    assert.match(source, /viewportTargetNodeId: prepared\.target/);
    assert.match(source, /prewarmFocusNodes\?\.\({/);
    assert.match(source, /nodeIds: routeNodeIds/);
    assert.match(source, /protectedNodeIds = prepared\.protectedNodeIds \|\| prepared\.routeNodeIds/);
    assert.doesNotMatch(source, /routePoints\.unshift\(graphFrom\)/);
    assert.doesNotMatch(source, /routePoints\.push\(graphTo\)/);
    assert.match(source, /_resolveFocusTransitionMs\(prepared, options = \{\}\)/);
    assert.match(source, /resolveCanvasGraphTransitionDuration\(\{/);
    assert.match(source, /distanceScale: Number\.isFinite\(this\.\$\?\.zoom\) \? this\.\$\.zoom : 1/);
    assert.match(source, /globalThis\.matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)\?\.matches === true/);
    assert.match(source, /transitionSpeed/);
    assert.match(source, /transitionMinMs/);
    assert.match(source, /transitionMaxMs/);
    assert.match(source, /transitionRouteStart/);
    assert.match(source, /transitionRouteEnd/);
    assert.match(source, /let routeStart = Number\.isFinite\(options\.transitionRouteStart\)[\s\S]*?: 0;/);
    assert.match(source, /let routeEnd = Number\.isFinite\(options\.transitionRouteEnd\)[\s\S]*?: 1;/);
    assert.match(source, /_pointAtRouteProgress\(routePoints, routeEase\)/);
    assert.match(source, /_refreshFocusTransitionMarker\(\)/);
    assert.match(source, /transitionClock: createFocusTransitionClock\(options\.transitionStartTime\)/);
    assert.match(source, /transitionMarkerMs: transitionMs/);
    assert.match(source, /viewportRoutePoints: prepared\.routePoints/);
    assert.match(source, /viewportRouteFitBounds: prepared\.focusBounds/);
    assert.match(source, /viewportRouteConnectionIds: prepared\.routeConnectionIds/);
    assert.match(source, /viewportProtectedNodeIds: protectedNodeIds/);
    assert.match(source, /this\._settleConnectionsAfterViewport\(3\);/);
    assert.match(source, /if \(options\.select === false\) \{\s+this\._runFocusTransition\(nodeId, prepared, options\);/);
    assert.match(source, /let transitionTarget = typeof options\.transitionTarget === 'string' && options\.transitionTarget/);
    assert.match(source, /ids\.length === 1\s+\? ids\[0\]/);
    assert.match(source, /this\._runFocusTransition\(transitionTarget, prepared, options\);/);
    assert.match(source, /this\._activeFocusTransitionOptions = options;\s+this\._clearConnectionSettleRefresh\(\);/);
    assert.match(source, /let suppressConnectionResizeSettle = now < \(this\._viewportResizeSettleSuppressUntil \|\| 0\);/);
    assert.match(source, /if \(suppressConnectionResizeSettle\) \{\s+this\._queueSuppressedNodeResizeUpdate\(nodeId, now\);\s+} else \{\s+this\._scheduleConnectionUpdate\(nodeId\);\s+changed = true;\s+}/);
    assert.match(source, /_flushSuppressedNodeResizeUpdates\(\) \{/);
    let applyLayoutBlock = source.match(
      /  applyLayout\(options = \{\}\) \{([\s\S]*?)\n  \}\n\n  \/\*\*\n   \* Apply auto layout/
    )?.[1] || '';
    assert.equal((applyLayoutBlock.match(/this\.refreshConnections\(\);/g) || []).length, 1);
    assert.match(applyLayoutBlock, /if \(options\.fit === true\) \{\s+this\.fitView\(\);\s+\}/);
    assert.doesNotMatch(applyLayoutBlock, /_scheduleConnectionSettleRefresh/);
    assert.match(source, /this\.refreshConnections\(\);\s+this\._scheduleConnectionSettleRefresh\(3\);\s+return editor;/);
  });

  it('keeps viewport node bounds synchronized with observed element size', async () => {
    let { NodeCanvas } = await import('../canvas/NodeCanvas/NodeCanvas.js');
    let element = {
      isConnected: true,
      _cachedW: 180,
      _cachedH: 40,
      getAttribute: () => 'node-a',
    };
    let scheduled = [];
    let canvas = Object.assign(Object.create(NodeCanvas.prototype), {
      _nodeSizeCache: new Map([['node-a', { width: 180, height: 40 }]]),
      _viewportResizeSettleSuppressUntil: 0,
      _readNodeElementSize: () => ({ width: 196, height: 132 }),
      _scheduleConnectionUpdate: (nodeId) => scheduled.push(nodeId),
      _scheduleConnectionSettleRefresh: () => {},
    });

    canvas._handleNodeResizeEntries([{ target: element }]);

    assert.equal(element._cachedW, 196);
    assert.equal(element._cachedH, 132);
    assert.deepEqual(canvas._nodeSizeCache.get('node-a'), { width: 196, height: 132 });
    assert.deepEqual(scheduled, ['node-a']);
  });

  it('defers culling and LOD work during viewport animation frames', async () => {
    let source = await readFile(new URL('../canvas/CanvasViewport.js', import.meta.url), 'utf8');
    let nodeCanvasSource = await readFile(
      new URL('../canvas/NodeCanvas/NodeCanvas.js', import.meta.url),
      'utf8'
    );

    assert.match(source, /updateTransform\(options = \{\}\)/);
    assert.match(source, /if \(options\.deferCulling\) return;/);
    assert.match(source, /const MANUAL_INTERACTION_CULLING_SETTLE_MS = 180;/);
    assert.match(source, /if \(this\.#canvas\.hasAttribute\?\.\('data-interacting'\)\) \{\s*this\.#deferCullingUntilInteractionSettles\(\);\s*return;/);
    assert.match(source, /#deferCullingUntilInteractionSettles\(\) \{\s*if \(this\.#virtTimer\) clearTimeout\(this\.#virtTimer\);/);
    assert.match(source, /this\.#virtTimer = setTimeout\(\(\) => \{\s*this\.#virtTimer = null;\s*this\.#applyCullingAndLOD\(\);\s*\}, MANUAL_INTERACTION_CULLING_SETTLE_MS\);/);
    assert.match(source, /deferCulling: t < 1/);
    assert.match(source, /cancelAnimation\(\) \{\s*let active = Boolean\(this\.#panAnimFrame \|\| this\.#canvas\._viewportAnimating\);/);
    assert.match(nodeCanvasSource, /_cancelViewportMotionForManualInteraction\(\) \{\s*this\._viewport\?\.cancelAnimation\?\.\(\);\s*this\._hideFocusTransitionMarker\(\);/);
    assert.match(nodeCanvasSource, /onTranslate: \(x, y, e\) => \{[\s\S]*?this\._cancelViewportMotionForManualInteraction\(\);/);
    assert.match(nodeCanvasSource, /\(delta, ox, oy\) => \{\s*if \(this\._viewportLocked\) return;\s*this\._cancelViewportMotionForManualInteraction\(\);/);
    assert.match(source, /this\.#setViewportTransform\(target\);/);
    assert.match(source, /prewarmFocusNodes\(\{ nodeIds = \[\] \} = \{\}\) \{/);
    assert.match(source, /for \(const id of protectedIds\) \{/);
    assert.match(source, /if \(el\.style\.visibility !== ''\) el\.style\.visibility = '';/);
    assert.doesNotMatch(source, /distanceToPolyline/);
    assert.match(source, /suspendProgressiveRendering\?\.\('viewport-motion'\)/);
    assert.match(source, /resumeProgressiveRendering\?\.\('viewport-motion'\)/);
    assert.match(source, /_viewportAnimating = true/);
    assert.match(source, /_viewportAnimating = false/);
    assert.match(source, /_viewportProtectedNodeIds = protectedNodeIds\.length \? new Set\(protectedNodeIds\) : null;/);
    assert.match(source, /_viewportResizeSettleSuppressUntil = Number\.POSITIVE_INFINITY;/);
    assert.match(source, /_viewportResizeSettleSuppressUntil = now \+ 320;/);
    assert.match(source, /this\.#canvas\._flushSuppressedNodeResizeUpdates\?\.\(\);/);
    assert.match(source, /if \(protectedNodeIds\?\.has\(id\)\) \{/);
    assert.match(source, /if \(promotedProtectedNode\) this\.#syncPhantomToRenderer\(\);/);
    assert.match(source, /ensureNodeView\(nodeId\) \{/);
    assert.match(source, /Math\.min\(target\.zoom, options\.maxZoom \?\? 1\.5\)/);
    assert.doesNotMatch(source, /Math\.min\(start\.zoom, target\.zoom/);
    assert.match(nodeCanvasSource, /_progressiveConnectionSuspensions = new Set\(\);/);
    assert.match(nodeCanvasSource, /setProgressiveConnectionRendering\(enabled = true, source = 'default'\)/);
    assert.match(nodeCanvasSource, /this\._connRenderer\?\.suspendProgressiveRendering\?\.\(source\);/);
    assert.match(nodeCanvasSource, /this\._connRenderer\?\.resumeProgressiveRendering\?\.\(source\);/);
    assert.match(source, /let shouldSelect = select !== false;/);
    assert.match(source, /if \(shouldSelect\) this\.#canvas\.selectNode\(selectId\);/);
  });

  it('exposes connection routes for focus marker traversal', async () => {
    let svgSource = await readFile(new URL('../canvas/ConnectionRenderer.js', import.meta.url), 'utf8');
    let canvasSource = await readFile(new URL('../canvas/CanvasConnectionRenderer.js', import.meta.url), 'utf8');

    assert.match(svgSource, /getRouteBetweenNodes\(fromNodeId, toNodeId, \{ maxDepth = 8 \} = \{\}\)/);
    assert.match(svgSource, /sampleSvgPathPoints\(path\)/);
    assert.match(svgSource, /nodeIds: \[fromId, \.\.\.nextSegments\.map/);
    assert.match(svgSource, /connectionIds: nextSegments\.map/);
    assert.match(svgSource, /suspendProgressiveRendering\(source = 'viewport-motion'\)/);
    assert.match(svgSource, /resumeProgressiveRendering\(source = 'viewport-motion'\)/);
    assert.match(svgSource, /this\.#editor\?\.getConnections\?\.\(\) \|\| \[\]/);
    assert.match(svgSource, /if \(segment\.reverse\) sampled = \[\.\.\.sampled\]\.reverse\(\);/);
    assert.match(svgSource, /alignSampledRouteEndpoints\(sampled, start, end\)/);
    assert.match(canvasSource, /getRouteBetweenNodes\(fromNodeId, toNodeId, \{ maxDepth = 8 \} = \{\}\)/);
    assert.match(canvasSource, /samplePathDPoints\(cached\.d\)/);
    assert.match(canvasSource, /nodeIds: \[fromId, \.\.\.nextSegments\.map/);
    assert.match(canvasSource, /connectionIds: nextSegments\.map/);
    assert.match(canvasSource, /suspendProgressiveRendering\(source = 'viewport-motion'\)/);
    assert.match(canvasSource, /resumeProgressiveRendering\(source = 'viewport-motion'\)/);
    assert.match(canvasSource, /this\.#editor\?\.getConnections\?\.\(\) \|\| \[\]/);
    assert.match(canvasSource, /if \(segment\.reverse\) sampled = \[\.\.\.sampled\]\.reverse\(\);/);
    assert.match(canvasSource, /alignSampledRouteEndpoints\(sampled, start, end\)/);
  });

  it('styles dimmed connection paths as neutral inactive wires', async () => {
    let source = await readFile(
      new URL('../canvas/NodeCanvas/NodeCanvas.css.js', import.meta.url),
      'utf8'
    );

    assert.match(source, /\.sn-conn-path\[data-dimmed\]/);
    assert.match(source, /stroke: var\(--sn-conn-dimmed, var\(--sn-sys-on-surface-dim\)\);/);
    assert.match(source, /\.sn-conn-path\[data-active-conn\]/);
    assert.match(source, /stroke: var\(--sn-sys-accent\);/);
    assert.match(source, /\.sn-conn-marker\[data-dimmed\]/);
    assert.match(source, /color: var\(--sn-conn-dimmed, var\(--sn-sys-on-surface-dim\)\);/);
    assert.match(source, /\.sn-conn-marker\[data-active-conn\]/);
    assert.match(
      source,
      /color: color-mix\(in oklab, var\(--sn-sys-accent\) 100%, var\(--sn-sys-surface\)\);/,
    );
    let markerRule = source.match(/\.sn-conn-marker \{([\s\S]*?)\n  \}/)?.[1] || '';
    let dimmedMarkerRule = source.match(/\.sn-conn-marker\[data-dimmed\] \{([\s\S]*?)\n  \}/)?.[1] || '';
    assert.match(markerRule, /opacity: 1;/);
    assert.match(dimmedMarkerRule, /opacity: 1;/);
    assert.ok(
      source.indexOf('.sn-conn-marker[data-active-conn]')
        > source.indexOf('.sn-conn-marker[data-dimmed]'),
    );
  });

  it('keeps Canvas marker collisions stable during viewport-only redraws', async () => {
    let source = await readFile(
      new URL('../canvas/CanvasConnectionRenderer.js', import.meta.url),
      'utf8'
    );
    let viewportRefresh = source.match(
      /refreshViewportTransform\(\) \{([\s\S]*?)\n  \}/,
    )?.[1] || '';
    let collisionRefresh = source.match(
      /#refreshMarkerCollisions\(coordsById, connectionPoints\) \{([\s\S]*?)\n  \}/,
    )?.[1] || '';

    assert.match(viewportRefresh, /this\.redraw\(\);/);
    assert.doesNotMatch(viewportRefresh, /markerCollisionsDirty/);
    assert.match(collisionRefresh, /if \(!this\.#markerCollisionsDirty\) return;/);
    assert.match(collisionRefresh, /if \(priority === 0\) continue;/);
    assert.match(source, /this\.#markerCollisionsDirty = true;\n    return coords;/);
  });

  it('does not permanently promote the full graph content to a compositor layer', async () => {
    let source = await readFile(
      new URL('../canvas/NodeCanvas/NodeCanvas.css.js', import.meta.url),
      'utf8'
    );
    let contentRule = source.match(/& \.content \{([\s\S]*?)\n    \}/)?.[1] || '';

    assert.ok(contentRule);
    assert.doesNotMatch(contentRule, /will-change\s*:/);
  });

  it('syncs active and dimmed state to connection paths, markers, and endpoint dots', () => {
    let connections = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    let pseudoSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    connections.innerHTML = `
      <path data-conn-id="active-conn"></path>
      <g data-conn-marker="active-conn"></g>
      <path data-conn-id="dimmed-conn"></path>
      <g data-conn-marker="dimmed-conn"></g>
    `;
    pseudoSvg.innerHTML = `
      <circle data-conn-dot="active-conn-start"></circle>
      <circle data-conn-dot="active-conn-end"></circle>
      <circle data-conn-dot="dimmed-conn-start"></circle>
      <circle data-conn-dot="dimmed-conn-end"></circle>
    `;

    let selectionEvent;
    let canvas = {
      ref: {
        connections,
        pseudoSvg,
        quickToolbar: null,
        inspector: null,
      },
      dispatchEvent(event) {
        selectionEvent = event;
      },
    };
    let connectionData = [
      { id: 'active-conn', from: 'selected-node', to: 'neighbor-node' },
      { id: 'dimmed-conn', from: 'other-node', to: 'unrelated-node' },
    ];
    let editor = {
      getConnections() {
        return connectionData;
      },
    };
    let sync = new SelectionSync({
      canvas,
      getEditor: () => editor,
      nodeViews: new Map(),
      getConnRenderer: () => ({ data: new Map(connectionData.map((conn) => [conn.id, conn])) }),
    });

    sync.sync(new Set(['selected-node']), new Set());

    for (const selector of [
      '[data-conn-id="active-conn"]',
      '[data-conn-marker="active-conn"]',
      '[data-conn-dot="active-conn-start"]',
      '[data-conn-dot="active-conn-end"]',
    ]) {
      assert.equal(
        (connections.querySelector(selector) || pseudoSvg.querySelector(selector)).hasAttribute('data-active-conn'),
        true
      );
    }

    for (const selector of [
      '[data-conn-id="dimmed-conn"]',
      '[data-conn-marker="dimmed-conn"]',
      '[data-conn-dot="dimmed-conn-start"]',
      '[data-conn-dot="dimmed-conn-end"]',
    ]) {
      assert.equal(
        (connections.querySelector(selector) || pseudoSvg.querySelector(selector)).hasAttribute('data-dimmed'),
        true
      );
    }

    assert.equal(selectionEvent.type, 'selection-changed');
    assert.deepEqual(selectionEvent.detail.nodes, ['selected-node']);
  });
});

describe('Group/Subgraph Model Helpers', () => {
  it('keeps graph model JSON schema aligned with root group metadata', async () => {
    let schema = JSON.parse(await readFile(new URL('../schemas/graph-model-v1.json', import.meta.url), 'utf8'));

    assert.equal(schema.properties.groups.type, 'array');
    assert.equal(schema.properties.groups.items.$ref, '#/$defs/group');
  });

  it('performs grouping and ungrouping on node graph data structures', () => {
    let store = createCanvasGraphStore({
      nodes: [
        { id: 'node-1', kind: 'action' },
        { id: 'node-2', kind: 'action' },
      ],
      edges: [],
      rootNodes: ['node-1', 'node-2'],
      groups: {},
    });

    let mockEditor = {
      nodes: new Map([
        ['node-1', { id: 'node-1', kind: 'action' }],
        ['node-2', { id: 'node-2', kind: 'action' }],
      ]),
      getNodes() { return Array.from(this.nodes.values()); },
      addNode(node) { this.nodes.set(node.id, node); },
      removeNode(nodeId) { this.nodes.delete(nodeId); },
      getNode(id) { return this.nodes.get(id); },
      emit() {},
    };

    // Group nodes
    groupNodes(mockEditor, ['node-1', 'node-2'], 'group-abc', 'My Group');

    let groupNode = mockEditor.getNode('group-abc');
    assert.ok(groupNode);
    assert.equal(groupNode.isGroup, true);
    assert.equal(groupNode.label, 'My Group');
    assert.deepEqual(groupNode.children, ['node-1', 'node-2']);

    assert.equal(mockEditor.getNode('node-1').parentId, 'group-abc');
    assert.equal(mockEditor.getNode('node-2').parentId, 'group-abc');

    // Remove node-1 from group
    removeNodesFromGroup(mockEditor, ['node-1']);
    assert.equal(mockEditor.getNode('node-1').parentId, null);
    assert.deepEqual(mockEditor.getNode('group-abc').children, ['node-2']);

    // Add node-1 back to group
    addNodesToGroup(mockEditor, 'group-abc', ['node-1']);
    assert.deepEqual(mockEditor.getNode('group-abc').children, ['node-2', 'node-1']);

    // Ungroup nodes
    ungroupNodes(mockEditor, 'group-abc');
    assert.equal(mockEditor.getNode('group-abc'), undefined);
    assert.equal(mockEditor.getNode('node-1').parentId, null);
    assert.equal(mockEditor.getNode('node-2').parentId, null);
  });
});

describe('ViewportActions Clipboard & History & Alignment Intents', () => {
  it('uses viewport coordinates for fixed context menus and world coordinates for graph actions', () => {
    let emitted = [];
    let editor = {
      getNode() {},
      removeNode() {},
      removeConnection() {},
      emit(type, detail) {
        emitted.push({ type, detail });
      },
    };
    let selector = new Selector();
    let canvas = document.createElement('div');
    let container = document.createElement('div');
    container.getBoundingClientRect = () => ({ left: 800, top: 100, width: 480, height: 700 });
    let actions = new ViewportActions({ editor, selector, nodeViews: new Map(), canvas });
    let shown = null;
    let contextMenu = {
      show(x, y, items, trigger) {
        shown = { x, y, items, trigger };
      },
    };
    let prevented = false;
    actions.showContextMenu({
      clientX: 900,
      clientY: 280,
      target: container,
      preventDefault() {
        prevented = true;
      },
    }, contextMenu, container, { panX: 40, panY: 20, zoom: 2 });

    assert.equal(prevented, true);
    assert.equal(shown.x, 900);
    assert.equal(shown.y, 280);
    assert.equal(shown.trigger, container);
    shown.items[0].action();
    assert.deepEqual(emitted, [{ type: 'contextadd', detail: { x: 30, y: 80 } }]);
  });

  it('aligns selected nodes only when enough nodes are selected', () => {
    let emitted = [];
    let mockEditor = {
      getNode(id) { return { id, label: 'Node ' + id }; },
      removeNode() {},
      removeConnection() {},
      emit(type, detail) {
        emitted.push({ type, detail });
      },
    };
    let selector = new Selector();
    let actions = new ViewportActions({
      editor: mockEditor,
      selector,
      nodeViews: new Map([
        ['a', { _position: { x: 10, y: 20 }, offsetWidth: 100, offsetHeight: 40 }],
        ['b', { _position: { x: 50, y: 60 }, offsetWidth: 100, offsetHeight: 40 }],
      ]),
      canvas: document.createElement('div'),
    });

    selector.selectNode('a');
    actions.alignSelectedHorizontal();
    assert.deepEqual(emitted, []);

    selector.selectNode('b', true);
    actions.alignSelectedHorizontal();
    assert.deepEqual(emitted.map((entry) => entry.detail), [
      { nodeId: 'a', x: 10, y: 40 },
      { nodeId: 'b', x: 50, y: 40 },
    ]);
  });

  it('dispatches undo, redo, clipboard and alignment CustomEvents', () => {
    let mockCanvas = document.createElement('div');
    document.body.append(mockCanvas);

    let eventsDispatched = [];
    let recordEvent = (e) => {
      eventsDispatched.push({ type: e.type, detail: e.detail });
    };

    mockCanvas.addEventListener('sn-clipboard-copy', recordEvent);
    mockCanvas.addEventListener('sn-clipboard-cut', recordEvent);
    mockCanvas.addEventListener('sn-clipboard-paste', recordEvent);
    mockCanvas.addEventListener('sn-undo', recordEvent);
    mockCanvas.addEventListener('sn-redo', recordEvent);

    let mockEditor = {
      getNode(id) { return { id, label: 'Node ' + id }; },
      removeNode() {},
      removeConnection() {},
      emit() {},
    };
    let selector = new Selector();
    selector.selectNode('a');

    let actions = new ViewportActions({
      editor: mockEditor,
      selector,
      nodeViews: new Map([
        ['a', { _position: { x: 10, y: 20 }, offsetWidth: 100, offsetHeight: 40 }]
      ]),
      canvas: mockCanvas,
    });

    let triggerKey = (key, ctrl) => {
      let e = new window.Event('keydown', { bubbles: true, cancelable: true });
      Object.defineProperties(e, {
        key: { value: key },
        ctrlKey: { value: !!ctrl },
        metaKey: { value: !!ctrl },
      });
      actions.handleKeydown(e);
    };

    // Copy keyboard shortcut
    triggerKey('c', true);
    // Cut keyboard shortcut
    triggerKey('x', true);
    // Paste keyboard shortcut
    triggerKey('v', true);
    // Undo
    triggerKey('z', true);
    // Redo
    triggerKey('y', true);

    assert.equal(eventsDispatched.length, 5);
    assert.equal(eventsDispatched[0].type, 'sn-clipboard-copy');
    assert.deepEqual(eventsDispatched[0].detail.nodeIds, ['a']);
    assert.equal(eventsDispatched[1].type, 'sn-clipboard-cut');
    assert.equal(eventsDispatched[2].type, 'sn-clipboard-paste');
    assert.equal(eventsDispatched[3].type, 'sn-undo');
    assert.equal(eventsDispatched[4].type, 'sn-redo');

    mockCanvas.remove();
  });
});
