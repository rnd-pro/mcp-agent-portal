/**
 * QuickToolbar — floating action bar above selected node
 *
 * Shows contextual SVG buttons when a single node is selected:
 * Delete, Duplicate, Mute.
 * Positioned above the node and follows zoom/pan transform.
 *
 * @module symbiote-ui/toolbar/QuickToolbar
 */

import Symbiote from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import {
  bringOverlayToFront,
  mountOverlayToDocument,
  restoreOverlayHome,
} from '../../ui/overlay-stack.js';
import '../../control/Button/Button.js';
import { template } from './QuickToolbar.tpl.js';
import { styles } from './QuickToolbar.css.js';
import { translate } from '../../locale/index.js';

/**
 * @typedef {object} ToolbarAction
 * @property {string} id - Action identifier
 * @property {string} icon - Material Symbols icon name
 * @property {string} label - Tooltip text
 */

/** @type {ToolbarAction[]} */
const ACTIONS = [
  { id: 'duplicate', icon: 'content_copy', label: translate('toolbar.duplicate') },
  { id: 'mute', icon: 'visibility_off', label: translate('toolbar.mute') },
  { id: 'delete', icon: 'delete', label: translate('toolbar.delete') },
];
const ICONS = [
  'code',
  'content_copy',
  'delete',
  'hub',
  'login',
  'visibility',
  'visibility_off',
];

const CLIP_BOUNDARY_SELECTOR = '.panel-content, .panel-view, panel-layout';

export class QuickToolbar extends Symbiote {
  init$ = {
    items: ACTIONS,
    visible: false,
    hasTitle: false,
    nodeTitle: '',
    enterSubgraphTitle: translate('toolbar.enterSubgraph'),
    exploreConnectionsTitle: translate('toolbar.exploreConnections'),
    viewCodeTitle: translate('toolbar.viewCode'),
    duplicateTitle: translate('toolbar.duplicate'),
    muteTitle: translate('toolbar.mute'),
    deleteTitle: translate('toolbar.delete'),
    onBtnClick: (/** @type {Event} */ e) => {
      let btn = e.target.closest('[data-action]');
      if (!btn) return;
      let action = btn.getAttribute('data-action');
      if (this._onAction) this._onAction(action, this._nodeId);
    },
  };

  /** @type {string|null} */
  _nodeId = null;

  /** @type {function|null} */
  _onAction = null;

  /** @type {HTMLElement|null} */
  _nodeEl = null;

  /** @type {number} */
  _hideTimer = 0;

  /** @type {boolean} */
  _hoverInside = false;

  /** @type {boolean} */
  _sticky = false;

  /** @type {boolean} */
  _hoverEventsBound = false;

  /** @type {boolean} */
  _viewportEventsBound = false;

  /** @type {boolean} */
  _documentEventsBound = false;

  /** @type {number} */
  _positionFrame = 0;

  _onViewportChange = () => {
    if (!this.#isAnchorVisible()) {
      this.hide();
      return;
    }
    this.#requestPositionUpdate();
  };

  _onWheel = (/** @type {WheelEvent} */ e) => {
    this.#forwardWheelToCanvas(e);
  };

  _onDocumentPointerDown = (/** @type {PointerEvent|MouseEvent|TouchEvent} */ e) => {
    if (!this.$.visible || this.hidden) return;
    let target = this.#eventTarget(e);
    if (!target) return;
    if (this.contains(target)) return;

    let canvas = this.#getAnchorCanvas();
    if (canvas?.contains?.(target)) return;

    this.hide();
  };

  _onDocumentVisibilityChange = () => {
    if (this.ownerDocument?.hidden) this.hide();
  };

  /** @type {number} Toolbar height + gap */
  static OFFSET_Y = 48;

  /** @type {number} Gap between the toolbar block and the node */
  static GAP_Y = 6;

  /** @type {number} Delay that lets the pointer cross the node-toolbar gap */
  static HIDE_DELAY = 160;

  /** @type {number} */
  static TOOLBAR_EDGE_INSET = 16;

