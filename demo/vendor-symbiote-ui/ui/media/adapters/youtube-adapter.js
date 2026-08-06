import { resolveSafeMediaUrl } from '../resolveSafeMediaUrl.js';

/**
 * Fixed registry key for the built-in YouTube adapter.
 * @type {string}
 */
export const YOUTUBE_PROVIDER_KEY = 'youtube';

/** Canonical YouTube video id shape. */
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;

/**
 * Extract a candidate video id from a YouTube url without constructing a URL
 * object (keeps behaviour identical for relative and absolute inputs).
 * @param {string} url
 * @returns {string}
 */
function parseVideoIdFromUrl(url) {
  let value = String(url || '');
  if (!value) return '';
  let watch = value.match(/[?&]v=([^&#]+)/);
  if (watch) return watch[1];
  let embed = value.match(/\/embed\/([^?&#/]+)/);
  if (embed) return embed[1];
  let short = value.match(/youtu\.be\/([^?&#/]+)/);
  if (short) return short[1];
  return '';
}

/**
 * Resolve a sanitized video id from a descriptor, or an empty string when the
 * id is missing or fails the strict character allow-list.
 * @param {{ activation?: { videoId?: string, src?: string, url?: string } }} descriptor
 * @returns {string}
 */
function resolveVideoId(descriptor) {
  let activation = descriptor?.activation || {};
  let candidate = String(activation.videoId || '').trim();
  if (!candidate) {
    candidate = parseVideoIdFromUrl(activation.url || activation.src || '');
  }
  return VIDEO_ID_PATTERN.test(candidate) ? candidate : '';
}

/**
 * Render the fail-safe poster + external link fallback used when a video id
 * cannot be trusted. Never mounts an iframe.
 * @param {Element} container
 * @param {{ poster?: string, alt?: string, activation?: { url?: string, src?: string } }} descriptor
 * @returns {HTMLElement}
 */
function renderFallback(container, descriptor) {
  let wrap = document.createElement('div');
  wrap.className = 'sn-media-fallback';

  let poster = String(descriptor?.poster || '');
  if (poster) {
    let img = document.createElement('img');
    img.setAttribute('src', poster);
    img.setAttribute('alt', String(descriptor?.alt || ''));
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
    img.setAttribute('draggable', 'false');
    img.className = 'sn-media-img';
    wrap.append(img);
  }

  let activation = descriptor?.activation || {};
  let href = resolveSafeMediaUrl(activation.url, activation.src, poster);
  if (href) {
    let link = document.createElement('a');
    link.setAttribute('href', href);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    link.className = 'sn-media-external-link';
    link.textContent = descriptor?.alt || 'Open video';
    wrap.append(link);
  }

  container.append(wrap);
  return wrap;
}

/**
 * Built-in privacy-hardened YouTube adapter. Mounts a `youtube-nocookie.com`
 * iframe only for a sanitized video id; anything else degrades to a poster and
 * external link. Never throws.
 * @type {{ mount: (container: Element, descriptor: object) => Element, unmount: (container: Element, mountState: unknown) => void }}
 */
export const YOUTUBE_MEDIA_ADAPTER = {
  /**
   * @param {Element} container
   * @param {{ poster?: string, alt?: string, activation?: { videoId?: string, src?: string, url?: string } }} descriptor
   * @returns {Element}
   */
  mount(container, descriptor) {
    let id = resolveVideoId(descriptor);
    if (!id) {
      return renderFallback(container, descriptor);
    }

    let iframe = document.createElement('iframe');
    iframe.setAttribute('src', `https://www.youtube-nocookie.com/embed/${id}?rel=0`);
    iframe.setAttribute('title', String(descriptor?.alt || 'YouTube video'));
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.setAttribute('allow', 'encrypted-media; picture-in-picture');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    iframe.className = 'sn-media-frame';
    iframe.style.setProperty('width', '100%');
    iframe.style.setProperty('height', '100%');
    container.append(iframe);
    return iframe;
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
