import { replaceIconsWithHtml } from '../common/icons.js';
import { formatMarkdown as formatLibraryMarkdown } from 'symbiote-ui/display/markdown-formatter';

export { escapeHtml, formatElapsed, formatMarkdownMentions } from 'symbiote-ui/display/markdown-formatter';

function resolvePortalImage(src, { basePath = '' } = {}) {
  let dir = basePath ? basePath.substring(0, basePath.lastIndexOf('/') + 1) : '';
  return `/api/image?path=${encodeURIComponent(dir + src)}`;
}

export function formatMarkdown(text, options = {}) {
  return formatLibraryMarkdown(text, {
    ...options,
    resolveImageSrc: options.resolveImageSrc || resolvePortalImage,
    transformHtml(html) {
      let transformed = typeof options.transformHtml === 'function'
        ? options.transformHtml(html)
        : html;
      return replaceIconsWithHtml(transformed);
    },
  });
}
