import Symbiote from '@symbiotejs/symbiote';
import '../../surface/Card/Card.js';
import '../../display/Badge/Badge.js';
import '../../display/Banner/Banner.js';
import '../../display/StatusLight/StatusLight.js';
import '../../display/DescriptionList/DescriptionList.js';
import '../../display/EmptyState/EmptyState.js';
import '../../inspector/TemplatePreview/TemplatePreview.js';
import {
  packDetailTemplate,
  packDetailMissingTemplate,
} from './PackDetail.tpl.js';
import css from './PackDetail.css.js';
import {
  readinessVariant,
  readinessLabel,
  nextActionLabel,
  flattenMissingCapabilities,
  normalizePackageSummary,
} from '../pack-readiness.js';

const READINESS_BANNER_VARIANTS = {
  ready: 'success',
  warning: 'warning',
  blocked: 'error',
};

class PackDetailMissingItem extends Symbiote {
  init$ = { group: '', id: '' };
}

PackDetailMissingItem.template = packDetailMissingTemplate;
PackDetailMissingItem.reg('sn-pack-detail-missing-item');

export class PackDetail extends Symbiote {
  init$ = {
    name: '',
    version: '',
    description: '',
    hasDescription: false,
    manifestTitle: 'Manifest',
    missingList: [],
    hasMissing: false,
    missingTitle: 'Missing capabilities',
    noMissingText: 'All required capabilities are available.',
    hasReadiness: false,
    readinessVariant: 'neutral',
    readinessLabel: '',
    readinessBannerVariant: 'info',
    nextActionText: '',
    hasNextAction: false,
    showPreview: false,
    showInstall: false,
    previewTitle: 'Preview',
    previewLabel: 'Preview',
    installLabel: 'Install',
    onInstall: () => this.#emit('install'),
    onPreview: () => this.#emit('preview'),
  };

  #package = null;
  #readiness = null;
  #previewTemplate = '';

  setPackage(workspacePackage, options = {}) {
    this.#package = workspacePackage || null;
    if (options.readiness !== undefined) this.#readiness = options.readiness;
    if (options.previewTemplate !== undefined) this.#previewTemplate = options.previewTemplate || '';
    this.#applyOptions(options);
    this.#render();
  }

  setReadiness(readiness) {
    this.#readiness = readiness || null;
    this.#render();
  }

  get value() {
    return this.#package;
  }

  connectedCallback() {
    super.connectedCallback?.();
    if (!this.hasAttribute('role')) this.setAttribute('role', 'region');
    this.#render();
  }

  #applyOptions(options) {
    if (options.installable !== undefined) this.$.showInstall = Boolean(options.installable);
    if (options.previewable !== undefined) this.$.showPreview = Boolean(options.previewable);
    if (options.installLabel) this.$.installLabel = options.installLabel;
    if (options.previewLabel) this.$.previewLabel = options.previewLabel;
  }

  #buildFacts(summary) {
    let facts = [];
    if (summary.version) facts.push({ label: 'Version', value: summary.version });
    let schema = summary.compatibility.workspaceSchema;
    if (typeof schema === 'string' && schema) {
      facts.push({ label: 'Workspace schema', value: schema });
    }
    if (summary.permissions.length) {
      facts.push({ label: 'Permissions', value: summary.permissions.join(', ') });
    }
    let deps = summary.dependencies;
    facts.push({
      label: 'Dependencies',
      value: `${deps.plugins.length} plugins · ${deps.components.length} components · ${deps.packages.length} packages`,
    });
    let assets = summary.assets;
    facts.push({
      label: 'Assets',
      value: `${assets.docs.length} docs · ${assets.examples.length} examples · ${assets.previews.length} previews`,
    });
    return facts;
  }

  #render() {
    let summary = normalizePackageSummary(this.#package);
    let readiness = this.#readiness;
    let hasReadiness = Boolean(readiness && typeof readiness === 'object');
    let missing = flattenMissingCapabilities(readiness?.source?.missing || readiness?.missing);
    let nextAction = nextActionLabel(readiness);

    this.set$({
      name: summary.name,
      version: summary.version,
      description: summary.description,
      hasDescription: Boolean(summary.description),
      missingList: missing,
      hasMissing: missing.length > 0,
      hasReadiness,
      readinessVariant: readinessVariant(readiness),
      readinessLabel: readinessLabel(readiness),
      readinessBannerVariant: hasReadiness
        ? (READINESS_BANNER_VARIANTS[readiness.status] || 'info')
        : 'info',
      nextActionText: nextAction,
      hasNextAction: Boolean(nextAction),
    });

    let banner = this.querySelector('.sn-pack-detail-readiness-banner');
    if (banner) banner.setAttribute('variant', this.$.readinessBannerVariant);

    this.#renderManifest(this.#buildFacts(summary));

    if (this.$.showPreview) {
      let preview = this.querySelector('template-preview');
      if (preview) preview.$.template = this.#previewTemplate;
    }
  }

  #renderManifest(facts) {
    let list = this.ref?.manifest;
    if (!list) return;
    list.replaceChildren();
    for (let fact of facts) {
      let item = document.createElement('sn-description-item');
      item.setAttribute('label', fact.label);
      item.textContent = fact.value;
      list.append(item);
    }
  }

  #emit(type) {
    this.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      composed: true,
      detail: { id: this.#package?.manifest?.id || null, package: this.#package },
    }));
  }
}

PackDetail.template = packDetailTemplate;
PackDetail.rootStyles = css;
PackDetail.reg('sn-pack-detail');

export default PackDetail;
