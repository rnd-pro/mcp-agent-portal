import Symbiote from '@symbiotejs/symbiote';
import template from './SourceDiff.tpl.js';
import css from './SourceDiff.css.js';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import { normalizeDiffData } from '../source-contract.js';

function emit(el, type, detail = {}) {
  el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}

function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

function renderDiagnostics(line) {
  let diagnostics = Array.isArray(line?.diagnostics) ? line.diagnostics : [];
  if (diagnostics.length === 0) return '';
  let severity = diagnostics.some((item) => item.severity === 'error') ? 'error'
    : diagnostics.some((item) => item.severity === 'warning') ? 'warning'
      : diagnostics.some((item) => item.severity === 'hint') ? 'hint'
        : 'info';
  let title = diagnostics
    .map((item) => item.message || item.code || item.severity)
    .filter(Boolean)
    .join('\n');
  return `<span class="sn-source-diff-diagnostic" data-severity="${escapeAttr(severity)}" title="${escapeAttr(title)}">${diagnostics.length}</span>`;
}

function getAlignedPairs(lines) {
  let pairs = [];
  let leftAccum = [];
  let rightAccum = [];

  let flush = () => {
    let max = Math.max(leftAccum.length, rightAccum.length);
    for (let i = 0; i < max; i++) {
      pairs.push({
        left: leftAccum[i] || null,
        right: rightAccum[i] || null,
      });
    }
    leftAccum = [];
    rightAccum = [];
  };

  for (let line of lines) {
    if (line.type === 'deletion') {
      leftAccum.push(line);
    } else if (line.type === 'addition') {
      rightAccum.push(line);
    } else {
      flush();
      pairs.push({ left: line, right: line });
    }
  }
  flush();
  return pairs;
}

export class SourceDiff extends Symbiote {
  #diffData = null;

