/**
 * @fileoverview BSP (Binary Space Partitioning) Layout Tree
 * Implements explicit panel splitting and joining mechanics.
 */

/**
 * @typedef {'horizontal' | 'vertical'} SplitDirection
 */

/**
 * @typedef {'auto' | 'manual' | 'never'} LayoutCollapsePolicy
 */

/**
 * @typedef {'collapse' | 'scroll-inline' | 'scroll-block' | 'scroll'} LayoutOverflowPolicy
 */

/**
 * @typedef {'preserve' | 'stack' | 'scroll-inline' | 'drawer' | 'swipe'} LayoutResponsiveMode
 */

/**
 * @typedef {'auto' | 'primary' | 'start' | 'end'} LayoutMobileDock
 */

/**
 * @typedef {'edge' | 'rail' | 'none'} LayoutSwipeControl
 */

/**
 * @typedef {Object} LayoutBehavior
 * @property {number} [importance] Higher values resist auto-collapse.
 * @property {number} [minInlineSize] Minimum inline size before auto-collapse.
 * @property {number} [minBlockSize] Minimum block size before auto-collapse.
 * @property {LayoutCollapsePolicy} [collapse] Auto-collapse policy.
 * @property {LayoutOverflowPolicy} [overflow] Overflow fallback when collapse is disabled.
 * @property {LayoutResponsiveMode} [responsiveMode] Root responsive behavior.
 * @property {number} [responsiveBreakpoint] Inline size where responsiveMode activates.
 * @property {LayoutMobileDock} [mobileDock] Mobile drawer placement preference.
 * @property {LayoutSwipeControl} [swipeControl] Mobile swipe source.
 * @property {boolean} [drawerHoverOpen] Whether mouse hover over a drawer rail opens the drawer.
 */

/**
 * @typedef {Object} PanelNode
 * @property {string} id - Unique node ID
 * @property {'panel'} type - Node type
 * @property {string} panelType - Panel content type (e.g., 'viewport', 'timeline')
 * @property {boolean} [collapsed] - Whether panel is collapsed
 * @property {boolean} [autoCollapsed] - Whether panel was collapsed by responsive layout behavior.
 * @property {boolean} [manualExpanded] - Whether an auto-collapsible panel was manually expanded.
 * @property {LayoutBehavior} [behavior] Responsive behavior at this insertion point.
 * @property {Object} [panelState] - Panel-specific state
 */

/**
 * @typedef {Object} SplitNode
 * @property {string} id - Unique node ID
 * @property {'split'} type - Node type
 * @property {SplitDirection} direction - Split direction
 * @property {number} ratio - Split ratio (0-1), size of first child
 * @property {boolean} [lockRatio]
 * @property {LayoutBehavior} [behavior] Responsive behavior for this branch.
 * @property {LayoutNode} first - First child node
 * @property {LayoutNode} second - Second child node
 */

/**
 * @typedef {PanelNode | SplitNode} LayoutNode
 */

export const DEFAULT_LAYOUT_BEHAVIOR = Object.freeze({
  importance: 50,
  minInlineSize: 220,
  minBlockSize: 160,
  collapse: 'auto',
  overflow: 'collapse',
  responsiveMode: 'preserve',
  responsiveBreakpoint: 720,
  mobileDock: 'auto',
  swipeControl: 'edge',
  drawerHoverOpen: false,
})

export const COLLAPSED_PANEL_INLINE_SIZE = 32
export const COLLAPSED_PANEL_BLOCK_SIZE = 28
export const RESTORE_FIT_FACTOR = 1.18
export const STABLE_FIT_FACTOR = 1.02
export const RUNTIME_SPLIT_RATIO = Symbol.for('symbiote-ui.layout.runtimeSplitRatio')

const PRIORITY_COMPRESSION_START_FACTOR = 1.25
const RATIO_EPSILON = 0.0005

const COLLAPSE_POLICIES = new Set(['auto', 'manual', 'never'])
const OVERFLOW_POLICIES = new Set(['collapse', 'scroll-inline', 'scroll-block', 'scroll'])
const RESPONSIVE_MODES = new Set(['preserve', 'stack', 'scroll-inline', 'drawer', 'swipe'])
const MOBILE_DOCKS = new Set(['auto', 'primary', 'start', 'end'])
const SWIPE_CONTROLS = new Set(['edge', 'rail', 'none'])

let idCounter = 0

