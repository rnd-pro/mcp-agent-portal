/**
 * Parse YAML frontmatter from markdown content.
 *
 * Supports the metadata subset used by Agent Portal agent and skill files:
 * scalars, inline arrays, multiline arrays, inline objects, and nested objects.
 *
 * @param {string} content
 * @returns {{ meta: object, frontmatter: object, body: string } | null}
 */
export function parseMarkdownFrontmatter(content) {
  if (!content || typeof content !== 'string') {
    throw new Error('Content must be a non-empty string');
  }

  let match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;

  let meta = parseYamlBlock(match[1]);
  let body = content.slice(match[0].length).trim();
  return { meta, frontmatter: meta, body };
}

/**
 * @param {string} block
 * @returns {object}
 */
export function parseYamlBlock(block) {
  let lines = String(block || '').split(/\r?\n/);
  return parseIndentedBlock(lines, 0, 0, lines.length).result;
}

function parseIndentedBlock(lines, baseIndent, start, end) {
  let result = {};
  let i = start;

  while (i < end) {
    let line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) {
      i++;
      continue;
    }

    let indent = line.search(/\S/);
    if (indent < baseIndent) break;
    if (indent > baseIndent) {
      i++;
      continue;
    }

    let keyMatch = line.match(/^(\s*)([\w][\w_-]*)\s*:\s*(.*)/);
    if (!keyMatch) {
      i++;
      continue;
    }

    let key = keyMatch[2];
    let value = keyMatch[3].trim();

    if (value.startsWith('[') && value.endsWith(']')) {
      result[key] = parseInlineArray(value);
      i++;
      continue;
    }

    if (value.startsWith('{') && value.endsWith('}')) {
      result[key] = parseInlineObject(value);
      i++;
      continue;
    }

    if (value) {
      result[key] = castValue(value);
      i++;
      continue;
    }

    i++;
    let childIndent = -1;
    for (let j = i; j < end; j++) {
      if (lines[j].trim() && !lines[j].trim().startsWith('#')) {
        childIndent = lines[j].search(/\S/);
        break;
      }
    }

    if (childIndent <= baseIndent) {
      result[key] = null;
      continue;
    }

    let childEnd = i;
    while (childEnd < end) {
      let childLine = lines[childEnd];
      if (!childLine.trim() || childLine.trim().startsWith('#')) {
        childEnd++;
        continue;
      }
      let childLineIndent = childLine.search(/\S/);
      if (childLineIndent < childIndent) break;
      childEnd++;
    }

    let childSlice = lines.slice(i, childEnd).filter((childLine) => childLine.trim());
    let isArray = childSlice.length > 0 && childSlice.every((childLine) => {
      let trimmed = childLine.trim();
      return trimmed.startsWith('- ') || trimmed === '';
    });

    if (isArray) {
      result[key] = childSlice
        .filter((childLine) => childLine.trim().startsWith('- '))
        .map((childLine) => castValue(childLine.trim().slice(2).trim()));
    } else {
      result[key] = parseIndentedBlock(lines, childIndent, i, childEnd).result;
    }

    i = childEnd;
  }

  return { result, nextLine: i };
}

function parseInlineArray(value) {
  let inner = value.slice(1, -1).trim();
  return inner ? smartSplit(inner, ',').map(castValue).filter((item) => item !== '') : [];
}

function parseInlineObject(value) {
  let inner = value.slice(1, -1).trim();
  let obj = {};
  for (let part of smartSplit(inner, ',')) {
    let colonIdx = part.indexOf(':');
    if (colonIdx === -1) continue;
    let key = part.slice(0, colonIdx).trim();
    let rawValue = part.slice(colonIdx + 1).trim();
    obj[key] = rawValue.startsWith('[') && rawValue.endsWith(']')
      ? parseInlineArray(rawValue)
      : castValue(rawValue);
  }
  return obj;
}

function smartSplit(str, delimiter) {
  let parts = [];
  let depth = 0;
  let current = '';

  for (let ch of str) {
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;

    if (ch === delimiter && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function castValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}
