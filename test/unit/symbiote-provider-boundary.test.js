import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PACKAGE_ROOT = path.join(ROOT, 'node_modules/symbiote-node');
const PACKAGE_JSON = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
const SCAN_ROOTS = ['web', 'src', 'demo', 'scripts'];
const SKIP_DIRS = new Set(['.git', 'node_modules', 'tmp', 'dist', 'build', 'coverage']);
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.html']);
const IMPORT_MAP_FILES = ['web/index.html', 'demo/index.html', 'demo/build.js'];
const BROWSER_FORBIDDEN_SPECIFIERS = new Set([
  'symbiote-node/engine',
]);

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

function importMapEntries(source) {
  let entries = new Set();
  let pattern = /"([^"]+)":\s*"[^"]*packages\/symbiote-node\//g;
  let match;
  while ((match = pattern.exec(source))) {
    entries.add(match[1]);
  }
  return entries;
}

describe('symbiote-node provider consumer boundary', () => {
  it('uses package exports instead of private package paths', () => {
    let publicExports = packageExportSpecifiers();
    let files = SCAN_ROOTS.flatMap((dir) => walk(path.join(ROOT, dir)));
    let violations = [];

	    for (let file of files) {
	      let source = fs.readFileSync(file, 'utf8');
	      for (let specifier of importSpecifiers(source)) {
	        if (file.includes(`${path.sep}web${path.sep}`) && BROWSER_FORBIDDEN_SPECIFIERS.has(specifier)) {
	          violations.push(`${path.relative(ROOT, file)} imports browser-forbidden ${specifier}`);
	        }
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

  it('keeps browser import maps aligned to public package specifiers', () => {
    let publicExports = packageExportSpecifiers();
    let browserFiles = walk(path.join(ROOT, 'web'));
    let usedSpecifiers = new Set();

    for (let file of browserFiles) {
      let source = fs.readFileSync(file, 'utf8');
      for (let specifier of importSpecifiers(source)) {
        if (specifier === PACKAGE_JSON.name || specifier.startsWith(`${PACKAGE_JSON.name}/`)) {
          usedSpecifiers.add(specifier);
        }
      }
    }

    let violations = [];
    for (let repoPath of IMPORT_MAP_FILES) {
      let source = fs.readFileSync(path.join(ROOT, repoPath), 'utf8');
      let entries = importMapEntries(source);
	      if (entries.has(`${PACKAGE_JSON.name}/`)) {
	        violations.push(`${repoPath} exposes broad ${PACKAGE_JSON.name}/ import-map fallback`);
	      }
	      for (let specifier of BROWSER_FORBIDDEN_SPECIFIERS) {
	        if (entries.has(specifier)) {
	          violations.push(`${repoPath} maps browser-forbidden ${specifier}`);
	        }
	      }
      for (let specifier of usedSpecifiers) {
        if (!isPublicSpecifier(specifier, publicExports)) continue;
        if (!entries.has(specifier)) {
          violations.push(`${repoPath} is missing exact import-map entry for ${specifier}`);
        }
      }
      for (let specifier of entries) {
        if (!isPublicSpecifier(specifier, publicExports)) {
          violations.push(`${repoPath} maps non-exported ${specifier}`);
        }
      }
    }

    assert.deepEqual(violations, []);
  });
});