  /** @type {number} */
  static ANCHOR_VISIBILITY_MARGIN = 16;

  /** @type {{ zoom: number, panX: number, panY: number }} */
  _transform = { zoom: 1, panX: 0, panY: 0 };

  /**
   * Show toolbar above a node
   * @param {string} nodeId
   * @param {HTMLElement} nodeEl - The graph-node element
   * @param {{ sticky?: boolean }} [options]
   */
  show(nodeId, nodeEl, options = {}) {
    this.cancelHide();
    this._nodeId = nodeId;
    this._nodeEl = nodeEl;
    this._sticky = Boolean(options.sticky);
    let themeSource = nodeEl.closest?.('node-canvas') || nodeEl;
    mountOverlayToDocument(this, themeSource);
    this.#syncTitle(nodeEl);
    this.#updateIcons(nodeEl);
    let enterBtn = this.querySelector('[data-action="enter"]');
    if (enterBtn) {
      enterBtn.hidden = nodeEl.getAttribute('node-type') !== 'subgraph';
    }
    this.$.visible = true;
    this.toggleAttribute('hidden', false);
    bringOverlayToFront(this);
    this.#bindDocumentEvents();

    this.#fitToolbarWidth();
    this.#positionAtNode(nodeEl);
    requestAnimationFrame(() => {
      if (this._nodeEl !== nodeEl) return;
      this.#fitToolbarWidth();
      this.#positionAtNode(nodeEl);
    });
  }

  /** Hide toolbar */
  hide() {
    this.cancelHide();
    this.#cancelPositionUpdate();
    this._nodeId = null;
    this._nodeEl = null;
    this._sticky = false;
    this._hoverInside = false;
    this.$.visible = false;
    this.$.hasTitle = false;
    this.$.nodeTitle = '';
    this.toggleAttribute('data-has-title', false);
    this.style.removeProperty('--sn-toolbar-fit-width');
    this.style.removeProperty('--sn-toolbar-scale');
    this.#clearClipInsets();
    this.#unbindDocumentEvents();
    restoreOverlayHome(this);
  }

  renderCallback() {
    ensureMaterialSymbols(ICONS);
    if (!this._hoverEventsBound) {
      this.addEventListener('pointerenter', () => {
        this._hoverInside = true;
        this.cancelHide();
        bringOverlayToFront(this);
      });
      this.addEventListener('pointerleave', () => {
        this._hoverInside = false;
        this.scheduleHide();
      });
      this.addEventListener('wheel', this._onWheel, { passive: false });
      this._hoverEventsBound = true;
    }
    if (!this._viewportEventsBound && typeof window !== 'undefined') {
      window.addEventListener('resize', this._onViewportChange, { passive: true });
      window.addEventListener('scroll', this._onViewportChange, { passive: true, capture: true });
      this._viewportEventsBound = true;
    }
    this.sub('visible', (val) => {
      this.toggleAttribute('hidden', !val);
    });
  }

  destroyCallback() {
    this.#cancelPositionUpdate();
    this.#unbindDocumentEvents();
    if (this._viewportEventsBound && typeof window !== 'undefined') {
      window.removeEventListener('resize', this._onViewportChange);
      window.removeEventListener('scroll', this._onViewportChange, { capture: true });
      this._viewportEventsBound = false;
    }
  }

  /**
   * Keep the toolbar visible while the pointer travels from a node into it.
   * @param {number} [delay]
   * @param {string|null} [nodeId]
   */
  scheduleHide(delay = QuickToolbar.HIDE_DELAY, nodeId = this._nodeId) {
    this.cancelHide();
    let activeNodeId = nodeId;
    if (typeof setTimeout !== 'function') {
      if (!this._hoverInside && !this._sticky) this.hide();
      return;
    }
    this._hideTimer = setTimeout(() => {
      this._hideTimer = 0;
      if (this._nodeId !== activeNodeId) return;
      if (this._hoverInside || this._sticky) return;
      this.hide();
    }, delay);
  }

