import Symbiote from '@symbiotejs/symbiote';
import { escapeHtml } from '../markdown-formatter.js';
import { normalizePreviewGraph } from '../output-preview.js';
import template from './OutputGraphPreview.tpl.js';
import css from './OutputGraphPreview.css.js';
import { translate } from '../../locale/index.js';

function renderNode(node) {
  let description = node.description
    ? `<div class="output-graph-preview-node-description">${escapeHtml(node.description)}</div>`
    : '';

  return `
    <article class="output-graph-preview-node" data-node-id="${escapeHtml(node.id)}">
      <div class="output-graph-preview-node-label">${escapeHtml(node.label)}</div>
      <div class="output-graph-preview-node-kind">${escapeHtml(node.kind)}</div>
      ${description}
    </article>
  `;
}

function renderEdge(edge) {
  let label = edge.label ? ` ${edge.label}` : '';
  return `
    <span class="output-graph-preview-edge">
      ${escapeHtml(edge.source)} -> ${escapeHtml(edge.target)}${escapeHtml(label)}
    </span>
  `;
}

function renderGraph(data) {
  let nodes = data.nodes.map(renderNode).join('');
  let edges = data.edges.length
    ? `<div class="output-graph-preview-edges">${data.edges.map(renderEdge).join('')}</div>`
    : '';
  return `${nodes}${edges}`;
}

export class OutputGraphPreview extends Symbiote {
  init$ = {
    title: translate('outputGraph.title'),
    countText: '0 nodes',
    emptyText: translate('outputGraph.empty'),
    graphHtml: '',
    truncatedText: '',
    isEmpty: true,
    isTruncated: false,
    showHeader: true,
  };

  #normalized = normalizePreviewGraph({ nodes: [], edges: [] });

  renderCallback() {
    this.sub('isEmpty', (value) => {
      this.toggleAttribute('empty', Boolean(value));
    });
  }

  setValue(value, options = {}) {
    this.setData(normalizePreviewGraph(value, options));
  }

  setGraph(value, options = {}) {
    this.setValue(value, options);
  }

  setData(data = normalizePreviewGraph({ nodes: [], edges: [] })) {
    this.#normalized = data;
    let nodePlural = data.nodes.length === 1 ? 'node' : 'nodes';
    let edgePlural = data.edges.length === 1 ? 'edge' : 'edges';
    this.set$({
      countText: `${data.nodes.length} ${nodePlural}, ${data.edges.length} ${edgePlural}`,
      graphHtml: renderGraph(data),
      truncatedText: data.truncated ? translate('outputGraph.truncated') : '',
      isEmpty: data.empty,
      isTruncated: data.truncated,
    });
  }

  getData() {
    return this.#normalized;
  }
}

OutputGraphPreview.template = template;
OutputGraphPreview.rootStyles = css;
OutputGraphPreview.reg('output-graph-preview');

export default OutputGraphPreview;