  init$ = {
    path: '',
    statsText: '',
    layout: 'unified',
    layoutIcon: 'splitscreen',
    layoutText: 'Side-by-Side',
    diffHtml: '',

    onToggleLayout: () => {
      let next = this.$.layout === 'unified' ? 'side-by-side' : 'unified';
      this.$.layout = next;
      this.$.layoutIcon = next === 'unified' ? 'splitscreen' : 'view_headline';
      this.$.layoutText = next === 'unified' ? 'Side-by-Side' : 'Unified View';
      this.#render();
    },

    onAcceptAll: () => {
      emit(this, 'sn-review-accept', { path: this.$.path, mode: 'all', diffData: this.#diffData });
    },

    onRejectAll: () => {
      emit(this, 'sn-review-reject', { path: this.$.path, mode: 'all', diffData: this.#diffData });
    },

    onRequestChanges: () => {
      emit(this, 'sn-review-request-change', { path: this.$.path, mode: 'all', diffData: this.#diffData });
    },

    onBodyClick: (event) => {
      // Hunk action handling
      let hunkBtn = event.target?.closest('.sn-source-diff-hunk-btn');
      if (hunkBtn) {
        event.stopPropagation();
        let idx = parseInt(hunkBtn.dataset.hunkIndex);
        let action = hunkBtn.dataset.action;
        let hunk = this.#diffData?.hunks?.[idx];
        if (hunk && ['accept', 'reject', 'request-change'].includes(action)) {
          emit(this, `sn-review-${action}`, {
            path: this.$.path,
            mode: 'hunk',
            hunkIndex: idx,
            hunk,
          });
        }
        return;
      }

      // Comment button click handling
      let commentBtn = event.target?.closest('.sn-source-diff-comment-btn');
      if (commentBtn) {
        event.stopPropagation();
        let line = parseInt(commentBtn.dataset.line);
        let side = commentBtn.dataset.side; // 'original' or 'modified'
        emit(this, 'sn-diff-comment-add', {
          path: this.$.path,
          line,
          side,
        });
      }
    }
  };

  connectedCallback() {
    super.connectedCallback?.();
    this.#render();
  }

  setDiffData(data = {}) {
    this.#diffData = normalizeDiffData(data) || { path: '', hunks: [] };
    this.$.path = this.#diffData.path || this.#diffData.modifiedPath || this.#diffData.originalPath || '';
    
    // Compute addition/deletion stats
    let additions = 0;
    let deletions = 0;
    (this.#diffData.hunks || []).forEach((hunk) => {
      (hunk.lines || []).forEach((line) => {
        if (line.type === 'addition') additions++;
        if (line.type === 'deletion') deletions++;
      });
    });
    this.$.statsText = `+${additions} -${deletions} lines`;

    this.#render();
  }

  getDiffData() {
    return this.#diffData;
  }

  #render() {
    ensureMaterialSymbols([
      'splitscreen',
      'view_headline',
      'check_circle',
      'cancel',
      'add_comment',
      'check',
      'close',
      'rate_review'
    ]);

    if (!this.#diffData || !Array.isArray(this.#diffData.hunks) || this.#diffData.hunks.length === 0) {
      this.$.diffHtml = '<div class="sn-source-diff-empty">No diff content to display</div>';
      return;
    }

    if (this.$.layout === 'side-by-side') {
      this.$.diffHtml = this.#renderSideBySide();
    } else {
      this.$.diffHtml = this.#renderUnified();
    }
  }

  #renderUnified() {
    let htmlLines = [];
    htmlLines.push('<table class="sn-source-diff-table">');

    (this.#diffData.hunks || []).forEach((hunk, hunkIdx) => {
      // Hunk Header row
      htmlLines.push(`<tr class="sn-source-diff-hunk-header">`);
      htmlLines.push(`<td colspan="3">`);
      htmlLines.push(`<span>${escapeHtml(hunk.header || 'Hunk')}</span>`);
      htmlLines.push(`<span class="sn-source-diff-hunk-actions">`);
      htmlLines.push(`<button class="sn-source-diff-hunk-btn" data-action="accept" data-hunk-index="${hunkIdx}" title="Accept hunk"><span class="material-symbols-outlined">check</span></button>`);
      htmlLines.push(`<button class="sn-source-diff-hunk-btn" data-action="reject" data-hunk-index="${hunkIdx}" title="Reject hunk"><span class="material-symbols-outlined">close</span></button>`);
      htmlLines.push(`<button class="sn-source-diff-hunk-btn" data-action="request-change" data-hunk-index="${hunkIdx}" title="Request changes"><span class="material-symbols-outlined">rate_review</span></button>`);
      htmlLines.push(`</span>`);
      htmlLines.push(`</td>`);
      htmlLines.push(`</tr>`);

      (hunk.lines || []).forEach((line) => {
        let typeClass = '';
        let prefix = ' ';
        if (line.type === 'addition') {
          typeClass = ' sn-source-diff-line-add';
          prefix = '+';
        } else if (line.type === 'deletion') {
          typeClass = ' sn-source-diff-line-delete';
          prefix = '-';
        }

        let origNum = line.originalLineNumber != null ? String(line.originalLineNumber) : '';
        let modNum = line.modifiedLineNumber != null ? String(line.modifiedLineNumber) : '';

        // Add inline comment triggers on gutter
        let activeLineNum = line.modifiedLineNumber ?? line.originalLineNumber;
        let side = line.type === 'deletion' ? 'original' : 'modified';
        let commentTrigger = activeLineNum
          ? `<button class="sn-source-diff-comment-btn" data-line="${escapeAttr(activeLineNum)}" data-side="${escapeAttr(side)}">+</button>`
          : '';
        let diagnostics = renderDiagnostics(line);

        htmlLines.push(`<tr class="sn-source-diff-row${typeClass}">`);
        htmlLines.push(`<td class="sn-source-diff-gutter">${escapeHtml(origNum)}</td>`);
        htmlLines.push(`<td class="sn-source-diff-gutter">${escapeHtml(modNum)}${diagnostics}${commentTrigger}</td>`);
        htmlLines.push(`<td class="sn-source-diff-code"><span>${prefix}</span> ${escapeHtml(line.content)}</td>`);
        htmlLines.push(`</tr>`);
      });
    });

    htmlLines.push('</table>');
    return htmlLines.join('');
  }

  #renderSideBySide() {
    let htmlLines = [];
    htmlLines.push('<table class="sn-source-diff-table sn-source-diff-side-by-side">');

    (this.#diffData.hunks || []).forEach((hunk, hunkIdx) => {
      // Hunk Header row
      htmlLines.push(`<tr class="sn-source-diff-hunk-header">`);
      htmlLines.push(`<td colspan="4">`);
      htmlLines.push(`<span>${escapeHtml(hunk.header || 'Hunk')}</span>`);
      htmlLines.push(`<span class="sn-source-diff-hunk-actions">`);
      htmlLines.push(`<button class="sn-source-diff-hunk-btn" data-action="accept" data-hunk-index="${hunkIdx}" title="Accept hunk"><span class="material-symbols-outlined">check</span></button>`);
      htmlLines.push(`<button class="sn-source-diff-hunk-btn" data-action="reject" data-hunk-index="${hunkIdx}" title="Reject hunk"><span class="material-symbols-outlined">close</span></button>`);
      htmlLines.push(`<button class="sn-source-diff-hunk-btn" data-action="request-change" data-hunk-index="${hunkIdx}" title="Request changes"><span class="material-symbols-outlined">rate_review</span></button>`);
      htmlLines.push(`</span>`);
      htmlLines.push(`</td>`);
      htmlLines.push(`</tr>`);

      let aligned = getAlignedPairs(hunk.lines || []);

      aligned.forEach((pair) => {
        let left = pair.left;
        let right = pair.right;

        let leftClass = left ? (left.type === 'deletion' ? ' sn-source-diff-line-delete' : '') : ' sn-source-diff-empty-cell';
        let rightClass = right ? (right.type === 'addition' ? ' sn-source-diff-line-add' : '') : ' sn-source-diff-empty-cell';

        let leftOrigNum = left?.originalLineNumber != null ? String(left.originalLineNumber) : '';
        let rightModNum = right?.modifiedLineNumber != null ? String(right.modifiedLineNumber) : '';

        let leftCommentTrigger = left?.originalLineNumber
          ? `<button class="sn-source-diff-comment-btn" data-line="${escapeAttr(left.originalLineNumber)}" data-side="original">+</button>`
          : '';
        let rightCommentTrigger = right?.modifiedLineNumber
          ? `<button class="sn-source-diff-comment-btn" data-line="${escapeAttr(right.modifiedLineNumber)}" data-side="modified">+</button>`
          : '';
        let leftDiagnostics = renderDiagnostics(left);
        let rightDiagnostics = renderDiagnostics(right);

        htmlLines.push(`<tr class="sn-source-diff-row">`);
        
        // Left Column (Original)
        htmlLines.push(`<td class="sn-source-diff-gutter${leftClass}">${escapeHtml(leftOrigNum)}${leftDiagnostics}${leftCommentTrigger}</td>`);
        htmlLines.push(`<td class="sn-source-diff-code${leftClass}">${left ? escapeHtml(left.content) : ''}</td>`);
        
        // Right Column (Modified)
        htmlLines.push(`<td class="sn-source-diff-gutter${rightClass}">${escapeHtml(rightModNum)}${rightDiagnostics}${rightCommentTrigger}</td>`);
        htmlLines.push(`<td class="sn-source-diff-code${rightClass}">${right ? escapeHtml(right.content) : ''}</td>`);

        htmlLines.push(`</tr>`);
      });
    });

    htmlLines.push('</table>');
    return htmlLines.join('');
  }
}

SourceDiff.template = template;
SourceDiff.rootStyles = css;
SourceDiff.reg('sn-source-diff');

export default SourceDiff;
