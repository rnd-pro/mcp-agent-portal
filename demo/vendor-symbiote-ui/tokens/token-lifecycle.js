/**
 * Token lifecycle: rename-aware diffing of DTCG catalogs.
 *
 * A published token set needs deprecate/rename semantics, not silent breaks.
 * `$extensions.sn.uuid` is the stable identity: when a token's name changes but
 * its uuid is unchanged it is a rename, not a delete+add. Deletes and `$type`
 * changes are breaking; deprecations and value tweaks are not.
 *
 * Node-safe and DOM-free.
 *
 * @module symbiote-ui/tokens/token-lifecycle
 */

function normalizeValue(value) {
  if (value && typeof value === 'object' && 'value' in value) {
    return `${value.value}${value.unit ?? ''}`;
  }
  return String(value);
}

/**
 * Flatten a DTCG catalog into a list of leaf tokens, inheriting `$type` from
 * the nearest ancestor group.
 * @param {Object} catalog
 * @returns {Array<{name:string,uuid:?string,value:string,type:?string,deprecated:boolean,path:string}>}
 */
export function flattenTokens(catalog) {
  let tokens = [];
  walk(catalog, null, '', tokens);
  return tokens;
}

function walk(node, inheritedType, path, out) {
  if (!node || typeof node !== 'object') return;
  let type = node.$type ?? inheritedType;
  if ('$value' in node) {
    let sn = node.$extensions?.sn ?? {};
    out.push({
      name: sn.token ?? path,
      uuid: sn.uuid ?? null,
      value: normalizeValue(node.$value),
      type: type ?? null,
      deprecated: Boolean(node.$deprecated),
      path,
    });
    return;
  }
  for (let [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    walk(child, type, path ? `${path}.${key}` : key, out);
  }
}

function indexBy(tokens, key) {
  let map = new Map();
  for (let token of tokens) {
    if (token[key] != null) map.set(token[key], token);
  }
  return map;
}

/**
 * Diff two DTCG catalogs into lifecycle buckets.
 * @param {Object} oldCatalog
 * @param {Object} newCatalog
 * @returns {{added:Array,deleted:Array,renamed:Array,deprecated:Array,updated:Array,breaking:boolean}}
 */
export function diffTokenCatalogs(oldCatalog, newCatalog) {
  let oldTokens = flattenTokens(oldCatalog);
  let newTokens = flattenTokens(newCatalog);
  let oldByName = indexBy(oldTokens, 'name');
  let newByName = indexBy(newTokens, 'name');
  let oldByUuid = indexBy(oldTokens, 'uuid');
  let newByUuid = indexBy(newTokens, 'uuid');

  let renamed = [];
  for (let [uuid, oldToken] of oldByUuid) {
    let newToken = newByUuid.get(uuid);
    if (newToken && newToken.name !== oldToken.name) {
      renamed.push({ uuid, from: oldToken.name, to: newToken.name });
    }
  }
  let renamedFrom = new Set(renamed.map((entry) => entry.from));
  let renamedTo = new Set(renamed.map((entry) => entry.to));

  let added = newTokens
    .filter((token) => !oldByName.has(token.name) && !renamedTo.has(token.name))
    .map((token) => ({ name: token.name, value: token.value }));

  let deleted = oldTokens
    .filter((token) => !newByName.has(token.name) && !renamedFrom.has(token.name))
    .map((token) => ({ name: token.name, value: token.value }));

  let deprecated = newTokens
    .filter((token) => token.deprecated && !oldByName.get(token.name)?.deprecated)
    .map((token) => ({ name: token.name }));

  let updated = [];
  let typeChanges = [];
  for (let [name, newToken] of newByName) {
    let oldToken = oldByName.get(name);
    if (!oldToken) continue;
    if (oldToken.value !== newToken.value) {
      updated.push({ name, from: oldToken.value, to: newToken.value });
    }
    if (oldToken.type !== newToken.type) {
      typeChanges.push({ name, from: oldToken.type, to: newToken.type });
    }
  }

  let breaking = deleted.length > 0 || typeChanges.length > 0;

  return { added, deleted, renamed, deprecated, updated, typeChanges, breaking };
}

/**
 * Render a token diff as a Markdown changelog.
 * @param {ReturnType<typeof diffTokenCatalogs>} diff
 * @returns {string}
 */
export function formatTokenChangelog(diff) {
  let lines = ['# Token changelog', ''];
  lines.push(`**${diff.breaking ? 'BREAKING' : 'Non-breaking'}** — `
    + `${diff.added.length} added, ${diff.deleted.length} deleted, `
    + `${diff.renamed.length} renamed, ${diff.deprecated.length} deprecated, ${diff.updated.length} updated.`);
  lines.push('');

  let section = (title, items, render) => {
    if (!items.length) return;
    lines.push(`## ${title}`);
    for (let item of items) lines.push(`- ${render(item)}`);
    lines.push('');
  };

  section('Deleted (breaking)', diff.deleted, (item) => `\`${item.name}\` (was \`${item.value}\`)`);
  section('Type changes (breaking)', diff.typeChanges, (item) => `\`${item.name}\`: \`${item.from}\` → \`${item.to}\``);
  section('Renamed', diff.renamed, (item) => `\`${item.from}\` → \`${item.to}\``);
  section('Deprecated', diff.deprecated, (item) => `\`${item.name}\``);
  section('Added', diff.added, (item) => `\`${item.name}\` (\`${item.value}\`)`);
  section('Updated', diff.updated, (item) => `\`${item.name}\`: \`${item.from}\` → \`${item.to}\``);

  return lines.join('\n').trimEnd() + '\n';
}
