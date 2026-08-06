import Symbiote from '@symbiotejs/symbiote';
import '../CodeBlock/CodeBlock.js';
import '../OutputGraphPreview/OutputGraphPreview.js';
import '../OutputListPreview/OutputListPreview.js';
import template from './EventFeedItem.tpl.js';
import css from './EventFeed.css.js';

function formatTime(value) {
  if (!value) return '';
  let date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString('en', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function stringifyArgs(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function truncate(value, limit = 500) {
  let text = String(value ?? '');
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function normalizeMode(value) {
  let mode = String(value ?? '').trim();
  if (['code', 'graph', 'list', 'raw', 'error', 'empty'].includes(mode)) return mode;
  return 'raw';
}

export class EventFeedItem extends Symbiote {
  init$ = {
    '@eventData': null,
    isCall: true,
    tool: '',
    argsText: '',
    timeText: '',
    durationText: '',
    success: true,
    mode: 'empty',
    errorText: '',
    rawOutput: '',
  };

  renderCallback() {
    this.sub('@eventData', (value) => {
      if (!value) return;
      try {
        this.setEvent(JSON.parse(value));
      } catch {
        this.setEvent(null);
      }
    });
  }

  setEvent(event) {
    let data = event && typeof event === 'object' ? event : {};
    let isCall = data.direction === 'call' || data.type === 'tool_call';
    let preview = data.preview && typeof data.preview === 'object' ? data.preview : {};
    let mode = isCall ? 'empty' : normalizeMode(preview.type);
    if (!isCall && data.success === false) mode = 'error';

    this.set$({
      isCall,
      tool: String(data.tool ?? ''),
      argsText: stringifyArgs(data.argsText ?? data.args),
      timeText: data.timeText ? String(data.timeText) : formatTime(data.timestamp ?? data.ts),
      durationText: data.durationText ? String(data.durationText) : '',
      success: data.success !== false,
      mode,
      errorText: truncate(preview.error ?? preview.value ?? data.error ?? 'Error'),
      rawOutput: truncate(preview.value ?? ''),
    });

    this.toggleAttribute('data-is-call', isCall);
    this.toggleAttribute('data-success', data.success !== false);
    this.#renderPreview(mode, preview);
  }

  #renderPreview(mode, preview) {
    if (mode === 'code') {
      this.ref.codePreview?.set$({
        lang: String(preview.lang ?? 'plain'),
        code: String(preview.value ?? ''),
      });
    } else if (mode === 'graph') {
      let graph = this.ref.graphPreview;
      if (graph?.setValue) {
        graph.$.title = String(preview.title ?? 'Graph output');
        graph.setValue(preview.value);
      }
    } else if (mode === 'list') {
      let list = this.ref.listPreview;
      if (list?.setValue) {
        list.$.title = String(preview.title ?? 'List output');
        list.setValue(preview.value);
      }
    }
  }
}

EventFeedItem.template = template;
EventFeedItem.rootStyles = css;
EventFeedItem.reg('sn-event-feed-item');

export default EventFeedItem;
