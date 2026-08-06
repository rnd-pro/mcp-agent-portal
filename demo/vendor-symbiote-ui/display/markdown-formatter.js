import { renderMarkdown } from './highlight.js';

/**
 * @param {*} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * @param {number} sec
 * @returns {string}
 */
export function formatElapsed(sec) {
  if (sec < 60) return `${sec}s`;
  let m = Math.floor(sec / 60);
  let s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/**
 * @param {string} html
 * @returns {string}
 */
export function formatMarkdownMentions(html) {
  return String(html || '').replace(
    /(?:<code class="md-inline-code">|<\/code>|&quot;|'|&#39;)*@\[([^\]]+)\](?:<code class="md-inline-code">|<\/code>|&quot;|'|&#39;)*/g,
    '<span class="markdown-mention">@[$1]</span>'
  );
}

/**
 * @param {string} text
 * @param {Object} [options]
 * @param {string} [options.basePath]
 * @param {function} [options.render]
 * @param {function} [options.resolveImageSrc]
 * @param {function} [options.transformHtml]
 * @returns {string}
 */
export function formatMarkdown(text, options = {}) {
  if (!text) return '';
  let {
    basePath = '',
    render = renderMarkdown,
    resolveImageSrc,
    transformHtml,
  } = options || {};

  let html = render(text, { basePath, resolveImageSrc });
  html = formatMarkdownMentions(html);

  if (typeof transformHtml === 'function') {
    html = transformHtml(html);
  }

  return html;
}
