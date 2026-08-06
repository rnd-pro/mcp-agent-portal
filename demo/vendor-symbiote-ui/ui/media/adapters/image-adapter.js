/**
 * Fixed registry key for the built-in image adapter.
 * @type {string}
 */
export const IMAGE_PROVIDER_KEY = 'image';

/**
 * Resolve the best available source for an image descriptor.
 * @param {{ poster?: string, activation?: { src?: string } }} descriptor
 * @returns {string}
 */
function resolveSource(descriptor) {
  let activation = descriptor?.activation || {};
  return String(activation.src || descriptor?.poster || '');
}

/**
 * Built-in image media adapter. Renders a lazy, non-draggable `<img>` inside the
 * host stage. Never throws; a missing source produces an empty image element.
 * @type {{ mount: (container: Element, descriptor: object) => HTMLImageElement, unmount: (container: Element, mountState: unknown) => void }}
 */
export const IMAGE_MEDIA_ADAPTER = {
  /**
   * @param {Element} container
   * @param {{ poster?: string, alt?: string, fit?: string, activation?: { src?: string } }} descriptor
   * @returns {HTMLImageElement}
   */
  mount(container, descriptor) {
    let img = document.createElement('img');
    let src = resolveSource(descriptor);
    if (src) img.setAttribute('src', src);
    img.setAttribute('alt', String(descriptor?.alt || ''));
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
    img.setAttribute('draggable', 'false');
    img.className = 'sn-media-img';
    if (descriptor?.fit) {
      img.style.setProperty('object-fit', String(descriptor.fit));
    }
    container.append(img);
    return img;
  },

  /**
   * @param {Element} container
   * @param {unknown} mountState
   */
  unmount(container, mountState) {
    /** @type {{ remove?: () => void }} */ (mountState)?.remove?.();
    if (container) container.textContent = '';
  },
};
