/**
 * GraphNode — visual node card component
 *
 * Renders node header, input/output ports with sockets,
 * and embedded controls. Receives data via _nodeData property.
 *
 * @module symbiote-ui/components/GraphNode
 */

import Symbiote from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import { isMediaDescriptor } from '../../graph/media-descriptor.js';
import { template } from './GraphNode.tpl.js';
import { styles } from './GraphNode.css.js';
import '../PortItem/PortItem.js';
import '../CtrlItem/CtrlItem.js';

/** @type {Object<string, string>} */
const CATEGORY_ICONS = {
  server: 'dns',
  instance: 'memory',
  control: 'tune',
  data: 'database',

  directory: 'folder',
  file: 'description',
  function: 'functions',
  class: 'class',
  module: 'package_2',
  default: 'radio_button_checked',
};

function setOptionalAttribute(el, name, value) {
  if (value) {
    el.setAttribute(name, String(value));
  } else {
    el.removeAttribute(name);
  }
}

function normalizeNodeTone(value) {
  let tone = String(value || '').trim().toLowerCase();
  if (tone === 'inverted') return 'inverse';
  return tone;
}

function normalizeMediaFit(value) {
  let fit = String(value || '').trim().toLowerCase();
  if (fit === 'fit') return 'contain';
  if (fit === 'crop') return 'cover';
  if (fit === 'contain' || fit === 'cover') return fit;
  return '';
}

export class GraphNode extends Symbiote {
  destructionDelay = 200;

  /** @type {import('../../graph/media-descriptor.js').MediaDescriptor|null} */
  #mediaDescriptor = null;

  init$ = {
    '@node-label': '',
    '@node-category': 'default',
    nodeLabel: '',
    nodeIcon: 'radio_button_checked',
    mediaSrc: '',
    mediaAlt: '',
    mediaKind: '',
    isMediaActivatable: false,
    mediaActivateLabel: '',
    summary: '',
    href: '',
    linkHref: '',
    linkTarget: '',
    linkRel: '',
    linkLabel: 'Open',
    linkIcon: 'arrow_forward',
    hasItems: false,
    itemsList: [],
    inputPorts: [],
    outputPorts: [],
    controlsList: [],
  };

  renderCallback() {
    ensureMaterialSymbols(Object.values(CATEGORY_ICONS));

    this.sub('@node-label', (val) => {
      this.$.nodeLabel = val || '';
    });
    this.sub('@node-category', (val) => {
      this.$.nodeIcon = CATEGORY_ICONS[val] || CATEGORY_ICONS.default;
      ensureMaterialSymbols([this.$.nodeIcon]);
    });

    this.sub('mediaSrc', (src) => {
      this.toggleAttribute('data-has-media', Boolean(src));
    });

    this.sub('href', (href) => {
      let external = Boolean(href) && (href.startsWith('http://') || href.startsWith('https://'));
      this.set$({
        linkHref: href || '',
        linkTarget: external ? '_blank' : '',
        linkRel: external ? 'noopener noreferrer' : '',
        linkIcon: external ? 'open_in_new' : 'arrow_forward',
      });
      ensureMaterialSymbols([this.$.linkIcon]);
    });

    if (this._nodeData) {
      this.#populateFromNodeData(this._nodeData);
    }
  }

  /**
   * Populate ports and controls from Node instance
   * @param {import('../core/Node.js').Node} node
   */
  #populateFromNodeData(node) {
    let params = node.params || {};
    let contentHidden = Boolean(params.hideContent || params.contentHidden);
    let media = isMediaDescriptor(params.media) ? params.media : null;
    this.#mediaDescriptor = media;
    this.toggleAttribute('data-header-hidden', Boolean(params.hideHeader || params.headerHidden));
    this.toggleAttribute('data-content-hidden', contentHidden);
    setOptionalAttribute(this, 'data-node-tone', normalizeNodeTone(params.tone || params.nodeTone));
    setOptionalAttribute(
      this,
      'data-media-fit',
      media?.fit || normalizeMediaFit(params.mediaFit || params.imageFit || params.avatarFit)
    );
    let mediaAlt = media?.alt || params.mediaAlt || params.imageAlt || params.avatarAlt || node.label || '';
    let mediaKind = media ? String(media.kind || '') : '';
    this.set$({
      nodeIcon: node.icon || CATEGORY_ICONS[node.category] || CATEGORY_ICONS.default,
      mediaSrc: (media ? media.poster : params.media || params.image || params.avatar) || '',
      mediaAlt,
      mediaKind,
      isMediaActivatable: Boolean(media),
      mediaActivateLabel: media ? (mediaAlt ? `Activate ${mediaAlt}` : `Activate ${mediaKind || 'media'}`) : '',
      summary: contentHidden ? '' : params.summary || '',
      href: params.href || '',
      linkLabel: params.linkLabel || 'Open',
      hasItems: !contentHidden && Array.isArray(params.items) && params.items.length > 0,
      itemsList: !contentHidden && Array.isArray(params.items)
        ? params.items.map((item) => ({
            href: item.href || '#',
            target: item.external ? '_blank' : '',
            rel: item.external ? 'noopener noreferrer' : '',
            kicker: item.kicker || '',
            title: item.title || '',
            summary: item.summary || '',
          }))
        : [],
      inputPorts: Object.entries(node.inputs).map(([key, input]) => ({
        key,
        label: input.label || key,
        socketColor: input.socket?.color || 'var(--sn-node-accent)',
        socketName: input.socket?.name || 'any',
        side: 'input',
      })),
      outputPorts: Object.entries(node.outputs).map(([key, output]) => ({
        key,
        label: output.label || key,
        socketColor: output.socket?.color || 'var(--sn-node-accent)',
        socketName: output.socket?.name || 'any',
        side: 'output',
      })),
      controlsList: Object.entries(node.controls).map(([key, ctrl]) => ({
        key,
        label: key,
        inputType: ctrl.type || 'text',
        value: ctrl.value !== undefined ? String(ctrl.value) : '',
        isReadonly: ctrl.readonly || false,
      })),
    });
    ensureMaterialSymbols([this.$.nodeIcon]);
  }

  /**
   * Emit a bubbling media activation intent carrying the normalized descriptor.
   * The graph never mounts a player itself; a media host listens for this intent.
   * A native `<button>` provides keyboard (Enter/Space) activation.
   * @param {Event} [event]
   */
  onMediaActivate(event) {
    let descriptor = this.#mediaDescriptor;
    if (!descriptor) return;
    event?.stopPropagation();
    this.dispatchEvent(new CustomEvent('sn-media-activate', {
      bubbles: true,
      composed: true,
      detail: {
        descriptor,
        nodeId: this.getAttribute('node-id') || this._nodeData?.id || '',
      },
    }));
  }

  onMediaPointerDown(event) {
    if (!this.#mediaDescriptor) return;
    event?.stopPropagation();
  }
}

GraphNode.template = template;
GraphNode.rootStyles = styles;

GraphNode.reg('graph-node');