  cancelHide() {
    if (!this._hideTimer) return;
    clearTimeout(this._hideTimer);
    this._hideTimer = 0;
  }

  /**
   * Update position to follow node movement
   * @param {HTMLElement} nodeEl
   */
  updatePosition(nodeEl) {
    if (!this._nodeId) return;
    this.#positionAtNode(nodeEl);
  }

  #requestPositionUpdate() {
    if (!this._nodeId || !this._nodeEl || !this.$.visible || this.hidden) return;
    if (this._positionFrame) return;

    if (typeof requestAnimationFrame !== 'function') {
      this.#positionAtNode(this._nodeEl);
      return;
    }

    this._positionFrame = requestAnimationFrame(() => {
      this._positionFrame = 0;
      if (!this._nodeId || !this._nodeEl || !this.$.visible || this.hidden) return;
      this.#positionAtNode(this._nodeEl);
    });
  }

  #cancelPositionUpdate() {
    if (!this._positionFrame) return;
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._positionFrame);
    }
    this._positionFrame = 0;
  }

  #bindDocumentEvents() {
    if (this._documentEventsBound) return;
    let doc = this.ownerDocument;
    if (!doc?.addEventListener) return;

    doc.addEventListener('pointerdown', this._onDocumentPointerDown, { capture: true });
    doc.addEventListener('visibilitychange', this._onDocumentVisibilityChange);
    this._documentEventsBound = true;
  }

  #unbindDocumentEvents() {
    if (!this._documentEventsBound) return;
    let doc = this.ownerDocument;
    if (doc?.removeEventListener) {
      doc.removeEventListener('pointerdown', this._onDocumentPointerDown, { capture: true });
      doc.removeEventListener('visibilitychange', this._onDocumentVisibilityChange);
    }
    this._documentEventsBound = false;
  }

  #eventTarget(/** @type {Event} */ e) {
    let path = typeof e.composedPath === 'function' ? e.composedPath() : null;
    return path?.[0] || e.target || null;
  }

  #getAnchorCanvas() {
    return this._nodeEl?.closest?.('node-canvas') || null;
  }

  #isAnchorVisible() {
    let nodeEl = this._nodeEl;
    if (!nodeEl) return true;
    if (!nodeEl.isConnected) return false;
    if (!this.#elementIntersectsViewport(nodeEl)) return false;

    let canvas = this.#getAnchorCanvas();
    if (canvas && !this.#elementIntersectsViewport(canvas)) return false;

    return true;
  }

  #elementIntersectsViewport(/** @type {HTMLElement} */ element) {
    let rect = element.getBoundingClientRect?.();
    if (!rect) return true;
    if (rect.width <= 0 || rect.height <= 0) return false;

    let docEl = element.ownerDocument?.documentElement;
    let viewportWidth = docEl?.clientWidth || globalThis.window?.innerWidth || 0;
    let viewportHeight = docEl?.clientHeight || globalThis.window?.innerHeight || 0;
    if (!viewportWidth || !viewportHeight) return true;

    let margin = QuickToolbar.ANCHOR_VISIBILITY_MARGIN;
    return (
      rect.right >= -margin &&
      rect.bottom >= -margin &&
      rect.left <= viewportWidth + margin &&
      rect.top <= viewportHeight + margin
    );
  }

  /**
   * Portaled toolbars live outside node-canvas, so wheel events no longer
   * bubble into the canvas zoom/scroll handlers unless we route them back.
   * @param {WheelEvent} e
   */
  #forwardWheelToCanvas(e) {
    if (!this.hasAttribute('data-overlay-portal') || !this._nodeEl) return;

    let canvas = this._nodeEl.closest?.('node-canvas');
    if (!canvas) return;

    e.preventDefault();
    e.stopPropagation();

    if (canvas.hasAttribute?.('data-flow-scroll') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (typeof canvas.scrollBy === 'function') {
        canvas.scrollBy({ left: e.deltaX || 0, top: e.deltaY || 0, behavior: 'auto' });
      } else {
        canvas.scrollLeft += e.deltaX || 0;
        canvas.scrollTop += e.deltaY || 0;
      }
      this.#requestPositionUpdate();
      return;
    }

    let target = canvas.ref?.canvasContainer || canvas.querySelector?.('.canvas-container') || canvas;
    let forwarded = this.#cloneWheelEvent(e);
    if (forwarded) {
      target.dispatchEvent(forwarded);
      this.#requestPositionUpdate();
    }
  }

  /**
   * @param {WheelEvent} e
   * @returns {WheelEvent|Event|null}
   */
  #cloneWheelEvent(e) {
    let init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      deltaX: e.deltaX || 0,
      deltaY: e.deltaY || 0,
      deltaZ: e.deltaZ || 0,
      deltaMode: e.deltaMode || 0,
      clientX: e.clientX || 0,
      clientY: e.clientY || 0,
      screenX: e.screenX || 0,
      screenY: e.screenY || 0,
      ctrlKey: Boolean(e.ctrlKey),
      shiftKey: Boolean(e.shiftKey),
      altKey: Boolean(e.altKey),
      metaKey: Boolean(e.metaKey),
      buttons: e.buttons || 0,
    };

    if (typeof WheelEvent === 'function') {
      return new WheelEvent('wheel', init);
    }

    let doc = this.ownerDocument;
    if (typeof doc?.createEvent !== 'function') return null;

    let event = doc.createEvent('Event');
    event.initEvent('wheel', true, true);
    Object.defineProperties(event, Object.fromEntries(
      Object.entries(init).map(([key, value]) => [key, { value }])
    ));
    return event;
  }

  /**
   * Position toolbar centered above a node in screen-space.
   * @param {HTMLElement} nodeEl
   */
  #positionAtNode(nodeEl) {
    let toolbarEl = this.querySelector('.toolbar');
    let toolbarHeight = toolbarEl?.offsetHeight || (QuickToolbar.OFFSET_Y - QuickToolbar.GAP_Y);
    let nodeRect = nodeEl.getBoundingClientRect?.();
    let containerRect = this.parentElement?.getBoundingClientRect?.();
    let scale = this.#resolveNodeVisualScale(nodeEl, nodeRect);
    let offsetY = (toolbarHeight + QuickToolbar.GAP_Y) * scale;

    this.style.setProperty('--sn-toolbar-scale', String(scale));

    if (nodeRect && containerRect) {
      if (this.hasAttribute('data-overlay-portal')) {
        let x = nodeRect.left + nodeRect.width / 2;
        let toolbarWidth = (toolbarEl?.offsetWidth || 0) * scale;
        let toolbarBlockHeight = toolbarHeight * scale;
        let clipRect = this.#resolveClipBoundaryRect(nodeEl);
        let y = nodeRect.top - offsetY;
        this.style.transform = `translate(${x}px, ${y}px)`;
        this.#syncClipInsets({
          left: x - toolbarWidth / 2,
          top: y,
          right: x + toolbarWidth / 2,
          bottom: y + toolbarBlockHeight,
        }, clipRect, scale);
        return;
      }

      let x = nodeRect.left - containerRect.left + nodeRect.width / 2;
      let y = nodeRect.top - containerRect.top - offsetY;
      this.style.transform = `translate(${x}px, ${y}px)`;
      this.#clearClipInsets();
      return;
    }

    let w = nodeEl.offsetWidth || nodeEl._cachedW || 180;
    let pos = nodeEl._position || { x: 0, y: 0 };
    let x = pos.x + w / 2;
    let y = pos.y - offsetY;
    this.style.transform = `translate(${x}px, ${y}px)`;
    this.#clearClipInsets();
  }

  #resolveClipBoundaryRect(/** @type {HTMLElement} */ nodeEl) {
    let boundary = nodeEl.closest?.(CLIP_BOUNDARY_SELECTOR) || this.#getAnchorCanvas();
    let rect = boundary?.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) return rect;

    let docEl = nodeEl.ownerDocument?.documentElement;
    let width = docEl?.clientWidth || globalThis.window?.innerWidth || 0;
    let height = docEl?.clientHeight || globalThis.window?.innerHeight || 0;
    if (!width || !height) return null;

    return {
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
    };
  }

  #syncClipInsets(toolbarRect, clipRect, scale) {
    if (!clipRect) {
      this.#clearClipInsets();
      return;
    }
    let divisor = Number.isFinite(scale) && scale > 0 ? scale : 1;
    this.style.setProperty('--sn-toolbar-clip-top', `${Math.max(0, clipRect.top - toolbarRect.top) / divisor}px`);
    this.style.setProperty('--sn-toolbar-clip-right', `${Math.max(0, toolbarRect.right - clipRect.right) / divisor}px`);
    this.style.setProperty('--sn-toolbar-clip-bottom', `${Math.max(0, toolbarRect.bottom - clipRect.bottom) / divisor}px`);
    this.style.setProperty('--sn-toolbar-clip-left', `${Math.max(0, clipRect.left - toolbarRect.left) / divisor}px`);
  }

  #clearClipInsets() {
    this.style.removeProperty('--sn-toolbar-clip-top');
    this.style.removeProperty('--sn-toolbar-clip-right');
    this.style.removeProperty('--sn-toolbar-clip-bottom');
    this.style.removeProperty('--sn-toolbar-clip-left');
  }

  /**
   * Match the screen-space toolbar to the visual scale of a transformed node.
   * @param {HTMLElement} nodeEl
   * @param {DOMRect|undefined} nodeRect
   * @returns {number}
   */
  #resolveNodeVisualScale(nodeEl, nodeRect) {
    let rectWidth = nodeRect?.width || 0;
    let baseWidth = nodeEl.offsetWidth || nodeEl._cachedW || 0;
    let scale = baseWidth > 0 && rectWidth > 0
      ? rectWidth / baseWidth
      : this._transform?.zoom || 1;

    if (!Number.isFinite(scale) || scale <= 0) return 1;
    return Math.max(0.05, Math.min(scale, 8));
  }

  /**
   * Show the node title inside the toolbar only when the node has no visible own header.
   * @param {HTMLElement} nodeEl
   */
  #syncTitle(nodeEl) {
    let title = nodeEl.getAttribute('node-label') || nodeEl.querySelector('.sn-node-label')?.textContent?.trim() || '';
    let hasOwnHeader = !nodeEl.hasAttribute('data-header-hidden') && !nodeEl.hasAttribute('data-svg-shape');
    let hasTitle = Boolean(title && !hasOwnHeader);

    this.$.hasTitle = hasTitle;
    this.$.nodeTitle = hasTitle ? title : '';
    this.toggleAttribute('data-has-title', hasTitle);

    let titleRow = this.querySelector('.toolbar-title');
    let titleText = this.querySelector('.toolbar-title-text');
    if (titleText) titleText.textContent = this.$.nodeTitle;
    if (titleRow) titleRow.hidden = !hasTitle;
  }

  #fitToolbarWidth() {
    let toolbarEl = this.querySelector('.toolbar');
    if (!toolbarEl) return;
    this.style.removeProperty('--sn-toolbar-fit-width');
    if (!this.$.hasTitle) return;

    let titleText = this.querySelector('.toolbar-title-text');
    let titleRow = this.querySelector('.toolbar-title');
    if (!titleText || !titleRow || !titleText.textContent) return;

    let toolbarStyle = getComputedStyle(toolbarEl);
    let titleStyle = getComputedStyle(titleText);
    let rowStyle = getComputedStyle(titleRow);
    let viewportWidth = this.ownerDocument?.documentElement?.clientWidth || window.innerWidth || 0;
    let maxWidth = Number.parseFloat(toolbarStyle.maxInlineSize);
    if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
      maxWidth = Math.max(0, viewportWidth - QuickToolbar.TOOLBAR_EDGE_INSET * 2);
    }

    let minWidth = Number.parseFloat(getComputedStyle(this).getPropertyValue('--sn-toolbar-title-min-width'));
    if (!Number.isFinite(minWidth) || minWidth <= 0) minWidth = 0;

    let actionWidth = this.#measureActionWidth();
    let paddingX =
      Number.parseFloat(rowStyle.paddingLeft) +
      Number.parseFloat(rowStyle.paddingRight) +
      Number.parseFloat(rowStyle.borderLeftWidth) +
      Number.parseFloat(rowStyle.borderRightWidth);
    if (!Number.isFinite(paddingX)) paddingX = 0;

    let lineHeight = Number.parseFloat(titleStyle.lineHeight);
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
      lineHeight = Number.parseFloat(titleStyle.fontSize) * 1.35;
    }
    let maxLines = Number.parseInt(getComputedStyle(this).getPropertyValue('--sn-toolbar-title-lines'), 10);
    if (!Number.isFinite(maxLines) || maxLines < 1) maxLines = 2;

    let measuredTextWidth = this.#measureTitleTextWidth(titleText.textContent, titleStyle, lineHeight, maxLines, Math.max(1, maxWidth - paddingX));
    let nextWidth = Math.ceil(Math.max(measuredTextWidth + paddingX, actionWidth, minWidth));
    nextWidth = Math.min(nextWidth, maxWidth);
    this.style.setProperty('--sn-toolbar-fit-width', `${nextWidth}px`);
  }

  #measureActionWidth() {
    let actions = this.querySelector('.toolbar-actions');
    if (!actions) return 0;

    let style = getComputedStyle(actions);
    let gap = Number.parseFloat(style.columnGap || style.gap);
    if (!Number.isFinite(gap)) gap = 0;
    let width = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
    if (!Number.isFinite(width)) width = 0;

    let visibleItems = Array.from(actions.children).filter((item) => !item.hidden);
    visibleItems.forEach((item, index) => {
      width += item.getBoundingClientRect?.().width || item.offsetWidth || 0;
      if (index > 0) width += gap;
    });

    return Math.ceil(width);
  }

  #measureTitleTextWidth(text, titleStyle, lineHeight, maxLines, maxContentWidth) {
    let doc = this.ownerDocument;
    let probe = doc.createElement('div');
    probe.textContent = text;
    probe.style.position = 'fixed';
    probe.style.left = '-10000px';
    probe.style.top = '0';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.contain = 'layout style paint';
    probe.style.boxSizing = 'content-box';
    probe.style.fontFamily = titleStyle.fontFamily;
    probe.style.fontSize = titleStyle.fontSize;
    probe.style.fontStyle = titleStyle.fontStyle;
    probe.style.fontWeight = titleStyle.fontWeight;
    probe.style.letterSpacing = titleStyle.letterSpacing;
    probe.style.lineHeight = titleStyle.lineHeight;
    probe.style.whiteSpace = 'normal';
    probe.style.overflowWrap = 'anywhere';
    probe.style.textWrap = 'balance';
    doc.body.appendChild(probe);

    let low = 1;
    let high = Math.max(1, maxContentWidth);
    let allowedHeight = lineHeight * maxLines + 1;
    for (let i = 0; i < 10; i += 1) {
      let mid = (low + high) / 2;
      probe.style.width = `${mid}px`;
      if (probe.scrollHeight <= allowedHeight) {
        high = mid;
      } else {
        low = mid;
      }
    }
    probe.remove();
    return high;
  }

  /**
   * Update toggle icons based on node state
   * @param {HTMLElement} nodeEl
   */
  #updateIcons(nodeEl) {
    let isMuted = nodeEl.hasAttribute('data-muted');

    let muteBtn = this.querySelector('[data-action="mute"] .tb-icon');

    if (muteBtn) muteBtn.textContent = isMuted ? 'visibility' : 'visibility_off';
  }
}

QuickToolbar.template = template;
QuickToolbar.rootStyles = styles;
QuickToolbar.reg('quick-toolbar');
