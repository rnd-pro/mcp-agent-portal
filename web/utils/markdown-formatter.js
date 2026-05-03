import { replaceIconsWithHtml } from '../common/icons.js';

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

/**
 * Format raw markdown text into safe HTML elements.
 * @param {string} text - Raw markdown
 * @returns {string} Safe HTML string
 */
export function formatMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  
  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre class="markdown-pre"><code>$1</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="markdown-code">$1</code>');
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="markdown-link">$1</a>');
  // Newlines
  html = html.split('\n').join('<br>');
  // Restore newlines inside pre
  html = html.replace(/<pre class="markdown-pre"><code>([\s\S]*?)<\/code><\/pre>/g, (match, p1) => {
    return `<pre class="markdown-pre"><code>${p1.split('<br>').join('\n')}</code></pre>`;
  });

  // Icons
  html = replaceIconsWithHtml(html);

  return html;
}
