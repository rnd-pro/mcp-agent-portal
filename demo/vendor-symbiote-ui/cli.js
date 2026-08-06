#!/usr/bin/env node

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { cmdDiscover, validateComponent } from './discover.js';
import { cmdAudit } from './audit.js';
import { analyzeGraphLayout } from './graph/layout-quality.js';
import { diffTokenCatalogs, formatTokenChangelog } from './tokens/token-lifecycle.js';

let command = process.argv[2] || 'discover';

function readFlag(name) {
  let index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

function readJsonFile(file, label) {
  let source;
  try {
    source = readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read ${label} "${file}": ${error.message}`);
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Unable to parse ${label} "${file}" as JSON: ${error.message}`);
  }
}

let modulePath = fileURLToPath(import.meta.url);
let argvPath = process.argv[1] || '';
let isMain = modulePath === argvPath;

if (!isMain && argvPath) {
  try {
    isMain = modulePath === realpathSync(argvPath);
  } catch (error) {
    void error;
  }
}

if (isMain && command === 'discover') {
  let result = await cmdDiscover({});
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} else if (isMain && command === 'audit') {
  let result = await cmdAudit({ profile: readFlag('profile') });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.valid) {
    process.exit(1);
  }
} else if (isMain && command === 'validate') {
  let file = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : readFlag('component');
  if (!file) {
    console.error('Usage: symbiote-ui validate <component.css.js> [--profile <register>]');
    process.exit(1);
  }
  let css = readFileSync(file, 'utf-8');
  let result = validateComponent({ css, file, profile: readFlag('profile'), family: readFlag('family') });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.valid) {
    process.exit(1);
  }
} else if (isMain && command === 'layout-audit') {
  let file = process.argv[3] && !process.argv[3].startsWith('--')
    ? process.argv[3]
    : readFlag('snapshot');
  if (!file) {
    console.error('Usage: symbiote-ui layout-audit <graph-layout-snapshot.json>');
    process.exit(1);
  }
  let result = analyzeGraphLayout(readJsonFile(file, 'graph layout snapshot'));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.pass) {
    process.exit(1);
  }
} else if (isMain && command === 'token-diff') {
  let [oldPath, newPath] = [process.argv[3], process.argv[4]];
  if (!oldPath || !newPath) {
    console.error('Usage: symbiote-ui token-diff <old-catalog.json> <new-catalog.json>');
    process.exit(1);
  }
  let oldCatalog = JSON.parse(readFileSync(oldPath, 'utf-8'));
  let newCatalog = JSON.parse(readFileSync(newPath, 'utf-8'));
  let diff = diffTokenCatalogs(oldCatalog, newCatalog);
  process.stdout.write(formatTokenChangelog(diff) + '\n');
  if (diff.breaking) {
    process.exit(2);
  }
} else if (isMain) {
  console.log(`symbiote-ui CLI

Commands:
  discover    Output provider metadata as JSON
  audit       Audit package rules, metadata, and CSS style tokens
  validate    Validate a component CSS file against the geometry scale
  layout-audit  Analyze a graph layout snapshot and emit a quality report
  token-diff  Diff two token catalogs (rename-aware) and print a changelog
`);
  if (command && command !== '--help' && command !== '-h') process.exit(1);
}
