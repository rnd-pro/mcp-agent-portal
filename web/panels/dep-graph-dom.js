export {
  renderClusterPanel,
  renderGraphStats,
} from 'symbiote-node/ui';

export function mountDepGraphTemplate(host, template, doc = document) {
  host.replaceChildren(doc.createRange().createContextualFragment(template));
}

