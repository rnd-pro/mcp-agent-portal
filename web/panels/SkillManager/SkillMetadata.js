import { Symbiote } from '@symbiotejs/symbiote';
import 'symbiote-node/ui';
import { events } from '../../app.js';

const FRONTMATTER_KEYS = ['name', 'description', 'category', 'tags', 'applies_to', 'token_cost', 'autoload', 'resource_group'];

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

function makeEmptyState(message) {
  let node = document.createElement('sn-empty-state');
  node.textContent = message;
  return node;
}

function makeField(key, label, value) {
  let field = document.createElement('sn-field');
  let labelEl = document.createElement('label');
  labelEl.textContent = label;
  let input = document.createElement('input');
  input.dataset.metaKey = key;
  input.value = value == null ? '' : String(value);
  field.replaceChildren(labelEl, input);
  return field;
}

function makeAutoloadField(value) {
  let field = document.createElement('sn-field');
  let label = document.createElement('label');
  label.textContent = 'Autoload';

  let select = document.createElement('select');
  select.dataset.metaKey = 'autoload';
  for (let [optionValue, text] of [['', 'unset'], ['true', 'true'], ['false', 'false']]) {
    let option = document.createElement('option');
    option.value = optionValue;
    option.textContent = text;
    select.append(option);
  }
  select.value = value === true ? 'true' : value === false ? 'false' : '';

  field.replaceChildren(label, select);
  return field;
}

function makeRawField(rawValue) {
  let field = document.createElement('sn-field');
  let label = document.createElement('label');
  label.textContent = 'Raw Frontmatter';
  let textarea = document.createElement('textarea');
  textarea.dataset.rawFrontmatter = '';
  textarea.value = rawValue || '';
  field.replaceChildren(label, textarea);
  return field;
}

export class SkillMetadata extends Symbiote {
  initCallback() {
    this._renderEmpty('Select a markdown file');

    events.addEventListener('agent-portal-file-loaded', event => {
      this._current = event.detail;
      this.renderMetadata();
    });
  }

  renderMetadata() {
    let current = this._current;
    if (!current?.path) {
      this._renderEmpty('Select a markdown file');
      return;
    }
    if (!isMarkdown(current.path)) {
      this._renderEmpty('Frontmatter is available for markdown files.');
      return;
    }
    let fm = parseFrontmatter(current.content);
    let meta = parseYaml(fm.raw);
    let fields = document.createElement('div');
    fields.className = 'sm-fields';
    fields.replaceChildren(
      makeField('name', 'Name', meta.name || ''),
      makeField('description', 'Description', meta.description || ''),
      makeField('category', 'Category', meta.category || ''),
      makeField('tags', 'Tags', Array.isArray(meta.tags) ? meta.tags.join(', ') : (meta.tags || '')),
      makeField('applies_to', 'Applies To', meta.applies_to || ''),
      makeField('token_cost', 'Token Cost', meta.token_cost || ''),
      makeField('resource_group', 'Resource Group', meta.resource_group || ''),
      makeAutoloadField(meta.autoload),
      makeRawField(fm.raw),
    );
    this.ref.content.replaceChildren(fields);
    requestAnimationFrame(() => this._bindInputs());
  }

  _renderEmpty(message) {
    this.ref.content.replaceChildren(makeEmptyState(message));
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

SkillMetadata.template = `<div class="sm-content" ref="content"></div>`;

SkillMetadata.rootStyles = `
  pg-skill-metadata {
    display: block;
    height: 100%;
    overflow: hidden;
    background: var(--sn-bg);
  }
  pg-skill-metadata .sm-content {
    height: 100%;
    overflow: auto;
    padding: 12px;
    box-sizing: border-box;
  }
  pg-skill-metadata sn-empty-state {
    padding: 12px;
  }
  pg-skill-metadata textarea {
    font-family: var(--sn-font-mono);
  }
`;

SkillMetadata.reg('pg-skill-metadata');

export default SkillMetadata;
