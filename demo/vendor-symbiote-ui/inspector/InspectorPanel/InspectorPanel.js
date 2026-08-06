/**
 * InspectorPanel — side panel showing selected node properties
 *
 * Displays node label, type, category, inputs/outputs/controls.
 * Updates when selection changes. Shows "No selection" when nothing selected.
 *
 * @module symbiote-ui/inspector/InspectorPanel
 */

import Symbiote from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import { template, inspPortItemTemplate, inspCtrlItemTemplate } from './InspectorPanel.tpl.js';
import { styles } from './InspectorPanel.css.js';
import '../TemplatePreview/TemplatePreview.js';
import { translate } from '../../locale/index.js';

const INSPECTOR_ICONS = [
  'account_tree',
  'input',
  'login',
  'output',
  'play_arrow',
  'touch_app',
  'tune',
];

export class InspectorPanel extends Symbiote {
  init$ = {
    visible: false,
    nodeLabel: '',
    nodeType: '',
    nodeCategory: '',
    nodeId: '',
    inputsList: [],
    outputsList: [],
    controlsList: [],
    hasSelection: false,
    isFireable: false,
    isSubgraph: false,
    isTemplateBuilder: false,
    innerNodeCount: 0,
    emptyLabel: translate('inspector.empty'),
    labelLabel: translate('inspector.label'),
    typeLabel: translate('inspector.type'),
    categoryLabel: translate('inspector.category'),
    inputsLabel: translate('inspector.inputs'),
    outputsLabel: translate('inspector.outputs'),
    controlsLabel: translate('inspector.controls'),
    fireLabel: translate('inspector.fire'),
    subgraphLabel: translate('inspector.subgraph'),
    innerNodesLabel: translate('inspector.innerNodes'),
    enterSubgraphLabel: translate('inspector.enterSubgraph'),
    onFire: () => {
      if (this._currentNodeId) {
        this.dispatchEvent(
          new CustomEvent('node-fire', {
            detail: { nodeId: this._currentNodeId },
            bubbles: true,
            composed: true,
          })
        );
      }
    },
    onEnterSubgraph: () => {
      if (this._canvas && this._currentNodeId) {
        this._canvas.drillDown(this._currentNodeId);
      }
    },
  };

  /** @type {*} */
  _canvas = null;

  /** @type {string|null} */
  _currentNodeId = null;

  /**
   * Show inspector for a node
   * @param {*} node - Node instance or node-like object
   */
  inspect(node) {
    if (!node) {
      this.clear();
      return;
    }

    let inputs = Object.entries(node.inputs).map(([key, port]) => ({
      key,
      label: port.label || key,
      socketType: port.socket?.name || 'any',
    }));

    let outputs = Object.entries(node.outputs).map(([key, port]) => ({
      key,
      label: port.label || key,
      socketType: port.socket?.name || 'any',
    }));

    let controls = Object.entries(node.controls).map(([key, ctrl]) => ({
      key,
      label: ctrl.label || key,
      value: ctrl.value ?? '',
      type: ctrl.type || 'text',
      options: (ctrl.options || []).join(','),
    }));

    let isSubgraph = !!node._isSubgraph;
    let innerNodeCount = 0;
    if (isSubgraph && node.innerEditor) {
      innerNodeCount = node.innerEditor.getNodes().length;
    }

    this._currentNodeId = node.id;


    let driver = node.driver || node._driver;
    let isFireable =
      !!driver?.fireable ||
      node.type === 'debug/inject' ||
      node.category === 'trigger' ||
      node.category === 'queue';

    this.set$({
      nodeLabel: node.label,
      nodeType: node.type || 'default',
      nodeCategory: node.category || 'default',
      nodeId: node.id,
      inputsList: inputs,
      outputsList: outputs,
      controlsList: controls,
      hasSelection: true,
      visible: true,
      isFireable,
      isSubgraph,
      isTemplateBuilder:
        node.type === 'transform/template-builder' || node.type === 'transform/template',
      innerNodeCount,
    });


    if (node.type === 'transform/template-builder' || node.type === 'transform/template') {
      requestAnimationFrame(() => {
        /** @type {*} */
        let preview = this.querySelector('template-preview');
        if (preview && node.params?.template) {
          preview.$.template = node.params.template;
        }
      });
    }
  }

  /** Clear inspector */
  clear() {
    this._currentNodeId = null;
    this.set$({
      hasSelection: false,
      nodeLabel: '',
      nodeType: '',
      nodeCategory: '',
      nodeId: '',
      inputsList: [],
      outputsList: [],
      controlsList: [],
      isFireable: false,
      isSubgraph: false,
      isTemplateBuilder: false,
      innerNodeCount: 0,
    });
  }

