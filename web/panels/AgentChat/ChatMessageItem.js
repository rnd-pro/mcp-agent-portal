import Symbiote, { html } from '@symbiotejs/symbiote';
import { escapeHtml, formatMarkdown } from '../../utils/markdown-formatter.js';

function stringifyBlock(value) {
  if (value == null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function truncateResult(value) {
  let text = stringifyBlock(value);
  return text.length > 500 ? `${text.slice(0, 500)}\n...` : text;
}

export class ChatMessageItem extends Symbiote {
  init$ = {
    type: '',
    role: '',
    text: '',
    isStreaming: false,
    name: '',
    input: null,
    result: null,
    done: false,
    elapsedText: '',
    status: '',
    metaHtml: '',
    workSummaryHtml: '',
    copyText: '',
    taskIds: [],
    messageClass: 'message',
    bodyHtml: '',
  };

  renderCallback() {
    this.sub('type', () => this._renderBody());
    this.sub('role', () => this._renderBody());
    this.sub('text', () => this._renderBody());
    this.sub('isStreaming', () => this._renderBody());
    this.sub('name', () => this._renderBody());
    this.sub('input', () => this._renderBody());
    this.sub('result', () => this._renderBody());
    this.sub('done', () => this._renderBody());
    this.sub('elapsedText', () => this._renderBody());
    this.sub('status', () => this._renderBody());
    this.sub('metaHtml', () => this._renderBody());
    this.sub('workSummaryHtml', () => this._renderBody());
    this.sub('copyText', () => this._renderBody());
    this.sub('taskIds', () => this._renderBody());
  }

  _renderBody() {
    let role = this.$.role || this.$.type;
    this.$.messageClass = `message ${role || ''}${this.$.isStreaming ? ' streaming' : ''}`.trim();

    if (role === 'tool') {
      this.$.bodyHtml = this._renderTool();
    } else if (role === 'board') {
      this.$.bodyHtml = this._renderBoard();
    } else if (role === 'thinking') {
      this.$.bodyHtml = this._renderThinking();
    } else {
      this.$.bodyHtml = this._renderTextMessage();
    }
  }

  _renderTool() {
    let icon = this.$.isStreaming ? 'build_circle' : 'build';
    let spinClass = this.$.isStreaming ? 'spin-icon' : '';
    let openAttr = this.$.isStreaming ? ' open' : '';
    let htmlStr = `<details class="tool-card"${openAttr}>
      <summary class="tool-header"><span class="material-symbols-outlined ${spinClass}" style="font-size:14px">${icon}</span> ${escapeHtml(this.$.name || 'tool')}</summary>`;

    if (this.$.input) {
      htmlStr += `<div class="tool-section"><div class="tool-label">Input</div><pre class="tool-code">${escapeHtml(stringifyBlock(this.$.input))}</pre></div>`;
    }

    if (this.$.result) {
      htmlStr += `<div class="tool-section"><div class="tool-label">Result</div><pre class="tool-code">${escapeHtml(truncateResult(this.$.result))}</pre></div>`;
    } else if (this.$.isStreaming) {
      htmlStr += '<div class="tool-section tool-waiting"><em>Running...</em></div>';
    }

    return `${htmlStr}</details>`;
  }

  _renderBoard() {
    let tasksHtml = (this.$.taskIds || []).map((taskId) => {
      let statusIcon = this.$.isStreaming ? 'pending' : 'schedule';
      let spinClass = this.$.isStreaming ? 'spin-icon' : '';
      let statusText = this.$.isStreaming ? 'Running...' : 'Queued';
      let shortId = String(taskId).substring(0, 8);
      return `<div class="delegation-card" data-task-id="${escapeHtml(taskId)}" data-status="${this.$.isStreaming ? 'running' : 'idle'}">
        <div class="delegation-card-header">
          <span class="material-symbols-outlined ${spinClass}">${statusIcon}</span><span class="card-title">${escapeHtml(shortId)}...</span>
        </div>
        <div class="delegation-card-status">${statusText}</div>
        <div class="delegation-card-events"></div>
      </div>`;
    }).join('');

    return `<div class="delegation-board">${tasksHtml}</div>`;
  }

  _renderThinking() {
    let className = this.$.done ? 'work-summary' : 'thinking-block';
    let openAttr = this.$.done ? '' : ' open';
    let details = `<details class="${className}"${openAttr}>`;

    if (this.$.done) {
      details += `<summary><span class="material-symbols-outlined" style="font-size:16px;color:var(--sn-success-color)">check_circle</span>Worked for ${escapeHtml(this.$.elapsedText)}</summary>`;
    } else {
      let statusHtml = this.$.status ? `<span class="thinking-status">${escapeHtml(this.$.status)}</span>` : '';
      details += `<summary><span class="material-symbols-outlined spin-icon" style="font-size:16px">pending</span>Thinking for ${escapeHtml(this.$.elapsedText)}${statusHtml}</summary>`;
    }

    if (this.$.done && this.$.metaHtml) {
      details += `<div class="work-body">${this.$.metaHtml}</div>`;
    }

    details += '</details>';

    if (!this.$.done) return details;
    return this._wrapWorkSummary(details, this.$.copyText);
  }

  _renderTextMessage() {
    let cursor = this.$.isStreaming ? '<span class="streaming-cursor"></span>' : '';
    let summary = this.$.workSummaryHtml || '';
    return `<div class="msg-content">${formatMarkdown(this.$.text)}${cursor}</div>${summary}`;
  }

  _wrapWorkSummary(detailsHtml, copyText) {
    let copyBtn = copyText
      ? `<button class="work-copy-btn" type="button" title="Copy response" data-copy-text="${escapeHtml(copyText)}"><span class="material-symbols-outlined">content_copy</span></button>`
      : '';
    return `<div class="work-summary-wrap">${detailsHtml}${copyBtn}</div>`;
  }
}

ChatMessageItem.template = html`
<div ${{ className: 'messageClass', innerHTML: 'bodyHtml', onclick: '^onMessageItemClick' }}></div>
`;

ChatMessageItem.reg('chat-message-item');
