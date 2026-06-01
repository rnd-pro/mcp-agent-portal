import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let ROOT = path.resolve(import.meta.dirname, '..', '..');

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('package exposes a production web build for published MCP installs', () => {
  let pkg = JSON.parse(readText('package.json'));

  assert.equal(pkg.scripts.build, 'node scripts/build-web.js');
  assert.equal(pkg.scripts.prepack, 'npm run build');
  assert.ok(pkg.devDependencies.esbuild, 'esbuild must stay a dev dependency');
});

test('npm package keeps the web build script and generated dist output', () => {
  let npmIgnore = readText('.npmignore');

  assert.equal(/^dist\/$/m.test(npmIgnore), false, 'published package must not ignore dist/');
  assert.match(npmIgnore, /^\.agent-portal\/$/m);
  assert.match(npmIgnore, /^\*\*\/\.project-graph-cache\.json$/m);
  assert.match(npmIgnore, /^!scripts\/build-web\.js$/m);
});

test('web build script bundles browser entrypoints without copying source modules', () => {
  let script = readText('scripts/build-web.js');

  assert.match(script, /bundle:\s*true/);
  assert.match(script, /target:\s*\['chrome120'\]/);
  assert.match(script, /'app\.js'/);
  assert.match(script, /entryNames:\s*'\[dir\]\/\[name\]'/);
  assert.ok(script.includes("entry.name.startsWith('.')"));
  assert.match(script, /entry\.name\.endsWith\('\.js'\)/);
});
