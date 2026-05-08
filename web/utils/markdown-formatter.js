import { replaceIconsWithHtml } from '../common/icons.js';
import { renderMarkdown } from '../highlight.js';

/** Simple HTML entity escaper for user-facing text in innerHTML */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Format seconds into human-readable elapsed time */
export function formatElapsed(sec) {
  if (sec < 60) return `${sec}s`;
  let m = Math.floor(sec / 60);
  let s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function formatMarkdown(text) {
  if (!text) return '';
  let html = renderMarkdown(text, '');
  
  // File mentions @[filepath], optionally unwrapping them from quotes or inline code tags
  html = html.replace(/(?:<code class="md-inline-code">|<\/code>|&quot;|'|&#39;)*@\[([^\]]+)\](?:<code class="md-inline-code">|<\/code>|&quot;|'|&#39;)*/g, '<span class="markdown-mention">@[$1]</span>');

  // Icons
  html = replaceIconsWithHtml(html);

  return html;
}
