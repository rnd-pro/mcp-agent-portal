import Symbiote from '@symbiotejs/symbiote';
import { isMediaDescriptor } from '../../../graph/media-descriptor.js';
import { getMediaProvider } from '../provider-registry.js';
import { resolveSafeMediaUrl } from '../resolveSafeMediaUrl.js';
import template from './MediaHost.tpl.js';
import css from './MediaHost.css.js';

/**
 * Accessible, security-hardened lazy media host.
 *
 * The host renders only a poster and an activation control until an explicit
 * user activation. Provider adapters (iframes, players) mount into a dedicated
 * stage exactly once and are torn down on descriptor replacement or terminal
 * disconnect. A layout-managed reparent preserves the mounted adapter.
 * Unknown providers and adapter failures degrade to a poster + external link
 * without throwing, so graph render/pan/zoom can never instantiate an embed.
 */
class MediaHost extends Symbiote {
  /** @type {object | null} */
  #descriptor = null;

  /** @type {import('../provider-registry.js').MediaProviderAdapter | null} */
  #activeAdapter = null;

  /** @type {unknown} */
  #mountState = undefined;

  /** @type {boolean} */
  #ready = false;

  /** @type {boolean} */
  #pendingActivation = false;

  #onActivate = () => {
    this.activate();
  };

  #onKeydown = (event) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      this.activate();
    }
  };

  /**
   * Current media descriptor.
   * @returns {object | null}
   */
  get descriptor() {
    return this.#descriptor;
  }

  /**
   * Store a descriptor and reset the host to its poster state, unmounting any
   * active adapter first.
   * @param {object | null} value
   */
  set descriptor(value) {
    this.#descriptor = value || null;
    this.#unmountActive();
    this.#pendingActivation = false;
    if (this.#ready) {
      this.#renderPoster();
    }
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.setAttribute('role', 'group');
    if (this.#ready) {
      this.#bindActivationListeners();
    }
  }

  renderCallback() {
    this.#bindActivationListeners();

    this.#ready = true;
    if (!this.hasAttribute('data-activated')) {
      this.#renderPoster();
    }

    if (this.#pendingActivation) {
      this.#pendingActivation = false;
      this.activate();
    }
  }

  disconnectedCallback() {
    this.ref.button?.removeEventListener('click', this.#onActivate);
    this.ref.button?.removeEventListener('keydown', this.#onKeydown);
    super.disconnectedCallback?.();
  }

  destroyCallback() {
    this.#unmountActive();
    this.#pendingActivation = false;
    if (this.#ready) {
      this.#renderPoster();
    }
    super.destroyCallback?.();
  }

  /**
   * Mount the provider adapter for the current descriptor on explicit user
   * activation. Safe: unknown providers and adapter throws degrade to fallback.
   * @returns {void}
   */
  activate() {
    let descriptor = this.#descriptor;
    if (!isMediaDescriptor(descriptor)) return;

    if (!this.#ready || !this.ref.stage) {
      this.#pendingActivation = true;
      return;
    }
    this.#pendingActivation = false;

    this.#unmountActive();

    let provider = descriptor.activation?.provider;
    let adapter = getMediaProvider(provider);
    if (!adapter) {
      this.#fallback('unknown-provider');
      return;
    }

    let stage = this.ref.stage;

    try {
      this.#hidePoster();
      let mountState = adapter.mount(stage, descriptor);
      this.#activeAdapter = adapter;
      this.#mountState = mountState;
      this.setAttribute('data-activated', '');
      this.dispatchEvent(new CustomEvent('sn-media-mount', {
        bubbles: true,
        composed: true,
        detail: { provider },
      }));
    } catch {
      this.#fallback('mount-error');
    }
  }

  #renderPoster() {
    let stage = this.ref.stage;
    if (stage) stage.textContent = '';
    this.removeAttribute('data-activated');

    let descriptor = this.#descriptor;
    let poster = this.ref.poster;

    if (!isMediaDescriptor(descriptor)) {
      if (poster) poster.hidden = true;
      this.setAttribute('aria-hidden', 'true');
      return;
    }
    this.removeAttribute('aria-hidden');

    if (poster) poster.hidden = false;
    if (this.ref.posterImg) {
      this.ref.posterImg.setAttribute('src', String(descriptor.poster || ''));
      this.ref.posterImg.setAttribute('alt', String(descriptor.alt || ''));
    }
    if (this.ref.button) {
      let kind = String(descriptor.kind || 'media');
      let label = descriptor.alt ? String(descriptor.alt) : `Play ${kind}`;
      this.ref.button.setAttribute('aria-label', label);
      this.ref.button.hidden = false;
    }
    if (this.ref.buttonLabel) {
      this.ref.buttonLabel.textContent = String(descriptor.alt || descriptor.kind || '');
    }
  }

  #hidePoster() {
    if (this.ref.poster) this.ref.poster.hidden = true;
  }

  #bindActivationListeners() {
    this.ref.button?.addEventListener('click', this.#onActivate);
    this.ref.button?.addEventListener('keydown', this.#onKeydown);
  }

  /**
   * @param {string} reason
   */
  #fallback(reason) {
    this.#unmountActive();
    this.#hidePoster();

    let descriptor = this.#descriptor;
    let stage = this.ref.stage;
    if (!stage) return;
    stage.textContent = '';

    let poster = String(descriptor?.poster || '');
    if (poster) {
      let img = document.createElement('img');
      img.setAttribute('src', poster);
      img.setAttribute('alt', String(descriptor?.alt || ''));
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
      img.setAttribute('draggable', 'false');
      img.className = 'sn-media-img';
      stage.append(img);
    }

    let activation = descriptor?.activation || {};
    let href = resolveSafeMediaUrl(activation.url, activation.src, poster);
    if (href) {
      let link = document.createElement('a');
      link.setAttribute('href', href);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      link.className = 'sn-media-external-link';
      link.textContent = descriptor?.alt ? `Open ${descriptor.alt}` : 'Open media externally';
      stage.append(link);
    }

    this.setAttribute('data-activated', '');
    this.dispatchEvent(new CustomEvent('sn-media-error', {
      bubbles: true,
      composed: true,
      detail: { provider: activation.provider, reason },
    }));
  }

  #unmountActive() {
    let stage = this.ref.stage;
    if (this.#activeAdapter) {
      try {
        this.#activeAdapter.unmount(stage, this.#mountState);
      } catch {
        /* adapter teardown must never surface */
      }
    }
    this.#activeAdapter = null;
    this.#mountState = undefined;
    if (stage) stage.textContent = '';
  }
}

MediaHost.template = template;
MediaHost.rootStyles = css;
MediaHost.reg('sn-media-host');

export default MediaHost;
