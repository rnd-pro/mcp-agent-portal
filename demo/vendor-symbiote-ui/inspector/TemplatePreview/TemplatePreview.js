/**
 * TemplatePreview — live preview for template-builder node
 *
 * Shows placeholder chips (resolved/missing), test data input,
 * and interpolated preview text. Updates reactively.
 *
 * @module symbiote-ui/inspector/TemplatePreview
 */

import Symbiote from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import { template } from './TemplatePreview.tpl.js';
import { styles } from './TemplatePreview.css.js';
import { extractPlaceholders } from 'symbiote-engine/packs/transform/template-builder.handler.js';
import { translate } from '../../locale/index.js';

const DEFAULT_TEST_DATA = JSON.stringify(
  {
    status: 'created',
    region: 'RU',
    jobUid: '00c3b879-example',
    details: 'Test delivery',
    timestamp: new Date().toISOString(),
  },
  null,
  2
);

export class TemplatePreview extends Symbiote {
  init$ = {
    template: '',
    testData: DEFAULT_TEST_DATA,
    placeholderChips: [],
    previewText: '',
    noPlaceholders: true,
    placeholdersLabel: translate('templatePreview.placeholders'),
    emptyLabel: translate('templatePreview.empty'),
    testDataLabel: translate('templatePreview.testData'),
    previewLabel: translate('templatePreview.preview'),
  };

  renderCallback() {
    ensureMaterialSymbols(['data_object', 'sell', 'visibility']);

    /** @type {HTMLTextAreaElement|null} */
    let textarea = this.querySelector('.tpl-test-data');
    if (textarea) {
      textarea.value = this.$.testData;
      textarea.addEventListener('input', () => {
        this.$.testData = textarea.value;
      });
    }


    this.sub('template', () => this._updatePreview());
    this.sub('testData', () => this._updatePreview());
  }

  /**
   * Extract placeholders, interpolate template, update chips + preview.
   * @returns {void}
   */
  _updatePreview() {
    let tpl = this.$.template;
    let placeholders = extractPlaceholders(tpl);

    this.$.noPlaceholders = placeholders.length === 0;


    let data = {};
    try {
      data = JSON.parse(this.$.testData);
    } catch {
      this.$.previewText = '⚠️ Invalid JSON in test data';
      this.$.placeholderChips = placeholders.map((name) => ({ name }));
      this._applyChipColors([]);
      return;
    }


    let resolved = [];
    let chips = placeholders.map((name) => {
      let val = this._resolvePath(data, name);
      let isResolved = val !== undefined;
      if (isResolved) resolved.push(name);
      return { name };
    });

    this.$.placeholderChips = chips;


    requestAnimationFrame(() => this._applyChipColors(resolved));


    if (!tpl) {
      this.$.previewText = '';
      return;
    }

    let text = tpl.replace(/\{\{?([^{}]+)\}?\}/g, (match, key) => {
      let trimmed = key.trim();
      let value = this._resolvePath(data, trimmed);
      if (value === undefined) return match;
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    });

    this.$.previewText = text;
  }

  /**
   * Apply data-missing attribute to chip elements based on resolved status.
   *
   * @param {string[]} resolved - Names of resolved placeholders
   */
  _applyChipColors(resolved) {
    let chipEls = this.querySelectorAll('.tpl-chip');
    chipEls.forEach((el) => {
      let name = el.textContent?.trim();
      if (name && !resolved.includes(name)) {
        el.setAttribute('data-missing', '');
      } else {
        el.removeAttribute('data-missing');
      }
    });
  }

  /**
   * Resolve a dot-notation path in an object.
   *
   * @param {Object} obj - Data object
   * @param {string} path - Dot-separated path
   * @returns {*} Resolved value or undefined
   */
  _resolvePath(obj, path) {
    return path.split('.').reduce((o, k) => {
      if (o === null || o === undefined) return undefined;
      return o[k];
    }, obj);
  }
}

TemplatePreview.template = template;
TemplatePreview.rootStyles = styles;
TemplatePreview.reg('template-preview');
