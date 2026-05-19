import { Symbiote } from '@symbiotejs/symbiote';
import { events } from '../../app.js';

const FRONTMATTER_KEYS = ['name', 'description', 'category', 'tags', 'applies_to', 'token_cost', 'autoload', 'resource_group'];

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function parseFrontmatter(content) {
  let match = String(content || '').match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { raw: '', body: content || '' };
  return { raw: match[1], body: content.slice(match[0].length) };
}

function parseYamlScalar(value) {
  let text = String(value ?? '').trim();
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text.startsWith('[') && text.endsWith(']')) {
    return text.slice(1, -1).split(',').map(item => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }
  return text.replace(/^['"]|['"]$/g, '');
}

function parseYaml(raw) {
  let meta = {};
  let currentKey = null;
  for (let line of String(raw || '').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    let listMatch = line.match(/^\s*-\s*(.*)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
      meta[currentKey].push(parseYamlScalar(listMatch[1]));
      continue;
    }
    let pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) continue;
    currentKey = pair[1];
    meta[currentKey] = pair[2] ? parseYamlScalar(pair[2]) : [];
  }
  return meta;
}

function yamlValue(value) {
  if (Array.isArray(value)) return `[${value.map(item => JSON.stringify(String(item))).join(', ')}]`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value == null) return '';
  let text = String(value);
  return /[:#[\]{},\n]|^\s|\s$/.test(text) ? JSON.stringify(text) : text;
}

function serializeYaml(meta) {
  return Object.entries(meta)
    .filter(([, value]) => Array.isArray(value) ? value.length : value !== undefined && value !== null && String(value) !== '')
    .map(([key, value]) => `${key}: ${yamlValue(value)}`)
    .join('\n');
}

function isMarkdown(path) {
  return /\.(md|markdown)$/i.test(path || '');
}

export class SkillMetadata extends Symbiote {
  init$ = {
    contentHTML: '<div class="pg-placeholder">Select a markdown file</div>'
  };

  initCallback() {
    events.addEventListener('agent-portal-file-loaded', event => {
      this._current = event.detail;
      this.renderMetadata();
    });
  }

  renderMetadata() {
    let current = this._current;
    if (!current?.path) {
      this.$.contentHTML = '<div class="pg-placeholder">Select a markdown file</div>';
      return;
    }
    if (!isMarkdown(current.path)) {
      this.$.contentHTML = '<div class="pg-placeholder">Frontmatter is available for markdown files.</div>';
      return;
    }
    let fm = parseFrontmatter(current.content);
    let meta = parseYaml(fm.raw);
    this.$.contentHTML = `
      <div class="sm-fields">
        ${this._field('name', 'Name', meta.name || '')}
        ${this._field('description', 'Description', meta.description || '')}
        ${this._field('category', 'Category', meta.category || '')}
        ${this._field('tags', 'Tags', Array.isArray(meta.tags) ? meta.tags.join(', ') : (meta.tags || ''))}
        ${this._field('applies_to', 'Applies To', meta.applies_to || '')}
        ${this._field('token_cost', 'Token Cost', meta.token_cost || '')}
        ${this._field('resource_group', 'Resource Group', meta.resource_group || '')}
        <label class="sm-field">
          <span>Autoload</span>
          <select data-meta-key="autoload">
            <option value="" ${meta.autoload === undefined ? 'selected' : ''}>unset</option>
            <option value="true" ${meta.autoload === true ? 'selected' : ''}>true</option>
            <option value="false" ${meta.autoload === false ? 'selected' : ''}>false</option>
          </select>
        </label>
        <label class="sm-field">
          <span>Raw Frontmatter</span>
          <textarea data-raw-frontmatter>${esc(fm.raw)}</textarea>
        </label>
      </div>
    `;
    requestAnimationFrame(() => this._bindInputs());
  }

  _field(key, label, value) {
    return `
      <label class="sm-field">
        <span>${esc(label)}</span>
        <input data-meta-key="${esc(key)}" value="${esc(value)}">
      </label>
    `;
  }

  _bindInputs() {
    this.querySelectorAll('[data-meta-key]').forEach(input => {
      input.oninput = () => this._applyFields();
      input.onchange = () => this._applyFields();
    });
    let raw = this.querySelector('[data-raw-frontmatter]');
    if (raw) raw.oninput = () => this._applyRaw(raw.value);
  }

  _editor() {
    return document.querySelector('pg-skill-manager');
  }

  _body() {
    return parseFrontmatter(this._current?.content || '').body;
  }

  _applyRaw(raw) {
    let content = raw.trim() ? `---\n${raw.trim()}\n---\n\n${this._body().replace(/^\n+/, '')}` : this._body();
    this._current.content = content;
    this._editor()?.applyContent(content);
  }

  _applyFields() {
    let rawInput = this.querySelector('[data-raw-frontmatter]');
    let meta = parseYaml(rawInput?.value || '');
    for (let key of FRONTMATTER_KEYS) {
      let input = this.querySelector(`[data-meta-key="${key}"]`);
      if (!input) continue;
      if (key === 'tags') meta[key] = input.value.split(',').map(tag => tag.trim()).filter(Boolean);
      else if (key === 'autoload') {
        if (input.value === '') delete meta[key];
        else meta[key] = input.value === 'true';
      } else meta[key] = input.value.trim();
    }
    let raw = serializeYaml(meta);
    if (rawInput) rawInput.value = raw;
    this._applyRaw(raw);
  }
}

SkillMetadata.template = `<div class="sm-content" bind="innerHTML: contentHTML"></div>`;

SkillMetadata.rootStyles = `
  pg-skill-metadata {
    display: block;
    height: 100%;
    overflow: hidden;
    background: var(--sn-bg, hsl(37, 30%, 96%));
  }
  pg-skill-metadata .sm-content {
    height: 100%;
    overflow: auto;
    padding: 12px;
    box-sizing: border-box;
  }
  pg-skill-metadata .pg-placeholder {
    padding: 12px;
    color: var(--sn-text-dim, hsl(30, 10%, 45%));
    font-size: 12px;
  }
  pg-skill-metadata .sm-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 12px;
  }
  pg-skill-metadata .sm-field span {
    font-size: 10px;
    font-weight: 650;
    text-transform: uppercase;
    color: var(--sn-text-dim, hsl(30, 10%, 45%));
  }
  pg-skill-metadata input,
  pg-skill-metadata select,
  pg-skill-metadata textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--sn-node-border, hsl(35, 18%, 80%));
    border-radius: 4px;
    background: var(--sn-node-bg, hsl(37, 25%, 93%));
    color: var(--sn-text, hsl(30, 15%, 18%));
    font: inherit;
    font-size: 12px;
    padding: 6px 7px;
    outline: 0;
  }
  pg-skill-metadata textarea {
    min-height: 110px;
    resize: vertical;
    font-family: 'SF Mono', 'Fira Code', monospace;
    line-height: 1.45;
  }
`;

SkillMetadata.reg('pg-skill-metadata');

export default SkillMetadata;