function finiteNumber(value, fallback, min = -Infinity, max = Infinity) {
  let number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

function optionalBehavior(behavior) {
  return behavior && typeof behavior === 'object' && Object.keys(behavior).length
    ? normalizeLayoutBehavior(behavior, {})
    : undefined
}

export function normalizeLayoutBehavior(behavior = {}, fallback = DEFAULT_LAYOUT_BEHAVIOR) {
  let base = fallback && typeof fallback === 'object' ? fallback : DEFAULT_LAYOUT_BEHAVIOR
  let input = behavior && typeof behavior === 'object' ? behavior : {}
  let collapse = COLLAPSE_POLICIES.has(input.collapse)
    ? input.collapse
    : base.collapse || DEFAULT_LAYOUT_BEHAVIOR.collapse
  let overflow = OVERFLOW_POLICIES.has(input.overflow)
    ? input.overflow
    : base.overflow || DEFAULT_LAYOUT_BEHAVIOR.overflow
  let responsiveMode = RESPONSIVE_MODES.has(input.responsiveMode)
    ? input.responsiveMode
    : base.responsiveMode || DEFAULT_LAYOUT_BEHAVIOR.responsiveMode
  let mobileDock = MOBILE_DOCKS.has(input.mobileDock)
    ? input.mobileDock
    : base.mobileDock || DEFAULT_LAYOUT_BEHAVIOR.mobileDock
  let swipeControl = SWIPE_CONTROLS.has(input.swipeControl)
    ? input.swipeControl
    : base.swipeControl || DEFAULT_LAYOUT_BEHAVIOR.swipeControl
  let drawerHoverOpen = 'drawerHoverOpen' in input
    ? Boolean(input.drawerHoverOpen)
    : Boolean(base.drawerHoverOpen ?? DEFAULT_LAYOUT_BEHAVIOR.drawerHoverOpen)

  return {
    importance: finiteNumber(input.importance, base.importance ?? DEFAULT_LAYOUT_BEHAVIOR.importance, 0, 100),
    minInlineSize: finiteNumber(input.minInlineSize, base.minInlineSize ?? DEFAULT_LAYOUT_BEHAVIOR.minInlineSize, 0),
    minBlockSize: finiteNumber(input.minBlockSize, base.minBlockSize ?? DEFAULT_LAYOUT_BEHAVIOR.minBlockSize, 0),
    collapse,
    overflow,
    responsiveMode,
    responsiveBreakpoint: finiteNumber(
      input.responsiveBreakpoint,
      base.responsiveBreakpoint ?? DEFAULT_LAYOUT_BEHAVIOR.responsiveBreakpoint,
      0
    ),
    mobileDock,
    swipeControl,
    drawerHoverOpen,
  }
}

export function hasLayoutBehaviorMetadata(behavior) {
  return Boolean(
    behavior &&
    Number.isFinite(behavior.importance) &&
    Number.isFinite(behavior.minInlineSize) &&
    Number.isFinite(behavior.minBlockSize) &&
    COLLAPSE_POLICIES.has(behavior.collapse) &&
    OVERFLOW_POLICIES.has(behavior.overflow) &&
    RESPONSIVE_MODES.has(behavior.responsiveMode) &&
    MOBILE_DOCKS.has(behavior.mobileDock) &&
    SWIPE_CONTROLS.has(behavior.swipeControl) &&
    typeof behavior.drawerHoverOpen === 'boolean'
  )
}

export function layoutHasBehaviorMetadata(root) {
  if (!root || !hasLayoutBehaviorMetadata(root.behavior)) return false
  if (root.type !== 'split') return true
  return layoutHasBehaviorMetadata(root.first) && layoutHasBehaviorMetadata(root.second)
}

/**
 * Generate unique node ID
 * @returns {string}
 */
export function generateId() {
  return `node_${++idCounter}_${Date.now().toString(36)}`
}

/**
 * Create a panel node
 * @param {string} panelType - Panel content type
 * @param {Object} [panelState] - Initial panel state
 * @returns {PanelNode}
 */
export function createPanel(panelType, panelState = {}, behavior = undefined) {
  let panel = {
    id: generateId(),
    type: 'panel',
    panelType,
    panelState,
    collapsed: false,
  }
  let normalizedBehavior = optionalBehavior(behavior || panelState?.behavior)
  if (normalizedBehavior) panel.behavior = normalizedBehavior
  return panel
}

/**
 * Create a split node
 * @param {SplitDirection} direction - Split direction
 * @param {LayoutNode} first - First child
 * @param {LayoutNode} second - Second child
 * @param {number} [ratio=0.5] - Split ratio
 * @param {LayoutBehavior} [behavior]
 * @param {{lockRatio?: boolean}} [options]
 * @returns {SplitNode}
 */
export function createSplit(
  direction,
  first,
  second,
  ratio = 0.5,
  behavior = undefined,
  options = {}
) {
  let split = {
    id: generateId(),
    type: 'split',
    direction,
    ratio,
    first,
    second,
  }
  if (options.lockRatio === true) split.lockRatio = true
  let normalizedBehavior = optionalBehavior(behavior)
  if (normalizedBehavior) split.behavior = normalizedBehavior
  return split
}

/**
 * Find a node by ID in the tree
 * @param {LayoutNode} root - Root node
 * @param {string} id - Node ID to find
 * @returns {LayoutNode | null}
 */
export function findNode(root, id) {
  if (root.id === id) return root
  if (root.type === 'split') {
    return findNode(root.first, id) || findNode(root.second, id)
  }
  return null
}

/**
 * Find parent of a node
 * @param {LayoutNode} root - Root node
 * @param {string} id - Child node ID
 * @returns {{ parent: SplitNode, which: 'first' | 'second' } | null}
 */
export function findParent(root, id) {
  if (root.type !== 'split') return null

  if (root.first.id === id) return { parent: root, which: 'first' }
  if (root.second.id === id) return { parent: root, which: 'second' }

  return findParent(root.first, id) || findParent(root.second, id)
}

/**
 * Split a panel into two
 * @param {LayoutNode} root - Root node
 * @param {string} panelId - Panel ID to split
 * @param {SplitDirection} direction - Split direction
 * @param {number} [ratio=0.5] - Split ratio
 * @param {string} [newPanelType] - Type for new panel (defaults to same as original)
 * @returns {LayoutNode} - New root node
 */
export function splitPanel(root, panelId, direction, ratio = 0.5, newPanelType) {
  let node = findNode(root, panelId)
  if (!node || node.type !== 'panel') {
    return root
  }

  let newPanel = createPanel(newPanelType || node.panelType)
  let splitNode = createSplit(direction, node, newPanel, ratio)


  if (root.id === panelId) {
    return splitNode
  }


  let parentInfo = findParent(root, panelId)
  if (parentInfo) {
    parentInfo.parent[parentInfo.which] = splitNode
  }

  return root
}

/**
 * Duplicate a panel by splitting its current area and cloning panel metadata.
 * @param {LayoutNode} root - Root node
 * @param {string} panelId - Panel ID to duplicate
 * @param {SplitDirection} [direction='horizontal'] - Split direction
 * @param {number} [ratio=0.5] - Split ratio
 * @returns {LayoutNode} - New root node
 */
export function duplicatePanel(root, panelId, direction = 'horizontal', ratio = 0.5) {
  let node = findNode(root, panelId)
  if (!node || node.type !== 'panel') {
    return root
  }

  let newPanel = createPanel(
    node.panelType,
    clone(node.panelState || {}),
    node.behavior ? clone(node.behavior) : undefined
  )
  let splitNode = createSplit(direction, node, newPanel, ratio)

  if (root.id === panelId) {
    return splitNode
  }

  let parentInfo = findParent(root, panelId)
  if (parentInfo) {
    parentInfo.parent[parentInfo.which] = splitNode
  }

  return root
}

/**
 * Join two panels (remove one panel and its parent split)
 * @param {LayoutNode} root - Root node
 * @param {string} panelToRemove - Panel ID to remove
 * @returns {LayoutNode} - New root node
 */
export function joinPanels(root, panelToRemove) {
  let parentInfo = findParent(root, panelToRemove)
  if (!parentInfo) {
    return root
  }

  let { parent, which } = parentInfo
  let survivor = which === 'first' ? parent.second : parent.first
  restorePromotedBranch(survivor, { forceRoot: true })


  let grandparentInfo = findParent(root, parent.id)
  if (!grandparentInfo) {
    return survivor
  }


  grandparentInfo.parent[grandparentInfo.which] = survivor
  return root
}

function restorePromotedBranch(node, options = {}) {
  if (!node) return
  if (node.type === 'panel') {
    if (options.forceRoot || node.autoCollapsed) {
      node.collapsed = false
      node.autoCollapsed = false
    }
    return
  }
  if (node.type === 'split') {
    restorePromotedBranch(node.first)
    restorePromotedBranch(node.second)
  }
}

/**
 * Update split ratio
 * @param {LayoutNode} root - Root node
 * @param {string} splitId - Split node ID
 * @param {number} ratio - New ratio (0-1)
 * @returns {LayoutNode} - Same root (mutated)
 */
export function resizeSplit(root, splitId, ratio) {
  let node = findNode(root, splitId)
  if (!node || node.type !== 'split') {
    return root
  }

  node.ratio = Math.max(0.1, Math.min(0.9, ratio))
  return root
}

/**
 * Serialize layout to JSON string
 * @param {LayoutNode} root - Root node
 * @returns {string}
 */
export function serialize(root) {
  return JSON.stringify(root)
}

/**
 * Deserialize layout from JSON string
 * @param {string} json - JSON string
 * @returns {LayoutNode}
 */
export function deserialize(json) {
  return JSON.parse(json)
}

/**
 * Clone a layout tree (deep copy)
 * @param {LayoutNode} root - Root node
 * @returns {LayoutNode}
 */
export function clone(root) {
  return deserialize(serialize(root))
}

/**
 * Get all panel nodes in tree
 * @param {LayoutNode} root - Root node
 * @returns {PanelNode[]}
 */
export function getAllPanels(root) {
  return collectPanels(root)
}

export function isPanelNode(node) {
  return !!node && node.type === 'panel'
}

export function isSplitNode(node) {
  return !!node && node.type === 'split'
}

export function findPanel(root, predicate) {
  let panels = collectPanels(root)
  return panels.find((panel) => predicate(panel)) || null
}

export function findPanelByType(root, panelType, options = {}) {
  let { uiInvoked } = options
  return findPanel(root, (panel) => (
    panel.panelType === panelType &&
    (uiInvoked === undefined || Boolean(panel.panelState?.uiInvoked) === Boolean(uiInvoked))
  ))
}

export function openPanel(root, panelType, options = {}) {
  let {
    behavior,
    direction = 'horizontal',
    panelState = {},
    ratio = 0.68,
    reuseExisting = true,
    source = '',
    uiInvoked = false,
  } = options

  if (!panelType) {
    return { root, panel: null, created: false }
  }

  if (reuseExisting) {
    let existing = findPanelByType(root, panelType, uiInvoked ? { uiInvoked: true } : {})
    if (existing) {
      if (uiInvoked) {
        existing.collapsed = false
        existing.autoCollapsed = false
        existing.panelState = {
          ...(existing.panelState || {}),
          closed: false,
          ...(source ? { source } : {}),
        }
      }
      return { root, panel: existing, created: false }
    }
  }

  let state = {
    ...panelState,
    ...(uiInvoked ? { uiInvoked: true, closed: false, source } : {}),
  }
  let panel = createPanel(panelType, state, behavior)
  let nextRoot = root
    ? createSplit(direction, root, panel, ratio)
    : panel

  return { root: nextRoot, panel, created: true }
}

export function closeUiPanel(root, panelType, options = {}) {
  void options
  let panel = findPanelByType(root, panelType, { uiInvoked: true })
  if (!panel) {
    return { root, panel: null, closed: false, removed: false }
  }
  panel.collapsed = true
  panel.autoCollapsed = false
  panel.panelState = {
    ...(panel.panelState || {}),
    closed: true,
  }
  return { root, panel, closed: true, removed: false, restored: false }
}

export function removeUiPanel(root, panelType, options = {}) {
  let { fallbackRoot = null } = options
  let panel = findPanelByType(root, panelType, { uiInvoked: true })
  if (!panel) {
    return { root, panel: null, closed: false, removed: false }
  }
  let uiPanelCount = collectPanels(root)
    .filter((item) => item.panelState?.uiInvoked)
    .length
  if (fallbackRoot && uiPanelCount <= 1) {
    return {
      root: clone(fallbackRoot),
      panel,
      closed: false,
      removed: true,
      restored: true,
    }
  }
  if (root?.id === panel.id) {
    return {
      root: fallbackRoot ? clone(fallbackRoot) : null,
      panel,
      closed: false,
      removed: true,
      restored: Boolean(fallbackRoot),
    }
  }
  return { root: joinPanels(root, panel.id), panel, closed: false, removed: true, restored: false }
}

/**
 * Collect panel nodes from a layout tree.
 * @param {LayoutNode | Object | null} root
 * @param {Object} [options]
 * @param {boolean} [options.includeGlobal=true] Include panels marked as global.
 * @returns {PanelNode[]}
 */
export function collectPanels(root, options = {}) {
  let { includeGlobal = true } = options
  let panels = []

  function walk(node) {
    if (!node) return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (isPanelNode(node)) {
      if (includeGlobal || !node.global) panels.push(node)
      return
    }
    if (node.first) walk(node.first)
    if (node.second) walk(node.second)
  }

  walk(root)
  if (includeGlobal && root && typeof root === 'object' && !Array.isArray(root)) {
    walk(root.global)
    walk(root.globals)
    walk(root.globalPanels)
  }
  return panels
}

/**
 * Collect panel type ids from a layout tree.
 * @param {LayoutNode | Object | null} root
 * @param {Object} [options]
 * @param {boolean} [options.includeGlobal=true] Include panels marked as global.
 * @returns {string[]}
 */
export function collectPanelTypes(root, options = {}) {
  return collectPanels(root, options)
    .map((panel) => panel.panelType)
    .filter(Boolean)
}

/**
 * Return the first non-global panel type from a layout tree.
 * @param {LayoutNode | Object | null} root
 * @returns {string | null}
 */
export function getPrimaryPanelType(root) {
  return collectPanels(root, { includeGlobal: false })[0]?.panelType || null
}

/**
 * Check that every requested panel type exists in a layout tree.
 * @param {LayoutNode | Object | null} root
 * @param {Iterable<string>} requiredPanelTypes
 * @param {Object} [options]
 * @returns {boolean}
 */
export function hasEveryPanelType(root, requiredPanelTypes, options = {}) {
  let available = new Set(collectPanelTypes(root, options))
  for (let panelType of requiredPanelTypes || []) {
    if (!available.has(panelType)) return false
  }
  return true
}

/**
 * Check whether any of the requested panel types exists in a layout tree.
 * @param {LayoutNode | Object | null} root
 * @param {Iterable<string>} panelTypes
 * @param {Object} [options]
 * @returns {boolean}
 */
export function hasAnyPanelType(root, panelTypes, options = {}) {
  let available = new Set(collectPanelTypes(root, options))
  for (let panelType of panelTypes || []) {
    if (available.has(panelType)) return true
  }
  return false
}

/**
 * Build sidebar submenu descriptors from panels in a layout tree.
 * @param {LayoutNode | Object | null} root
 * @param {object} panelDefinitions
 * @param {Object} [options]
 * @param {boolean} [options.includeGlobal=false] Include panels marked as global.
 * @param {number} [options.minPanels=2] Minimum count required before returning items.
 * @returns {{title: string, icon: string, panelId: string, isMaster: boolean, panelType: string}[]}
 */
export function createSidebarSubPanels(root, panelDefinitions = {}, options = {}) {
  let { includeGlobal = false, minPanels = 2 } = options
  let panels = collectPanels(root, { includeGlobal })
  if (panels.length < minPanels) return []
  return panels.map((panel, index) => {
    let panelType = panel.panelType || 'panel'
    let config = panelDefinitions[panelType] || {}
    return {
      title: config.title || panelType,
      icon: config.icon || 'dashboard',
      panelId: panel.id || `${panelType}-${index}`,
      isMaster: index === 0,
      panelType,
    }
  })
}

/**
 * Update a node's properties by ID
 * @param {LayoutNode} root - Root node
 * @param {string} nodeId - Node ID to update
 * @param {Object} updates - Properties to update
 * @returns {boolean} - True if node was found and updated
 */
export function updateNode(root, nodeId, updates) {
  let node = findNode(root, nodeId)
  if (!node) return false
  Object.assign(node, updates)
  return true
}

/**
 * Set normalized layout behavior on a node.
 * @param {LayoutNode} root
 * @param {string} nodeId
 * @param {LayoutBehavior} behavior
 * @param {LayoutBehavior} [fallback]
 * @returns {boolean}
 */
export function setNodeBehavior(root, nodeId, behavior, fallback = DEFAULT_LAYOUT_BEHAVIOR) {
  let node = findNode(root, nodeId)
  if (!node) return false
  node.behavior = normalizeLayoutBehavior(behavior, fallback)
  return true
}

/**
 * Resolve node behavior against a fallback.
 * @param {LayoutNode | null} node
 * @param {LayoutBehavior} [fallback]
 * @returns {LayoutBehavior}
 */
export function getNodeBehavior(node, fallback = DEFAULT_LAYOUT_BEHAVIOR) {
  let panelStateBehavior = node?.panelState?.behavior
  let mergedFallback = normalizeLayoutBehavior(panelStateBehavior || {}, fallback)
  return normalizeLayoutBehavior(node?.behavior || {}, mergedFallback)
}

/**
 * Return normalized behavior importance for sorting collapse candidates.
 * @param {LayoutNode | null} node
 * @param {LayoutBehavior} [fallback]
 * @returns {number}
 */
export function getBehaviorImportance(node, fallback = DEFAULT_LAYOUT_BEHAVIOR) {
  return getNodeBehavior(node, fallback).importance
}

function readInlineSize(size, fallback = 0) {
  return finiteNumber(size?.inlineSize ?? size?.width, fallback, 0)
}

function readBlockSize(size, fallback = 0) {
  return finiteNumber(size?.blockSize ?? size?.height, fallback, 0)
}

function clearRuntimeSplitRatios(root) {
  let changed = false
  function walk(node) {
    if (!node) return
    if (isSplitNode(node)) {
      if (node[RUNTIME_SPLIT_RATIO] !== undefined) {
        delete node[RUNTIME_SPLIT_RATIO]
        changed = true
      }
      walk(node.first)
      walk(node.second)
    }
  }
  walk(root)
  return changed
}

export function clearPriorityCompression(root) {
  return clearRuntimeSplitRatios(root)
}

/**
 * Apply runtime-only split ratios that let lower-importance panels absorb
 * responsive compression before auto-collapse is evaluated.
 * @param {LayoutNode | null} root
 * @param {Object} viewport
 * @param {number} viewport.inlineSize
 * @param {LayoutBehavior} [viewport.fallbackBehavior]
 * @param {Object} [options]
 * @param {LayoutBehavior} [options.fallbackBehavior]
 * @param {(node: PanelNode, branchBehavior: LayoutBehavior) => LayoutBehavior} [options.resolvePanelBehavior]
 * @returns {boolean} Whether any runtime ratio changed.
 */
export function applyPriorityCompression(root, viewport = {}, options = {}) {
  if (!root || !isSplitNode(root)) return false
  let {
    fallbackBehavior = viewport.fallbackBehavior || DEFAULT_LAYOUT_BEHAVIOR,
    resolvePanelBehavior = (node, branchBehavior) => getNodeBehavior(node, branchBehavior),
  } = options
  let inlineSize = readInlineSize(viewport)
  if (inlineSize <= 0) return clearRuntimeSplitRatios(root)

  let rootBehavior = getNodeBehavior(root, fallbackBehavior)
  let compressionEnd = finiteNumber(rootBehavior.minInlineSize, 0, 1)
  let compressionStart = compressionEnd * PRIORITY_COMPRESSION_START_FACTOR
  if (compressionEnd <= 0 || compressionStart <= compressionEnd || inlineSize >= compressionStart) {
    return clearRuntimeSplitRatios(root)
  }

  let progress = inlineSize <= compressionEnd
    ? 1
    : (compressionStart - inlineSize) / (compressionStart - compressionEnd)
  progress = Math.max(0, Math.min(1, progress))
  if (progress <= 0) return clearRuntimeSplitRatios(root)

  let panels = []
  let horizontalOnly = true
  function collect(node, share, fallback) {
    if (!node || node.collapsed) return
    let branchBehavior = getNodeBehavior(node, fallback)
    if (isPanelNode(node)) {
      let behavior = resolvePanelBehavior(node, branchBehavior)
      panels.push({
        node,
        behavior,
        baseShare: share,
        targetShare: share,
        order: panels.length,
      })
      return
    }
    if (node.direction !== 'horizontal') {
      horizontalOnly = false
      return
    }
    let ratio = finiteNumber(node.ratio, 0.5, 0.1, 0.9)
    collect(node.first, share * ratio, branchBehavior)
    collect(node.second, share * (1 - ratio), branchBehavior)
  }
  collect(root, 1, normalizeLayoutBehavior(fallbackBehavior))

  if (!horizontalOnly || panels.length < 2) return clearRuntimeSplitRatios(root)

  let equalShare = 1 / panels.length
  let donors = panels
    .filter((panel) => panel.targetShare > equalShare + RATIO_EPSILON)
    .sort((a, b) => (
      a.behavior.importance - b.behavior.importance ||
      b.targetShare - a.targetShare ||
      a.order - b.order
    ))
  let receivers = panels
    .filter((panel) => panel.targetShare < equalShare - RATIO_EPSILON)
    .sort((a, b) => (
      b.behavior.importance - a.behavior.importance ||
      a.targetShare - b.targetShare ||
      a.order - b.order
    ))

  for (let donor of donors) {
    let available = donor.targetShare - equalShare
    if (available <= RATIO_EPSILON) continue
    for (let receiver of receivers) {
      if (receiver.behavior.importance < donor.behavior.importance) continue
      let need = equalShare - receiver.targetShare
      if (need <= RATIO_EPSILON) continue
      let moved = Math.min(available, need)
      donor.targetShare -= moved
      receiver.targetShare += moved
      available -= moved
      if (available <= RATIO_EPSILON) break
    }
  }

  let shareById = new Map()
  let hasTargetChange = false
  for (let panel of panels) {
    let share = panel.baseShare + (panel.targetShare - panel.baseShare) * progress
    shareById.set(panel.node.id, share)
    if (Math.abs(share - panel.baseShare) > RATIO_EPSILON) {
      hasTargetChange = true
    }
  }
  if (!hasTargetChange) return clearRuntimeSplitRatios(root)

  function subtreeShare(node) {
    if (!node || node.collapsed) return 0
    if (isPanelNode(node)) return shareById.get(node.id) || 0
    return subtreeShare(node.first) + subtreeShare(node.second)
  }

  let changed = false
  function apply(node) {
    if (!isSplitNode(node)) return
    if (node.lockRatio === true) {
      if (node[RUNTIME_SPLIT_RATIO] !== undefined) {
        delete node[RUNTIME_SPLIT_RATIO]
        changed = true
      }
      apply(node.first)
      apply(node.second)
      return
    }
    let firstShare = subtreeShare(node.first)
    let secondShare = subtreeShare(node.second)
    let totalShare = firstShare + secondShare
    let nextRatio = totalShare > 0
      ? finiteNumber(firstShare / totalShare, node.ratio || 0.5, 0.1, 0.9)
      : undefined
    if (nextRatio === undefined || Math.abs(nextRatio - finiteNumber(node.ratio, 0.5, 0.1, 0.9)) <= RATIO_EPSILON) {
      if (node[RUNTIME_SPLIT_RATIO] !== undefined) {
        delete node[RUNTIME_SPLIT_RATIO]
        changed = true
      }
    } else if (Math.abs((node[RUNTIME_SPLIT_RATIO] ?? node.ratio) - nextRatio) > RATIO_EPSILON) {
      node[RUNTIME_SPLIT_RATIO] = nextRatio
      changed = true
    }
    apply(node.first)
    apply(node.second)
  }
  apply(root)
  return changed
}

/**
 * Resolve the minimum expanded footprint of a layout tree.
 * @param {LayoutNode | null} root
 * @param {Object} [options]
 * @param {LayoutBehavior} [options.fallbackBehavior]
 * @param {(node: PanelNode, branchBehavior: LayoutBehavior) => LayoutBehavior} [options.resolvePanelBehavior]
 * @returns {{inlineSize: number, blockSize: number}}
 */
export function resolveLayoutMinSize(root, options = {}) {
  let {
    fallbackBehavior = DEFAULT_LAYOUT_BEHAVIOR,
    resolvePanelBehavior = (node, branchBehavior) => getNodeBehavior(node, branchBehavior),
  } = options

  function walk(node, fallback) {
    if (!node) return { inlineSize: 0, blockSize: 0 }
    let branchBehavior = getNodeBehavior(node, fallback)

    if (isPanelNode(node)) {
      if (node.collapsed) {
        return {
          inlineSize: COLLAPSED_PANEL_INLINE_SIZE,
          blockSize: COLLAPSED_PANEL_BLOCK_SIZE,
        }
      }
      let behavior = resolvePanelBehavior(node, branchBehavior)
      return {
        inlineSize: behavior.minInlineSize,
        blockSize: behavior.minBlockSize,
      }
    }

    let first = walk(node.first, branchBehavior)
    let second = walk(node.second, branchBehavior)
    let ratio = finiteNumber(node.ratio, 0.5, 0.1)
    ratio = Math.max(0.1, Math.min(0.9, ratio))

    if (node.direction === 'horizontal') {
      return {
        inlineSize: Math.max(
          first.inlineSize + second.inlineSize,
          first.inlineSize / ratio,
          second.inlineSize / (1 - ratio)
        ),
        blockSize: Math.max(first.blockSize, second.blockSize),
      }
    }

    return {
      inlineSize: Math.max(first.inlineSize, second.inlineSize),
      blockSize: Math.max(
        first.blockSize + second.blockSize,
        first.blockSize / ratio,
        second.blockSize / (1 - ratio)
      ),
    }
  }

  return walk(root, normalizeLayoutBehavior(fallbackBehavior))
}

/**
 * Resolve panel placement for mobile drawer projection without mutating layout
 * tree state.
 * @param {LayoutNode | null} root
 * @param {Object} [options]
 * @param {LayoutBehavior} [options.fallbackBehavior]
 * @param {(node: PanelNode, branchBehavior: LayoutBehavior) => LayoutBehavior} [options.resolvePanelBehavior]
 * @returns {{
 *   primaryPanelId: string,
 *   startPanelIds: string[],
 *   endPanelIds: string[],
 *   panels: Array<{id: string, panelType: string, dock: LayoutMobileDock, requestedDock: LayoutMobileDock, importance: number, swipeControl: LayoutSwipeControl, drawerHoverOpen: boolean, order: number}>
 * }}
 */
export function resolveMobileDrawerLayout(root, options = {}) {
  let {
    fallbackBehavior = DEFAULT_LAYOUT_BEHAVIOR,
    resolvePanelBehavior = (node, branchBehavior) => getNodeBehavior(node, branchBehavior),
  } = options
  let records = []

  function walk(node, fallback) {
    if (!node) return
    let branchBehavior = getNodeBehavior(node, fallback)
    if (isPanelNode(node)) {
      let behavior = resolvePanelBehavior(node, branchBehavior)
      records.push({
        id: node.id,
        panelType: node.panelType || '',
        dock: behavior.mobileDock,
        requestedDock: behavior.mobileDock,
        importance: behavior.importance,
        swipeControl: behavior.swipeControl,
        drawerHoverOpen: behavior.drawerHoverOpen,
        order: records.length,
      })
      return
    }
    walk(node.first, branchBehavior)
    walk(node.second, branchBehavior)
  }

  walk(root, normalizeLayoutBehavior(fallbackBehavior))
  if (!records.length) {
    return {
      primaryPanelId: '',
      startPanelIds: [],
      endPanelIds: [],
      panels: [],
    }
  }

  let primary = records
    .filter((record) => record.requestedDock === 'primary')
    .sort((a, b) => b.importance - a.importance || a.order - b.order)[0]
  if (!primary) {
    primary = [...records]
      .sort((a, b) => b.importance - a.importance || a.order - b.order)[0]
  }

  let panels = records.map((record) => {
    let dock = record.requestedDock
    if (record.id === primary.id) {
      dock = 'primary'
    } else if (dock === 'auto' || dock === 'primary') {
      dock = record.order < primary.order ? 'start' : 'end'
    }
    return { ...record, dock }
  })
  let startPanelIds = panels
    .filter((record) => record.dock === 'start')
    .map((record) => record.id)
  let endPanelIds = panels
    .filter((record) => record.dock === 'end')
    .map((record) => record.id)

  return {
    primaryPanelId: primary.id,
    startPanelIds,
    endPanelIds,
    panels,
  }
}

/**
 * Resolve root responsive layout state for browser and agent consumers.
 * @param {LayoutBehavior} [behavior]
 * @param {Object} [viewport]
 * @param {number} [viewport.inlineSize]
 * @param {number} [viewport.blockSize]
 * @param {number} [viewport.width]
 * @param {number} [viewport.height]
 * @param {{inlineSize?: number, blockSize?: number, width?: number, height?: number}} [viewport.layoutMinSize]
 * @param {LayoutBehavior} [fallback]
 * @returns {{
 *   behavior: LayoutBehavior,
 *   inlineSize: number,
 *   blockSize: number,
 *   layoutMinSize: {inlineSize: number, blockSize: number},
 *   responsiveActive: boolean,
 *   effectiveResponsiveMode: LayoutResponsiveMode,
 *   drawerActive: boolean,
 *   collapseAllowed: boolean,
 *   scrollInline: boolean,
 *   scrollBlock: boolean,
 *   cssVars: Record<string, string>
 * }}
 */
export function resolveResponsiveLayoutState(
  behavior = {},
  viewport = {},
  fallback = DEFAULT_LAYOUT_BEHAVIOR
) {
  let normalized = normalizeLayoutBehavior(behavior, fallback)
  let inlineSize = readInlineSize(viewport)
  let blockSize = readBlockSize(viewport)
  let layoutMinSize = {
    inlineSize: readInlineSize(viewport.layoutMinSize, normalized.minInlineSize),
    blockSize: readBlockSize(viewport.layoutMinSize, normalized.minBlockSize),
  }
  let responsiveActive = (
    normalized.responsiveMode !== 'preserve' &&
    inlineSize > 0 &&
    inlineSize <= normalized.responsiveBreakpoint
  )
  let effectiveResponsiveMode = responsiveActive ? normalized.responsiveMode : 'preserve'
  let drawerActive = effectiveResponsiveMode === 'drawer' || effectiveResponsiveMode === 'swipe'
  let collapseAllowed = (
    normalized.collapse === 'auto' &&
    normalized.overflow === 'collapse' &&
    !responsiveActive
  )
  let scrollInline = (
    normalized.overflow === 'scroll-inline' ||
    normalized.overflow === 'scroll' ||
    effectiveResponsiveMode === 'scroll-inline'
  )
  let scrollBlock = (
    normalized.overflow === 'scroll-block' ||
    normalized.overflow === 'scroll' ||
    effectiveResponsiveMode === 'stack'
  )
  let overflowInlineSize = Math.max(inlineSize, layoutMinSize.inlineSize)
  let overflowBlockSize = Math.max(blockSize, layoutMinSize.blockSize)

  return {
    behavior: normalized,
    inlineSize,
    blockSize,
    layoutMinSize,
    responsiveActive,
    effectiveResponsiveMode,
    drawerActive,
    collapseAllowed,
    scrollInline,
    scrollBlock,
    cssVars: {
      '--sn-layout-overflow-inline-size': `${overflowInlineSize}px`,
      '--sn-layout-overflow-block-size': `${overflowBlockSize}px`,
      '--sn-layout-responsive-panel-min-block-size': `${normalized.minBlockSize}px`,
    },
  }
}

/**
 * Check whether an expanded layout state can fit without immediately violating
 * descendant panel minimum sizes. Used to keep auto-collapse restore stable.
 * @param {LayoutNode | null} root
 * @param {number} inlineSize
 * @param {number} blockSize
 * @param {Object} [options]
 * @param {string} [options.restoringNodeId]
 * @param {LayoutBehavior} [options.fallbackBehavior]
 * @param {(node: PanelNode, branchBehavior: LayoutBehavior) => LayoutBehavior} [options.resolvePanelBehavior]
 * @param {number} [options.restoreFactor]
 * @param {number} [options.stableFactor]
 * @returns {boolean}
 */
export function branchFitsExpandedState(root, inlineSize, blockSize, options = {}) {
  let {
    restoringNodeId = '',
    fallbackBehavior = DEFAULT_LAYOUT_BEHAVIOR,
    resolvePanelBehavior = (node, branchBehavior) => getNodeBehavior(node, branchBehavior),
    restoreFactor = RESTORE_FIT_FACTOR,
    stableFactor = STABLE_FIT_FACTOR,
  } = options

  function isCollapsedPanelForRestore(node) {
    return isPanelNode(node) && node.collapsed && node.id !== restoringNodeId
  }

  function walk(node, availableInlineSize, availableBlockSize, fallback) {
    if (!node) return true
    let branchBehavior = getNodeBehavior(node, fallback)

    if (isPanelNode(node)) {
      if (node.collapsed && node.id !== restoringNodeId) return true
      let behavior = resolvePanelBehavior(node, branchBehavior)
      let factor = node.id === restoringNodeId ? restoreFactor : stableFactor
      return (
        availableInlineSize >= behavior.minInlineSize * factor &&
        availableBlockSize >= behavior.minBlockSize * factor
      )
    }

    let ratio = node.ratio || 0.5
    let first = node.first
    let second = node.second

    if (node.direction === 'horizontal') {
      let firstCollapsed = isCollapsedPanelForRestore(first)
      let secondCollapsed = isCollapsedPanelForRestore(second)
      let firstInlineSize = firstCollapsed
        ? COLLAPSED_PANEL_INLINE_SIZE
        : secondCollapsed
          ? Math.max(0, availableInlineSize - COLLAPSED_PANEL_INLINE_SIZE)
          : availableInlineSize * ratio
      let secondInlineSize = secondCollapsed
        ? COLLAPSED_PANEL_INLINE_SIZE
        : firstCollapsed
          ? Math.max(0, availableInlineSize - COLLAPSED_PANEL_INLINE_SIZE)
          : availableInlineSize * (1 - ratio)

      return (
        walk(first, firstInlineSize, availableBlockSize, branchBehavior) &&
        walk(second, secondInlineSize, availableBlockSize, branchBehavior)
      )
    }

    let firstCollapsed = isCollapsedPanelForRestore(first)
    let secondCollapsed = isCollapsedPanelForRestore(second)
    let firstBlockSize = firstCollapsed
      ? COLLAPSED_PANEL_BLOCK_SIZE
      : secondCollapsed
        ? Math.max(0, availableBlockSize - COLLAPSED_PANEL_BLOCK_SIZE)
        : availableBlockSize * ratio
    let secondBlockSize = secondCollapsed
      ? COLLAPSED_PANEL_BLOCK_SIZE
      : firstCollapsed
        ? Math.max(0, availableBlockSize - COLLAPSED_PANEL_BLOCK_SIZE)
        : availableBlockSize * (1 - ratio)

    return (
      walk(first, availableInlineSize, firstBlockSize, branchBehavior) &&
      walk(second, availableInlineSize, secondBlockSize, branchBehavior)
    )
  }

  return walk(root, inlineSize, blockSize, normalizeLayoutBehavior(fallbackBehavior))
}

/**
 * Validate that a layout tree matches validation rules
 * @param {LayoutNode} root
 * @param {Object} config
 * @param {Iterable<string>} [config.disallowedPanelTypes]
 * @param {Iterable<string>} [config.requiredPanelTypes]
 * @param {string} [config.expectedPrimary]
 * @returns {boolean}
 */
export function matchesSection(root, config = {}) {
  if (!root) return false
  if (config.disallowedPanelTypes) {
    if (hasAnyPanelType(root, config.disallowedPanelTypes)) return false
  }
  if (config.requiredPanelTypes) {
    if (!hasEveryPanelType(root, config.requiredPanelTypes)) return false
  }
  if (config.expectedPrimary) {
    return collectPanelTypes(root, { includeGlobal: false }).includes(config.expectedPrimary)
  }
  return true
}
