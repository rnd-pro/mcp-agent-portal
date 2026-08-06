import Symbiote from '@symbiotejs/symbiote';
import { slotProcessor } from '@symbiotejs/symbiote/core/slotProcessor.js';
import template from './GraphExplorerShell.tpl.js';
import css from './GraphExplorerShell.css.js';
import {
  getNextGraphPathStyle,
  renderGraphPathStyleButton,
} from '../graph-explorer.js';

export class GraphExplorerShell extends Symbiote {
  init$ = {
    mode: 'structured',
    pathStyle: 'pcb',
  };

  constructor() {
    super();
    this._mode = 'structured';
    this._pathStyle = 'pcb';
    this.templateProcessors.add(slotProcessor);
  }

  renderCallback() {
    if (this._shellReady) return;
    this._shellReady = true;
    this.addEventListener('click', this._onShellClick);
  }

  _onShellClick = (event) => {
    const button = event.composedPath?.().find?.((element) => (
      element?.matches?.('[data-action], [data-mode], [data-layer]')
    )) || event.target?.closest?.('[data-action], [data-mode], [data-layer]');
    if (!button || !this.contains(button)) return;
    event.stopPropagation?.();

    const mode = button.getAttribute('data-mode');
    if (mode) {
      this.emitShellEvent('graph-shell-label-mode-change', { mode });
      return;
    }

    const layer = button.getAttribute('data-layer');
    if (layer) {
      const visible = !button.hasAttribute('data-hidden');
      this.emitShellEvent('graph-shell-layer-toggle', { layer, visible });
      return;
    }

    const action = button.getAttribute('data-action');
    if (action === 'view-mode') {
      const mode = this._mode === 'flat' ? 'structured' : 'flat';
      this.setMode(mode);
      this.emitShellEvent('graph-shell-mode-change', { mode });
      return;
    }

    if (action === 'path-style') {
      const style = getNextGraphPathStyle(this._pathStyle);
      this.setPathStyle(style);
      this.emitShellEvent('graph-shell-path-style-change', { style });
      return;
    }

    if (action) {
      this.emitShellEvent('graph-shell-action', { action });
    }
  };

  emitShellEvent(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  setMode(mode) {
    const normalized = mode === 'flat' ? 'flat' : 'structured';
    this._mode = normalized;
    this.$.mode = normalized;
    this.setAttribute('data-mode', normalized);

    const hideStructuredOnly = normalized === 'flat';
    this.querySelectorAll('.graph-explorer-structured-only').forEach((element) => {
      element.hidden = hideStructuredOnly;
    });
    const hideFlatOnly = normalized !== 'flat';
    this.querySelectorAll('.graph-explorer-flat-only').forEach((element) => {
      element.hidden = hideFlatOnly;
    });
  }

  setPathStyle(style) {
    this._pathStyle = style || 'pcb';
    this.$.pathStyle = this._pathStyle;
    renderGraphPathStyleButton(this.querySelector('[data-action="path-style"]'), this._pathStyle);
  }

  setLoading({ visible, pct = 0, phase = '', sub = '' } = {}) {
    const loader = this.querySelector('sn-loading-overlay, loading-overlay');
    if (!loader) return;
    loader.setProgress?.(pct, phase, sub);
    if (visible === false) {
      loader.hide?.();
    } else if (visible === true) {
      loader.show?.();
    }
  }

  setStats(items = []) {
    const stats = this.querySelector('.graph-explorer-stats');
    if (!stats) return;
    stats.textContent = items
      .map((item) => `${item.value ?? ''} ${item.label ?? ''}`.trim())
      .filter(Boolean)
      .join(' ');
  }

  setToolbarConfig(config = {}) {
    this._toolbarConfig = config;
  }

  getNodeCanvas() {
    return this.querySelector('node-canvas');
  }

  getCanvasGraph() {
    return this.querySelector('canvas-graph');
  }
}

GraphExplorerShell.template = template;
GraphExplorerShell.rootStyles = css;
GraphExplorerShell.reg('graph-explorer-shell');

export default GraphExplorerShell;
