import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PACKAGE_ROOT = path.join(ROOT, 'packages/symbiote-node');
const PACKAGE_JSON = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
const SCAN_ROOTS = ['web', 'src', 'demo', 'scripts'];
const SKIP_DIRS = new Set(['.git', 'node_modules', 'tmp', 'dist', 'build', 'coverage']);
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.html']);

function packageExportSpecifiers() {
  let specifiers = new Set();
  let wildcardPrefixes = [];
  for (let key of Object.keys(PACKAGE_JSON.exports || {})) {
    if (key === '.') {
      specifiers.add(PACKAGE_JSON.name);
      continue;
    }
    let subpath = key.slice(2);
    if (subpath.endsWith('/*')) {
      wildcardPrefixes.push(`${PACKAGE_JSON.name}/${subpath.slice(0, -1)}`);
    } else {
      specifiers.add(`${PACKAGE_JSON.name}/${subpath}`);
    }
  }
  return { specifiers, wildcardPrefixes };
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  let out = [];
  for (let entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        out.push(...walk(path.join(dir, entry.name)));
      }
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function importSpecifiers(source) {
  let specs = [];
  let patterns = [
    /\bimport\s+(?:[^'"]*?\s+from\s*)?['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"]*?\s+from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (let pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      specs.push(match[1]);
    }
  }
  return specs;
}

function isPublicSpecifier(specifier, publicExports) {
  if (publicExports.specifiers.has(specifier)) return true;
  return publicExports.wildcardPrefixes.some((prefix) => specifier.startsWith(prefix));
}

function resolvesInsidePackage(file, specifier) {
  if (!specifier.startsWith('.')) return false;
  let resolved = path.resolve(path.dirname(file), specifier);
  let rel = path.relative(PACKAGE_ROOT, resolved);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

describe('symbiote-node provider consumer boundary', () => {
  it('uses package exports instead of private package paths', () => {
    let publicExports = packageExportSpecifiers();
    let files = SCAN_ROOTS.flatMap((dir) => walk(path.join(ROOT, dir)));
    let violations = [];

    for (let file of files) {
      let source = fs.readFileSync(file, 'utf8');
      for (let specifier of importSpecifiers(source)) {
        let isSymbiotePackage = specifier === PACKAGE_JSON.name || specifier.startsWith(`${PACKAGE_JSON.name}/`);
        if (isSymbiotePackage && !isPublicSpecifier(specifier, publicExports)) {
          violations.push(`${path.relative(ROOT, file)} imports non-exported ${specifier}`);
        }
        if (specifier.startsWith('packages/symbiote-node/') || resolvesInsidePackage(file, specifier)) {
          violations.push(`${path.relative(ROOT, file)} imports private package path ${specifier}`);
        }
      }
    }

    assert.deepEqual(violations, []);
  });
});