  renderCallback() {
    ensureMaterialSymbols(INSPECTOR_ICONS);

    this.sub('visible', (val) => {
      this.toggleAttribute('hidden', !val);
    });


    this.addEventListener('ctrl-change', (/** @type {CustomEvent} */ e) => {
      let { key, value } = e.detail;
      if (this._currentNodeId && this._canvas) {
        let editor = this._canvas._editor;
        if (editor) {
          let node = editor.getNode(this._currentNodeId);
          if (node && node.controls[key]) {
            node.controls[key].setValue(value);
          }

          if (node && node.params) {
            node.params[key] = value;
          }

          if (key === 'template') {
            let preview = this.querySelector('template-preview');
            if (preview) preview.$.template = value;
          }
        }
      }
    });

    this.sub('hasSelection', (val) => {
      /** @type {HTMLElement} */
      let empty = this.querySelector('.insp-empty');
      /** @type {HTMLElement} */
      let content = this.querySelector('.insp-content');
      if (empty) empty.hidden = val;
      if (content) content.hidden = !val;
    });

    this.sub('isSubgraph', (val) => {
      /** @type {HTMLElement} */
      let sgSection = this.querySelector('.insp-subgraph');
      if (sgSection) sgSection.hidden = !val;
    });


    const STORAGE_KEY = 'sn-inspector-width';
    let handle = this.querySelector('.insp-resize-handle');


    let saved = localStorage.getItem(STORAGE_KEY);
    if (saved) this.style.width = saved + 'px';

    if (handle) {
      let startX = 0;
      let startW = 0;

      /** @param {PointerEvent} e */
      let onMove = (e) => {
        let delta = startX - e.clientX;
        let newWidth = Math.max(200, Math.min(600, startW + delta));
        this.style.width = newWidth + 'px';
      };

      let onUp = () => {
        handle.classList.remove('dragging');
        localStorage.setItem(STORAGE_KEY, String(this.offsetWidth));
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };

      handle.addEventListener('pointerdown', (/** @type {PointerEvent} */ e) => {
        e.preventDefault();
        e.stopPropagation();
        startX = e.clientX;
        startW = this.offsetWidth;
        handle.classList.add('dragging');
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
    }
  }
}


class InspPortItem extends Symbiote {
  init$ = {
    key: '',
    label: '',
    socketType: '',
  };
}

InspPortItem.template = inspPortItemTemplate;
InspPortItem.reg('insp-port-item');


class InspCtrlItem extends Symbiote {
  init$ = {
    key: '',
    label: '',
    value: '',
    type: 'text',
    options: '',
  };

  renderCallback() {
    /** @type {HTMLElement} */
    let container = this.querySelector('.insp-ctrl-input');
    if (!container) return;

    this.sub('type', (type) => {
      this._renderControl(container, type);
    });
  }

  /**
   * Render the appropriate control element
   * @param {HTMLElement} container
   * @param {string} type
   */
  _renderControl(container, type) {
    container.replaceChildren();

    if (type === 'textarea') {
      let el = document.createElement('textarea');
      el.className = 'insp-ctrl-textarea';
      el.value = this.$.value || '';
      el.rows = 6;
      el.spellcheck = false;
      el.addEventListener('input', () => this._emitChange(el.value));
      container.appendChild(el);
    } else if (type === 'boolean') {
      let label = document.createElement('label');
      label.className = 'insp-ctrl-toggle';
      let el = document.createElement('input');
      el.type = 'checkbox';
      el.checked = this.$.value === true || this.$.value === 'true';
      el.addEventListener('change', () => this._emitChange(el.checked));
      let slider = document.createElement('span');
      slider.className = 'insp-ctrl-slider';
      label.appendChild(el);
      label.appendChild(slider);
      container.appendChild(label);
    } else if (type === 'select') {
      let el = document.createElement('select');
      el.className = 'insp-ctrl-select';
      let opts =
        typeof this.$.options === 'string'
          ? this.$.options
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
      for (const opt of opts) {
        let option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        if (opt === String(this.$.value)) option.selected = true;
        el.appendChild(option);
      }
      el.addEventListener('change', () => this._emitChange(el.value));
      container.appendChild(el);
    } else {

      let el = document.createElement('input');
      el.className = 'insp-ctrl-input-el';
      el.type = type === 'number' ? 'number' : 'text';
      el.value = this.$.value ?? '';
      el.spellcheck = false;
      el.addEventListener('input', () => {
        this._emitChange(type === 'number' ? Number(el.value) : el.value);
      });
      container.appendChild(el);
    }
  }

  /**
   * Emit change event to parent InspectorPanel
   * @param {*} value
   */
  _emitChange(value) {
    this.$.value = value;
    this.dispatchEvent(
      new CustomEvent('ctrl-change', {
        bubbles: true,
        detail: { key: this.$.key, value },
      })
    );
  }
}

InspCtrlItem.template = inspCtrlItemTemplate;
InspCtrlItem.reg('insp-ctrl-item');

InspectorPanel.template = template;
InspectorPanel.rootStyles = styles;
InspectorPanel.reg('inspector-panel');
