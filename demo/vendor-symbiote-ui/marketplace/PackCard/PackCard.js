import Symbiote from '@symbiotejs/symbiote';
import '../../surface/Card/Card.js';
import '../../display/Badge/Badge.js';
import '../../display/Tag/Tag.js';
import '../../display/StatusLight/StatusLight.js';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import { packCardTemplate, packCardTagTemplate } from './PackCard.tpl.js';
import css from './PackCard.css.js';
import {
  readinessVariant,
  readinessLabel,
  normalizePackageSummary,
} from '../pack-readiness.js';

class PackCardTag extends Symbiote {
  init$ = { label: '' };
}

PackCardTag.template = packCardTagTemplate;
PackCardTag.reg('sn-pack-card-tag');

export class PackCard extends Symbiote {
  init$ = {
    name: '',
    version: '',
    description: '',
    hasDescription: false,
    tagList: [],
    hasTags: false,
    author: '',
    hasAuthor: false,
    verified: false,
    authorVariant: 'default',
    price: '',
    hasPrice: false,
    readinessVariant: 'neutral',
    readinessLabel: '',
    showInstall: false,
    showPreview: false,
    installLabel: 'Install',
    previewLabel: 'Preview',
    onActivate: () => this.#emit('select'),
    onInstall: (event) => {
      event.stopPropagation();
      this.#emit('install');
    },
    onPreview: (event) => {
      event.stopPropagation();
      this.#emit('preview');
    },
  };

  #package = null;
  #readiness = null;

  setPackage(workspacePackage, options = {}) {
    this.#package = workspacePackage || null;
    if (options.readiness !== undefined) this.#readiness = options.readiness;
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
    ensureMaterialSymbols(['verified']);
    if (!this.hasAttribute('role')) this.setAttribute('role', 'listitem');
    this.#render();
  }

  #applyOptions(options) {
    if (options.author !== undefined) {
      this.$.author = options.author || '';
      this.$.hasAuthor = Boolean(options.author);
    }
    if (options.verified !== undefined) {
      this.$.verified = Boolean(options.verified);
      this.$.authorVariant = options.verified ? 'success' : 'default';
    }
    if (options.price !== undefined) {
      this.$.price = options.price || '';
      this.$.hasPrice = Boolean(options.price);
    }
    if (options.installable !== undefined) this.$.showInstall = Boolean(options.installable);
    if (options.previewable !== undefined) this.$.showPreview = Boolean(options.previewable);
    if (options.installLabel) this.$.installLabel = options.installLabel;
    if (options.previewLabel) this.$.previewLabel = options.previewLabel;
  }

  #render() {
    let summary = normalizePackageSummary(this.#package);
    let readiness = this.#readiness;
    this.set$({
      name: summary.name,
      version: summary.version,
      description: summary.description,
      hasDescription: Boolean(summary.description),
      tagList: summary.tags.map((label) => ({ label })),
      hasTags: summary.tags.length > 0,
      readinessVariant: readinessVariant(readiness),
      readinessLabel: readinessLabel(readiness),
    });
  }

  #emit(type) {
    this.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      composed: true,
      detail: { id: this.#package?.manifest?.id || null, package: this.#package },
    }));
  }
}

PackCard.template = packCardTemplate;
PackCard.rootStyles = css;
PackCard.reg('sn-pack-card');

export default PackCard;
