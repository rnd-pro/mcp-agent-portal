import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

let repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let expectedExports = [
  'createXRPortablePanelStore',
  'verifyXRPortablePanelReceipt',
  'verifyXRPortablePanelStateSnapshot',
  'createXRFrameTimingTracker',
  'createXRThreeWebXRAdapter',
  'createXRThreeSessionController',
  'createXRThreeInteractionReadinessSummary',
];
let expectedSchemas = [
  'schemas/xr-final-session-snapshot-v1.json',
  'schemas/xr-frame-timing-v1.json',
  'schemas/xr-portable-panel-receipt-v1.json',
  'schemas/xr-portable-panel-state-v1.json',
];
let expectedSchemaVersions = expectedSchemas
  .map((path) => path.replace(/^schemas\//, '').replace(/\.json$/, ''))
  .sort();

function run(command, args, options = {}) {
  let result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

function digest(algorithm, bytes, encoding = 'hex') {
  return createHash(algorithm).update(bytes).digest(encoding);
}

test('J2 packed artifact exposes the complete XR contract to an isolated consumer', async (t) => {
  let temporaryRoot = await mkdtemp(join(tmpdir(), 'symbiote-ui-j2-package-'));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));

  let statusBefore = run('git', [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
  ]).stdout;
  let worktreeDiffBefore = run('git', ['diff', '--binary', '--no-ext-diff']).stdout;
  let indexDiffBefore = run('git', ['diff', '--cached', '--binary', '--no-ext-diff']).stdout;
  let sourceIndexPath = join(repoRoot, 'xr', 'index.js');
  let sourceIndexBefore = digest('sha256', await readFile(sourceIndexPath));
  let packResult = run('npm', [
    'pack',
    '--json',
    '--ignore-scripts',
    '--pack-destination',
    temporaryRoot,
  ]);
  let packs = JSON.parse(packResult.stdout);
  assert.equal(packs.length, 1);
  let pack = packs[0];
  let sourceManifest = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(pack.name, 'symbiote-ui');
  assert.equal(pack.version, sourceManifest.version);
  assert.match(pack.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/);
  assert.match(pack.shasum, /^[0-9a-f]{40}$/);
  assert.ok(Number.isFinite(pack.size) && pack.size > 0, 'packed size must be finite and positive');
  assert.ok(
    Number.isFinite(pack.unpackedSize) && pack.unpackedSize > 0,
    'unpacked size must be finite and positive',
  );
  assert.ok(Array.isArray(pack.files) && pack.files.length > 0, 'pack file list must be non-empty');

  let tarballPath = join(temporaryRoot, pack.filename);
  let tarballBytes = await readFile(tarballPath);
  let artifactSha256 = digest('sha256', tarballBytes);
  assert.match(artifactSha256, /^[0-9a-f]{64}$/);
  assert.equal(digest('sha1', tarballBytes), pack.shasum);
  assert.equal(`sha512-${digest('sha512', tarballBytes, 'base64')}`, pack.integrity);

  let tarManifest = run('tar', ['-tzf', tarballPath]).stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  let reportedFiles = new Set(pack.files.map((entry) => entry.path));
  for (let schema of expectedSchemas) {
    assert.ok(reportedFiles.has(schema), `npm manifest omits ${schema}`);
    assert.ok(tarManifest.includes(`package/${schema}`), `tar manifest omits ${schema}`);
  }

  run('tar', ['-xzf', tarballPath, '-C', temporaryRoot]);
  let extractedRoot = join(temporaryRoot, 'package');
  let extractedManifest = JSON.parse(await readFile(join(extractedRoot, 'package.json'), 'utf8'));
  assert.equal(extractedManifest.name, pack.name);
  assert.equal(extractedManifest.version, pack.version);
  assert.ok(extractedManifest.exports?.['./xr'], 'packed manifest must export symbiote-ui/xr');
  assert.ok(
    extractedManifest.exports?.['./manifest'],
    'packed manifest must export symbiote-ui/manifest',
  );

  let consumerRoot = join(temporaryRoot, 'consumer');
  await mkdir(join(consumerRoot, 'node_modules'), { recursive: true });
  await symlink(extractedRoot, join(consumerRoot, 'node_modules', 'symbiote-ui'), 'dir');
  await writeFile(join(consumerRoot, 'package.json'), JSON.stringify({ type: 'module' }));
  await writeFile(
    join(consumerRoot, 'smoke.mjs'),
    [
      "import * as xr from 'symbiote-ui/xr';",
      "import { XR_SPATIAL_EVIDENCE_CONTRACT } from 'symbiote-ui/manifest';",
      `let expected = ${JSON.stringify(expectedExports)};`,
      `let expectedSchemas = ${JSON.stringify(expectedSchemaVersions)};`,
      "for (let name of expected) {",
      "  if (typeof xr[name] !== 'function') throw new Error(`Missing public XR function: ${name}`);",
      '}',
      "let schemas = XR_SPATIAL_EVIDENCE_CONTRACT?.schemas?.map((entry) => entry.version).sort();",
      "for (let version of expectedSchemas) {",
      "  if (!schemas?.includes(version)) throw new Error(`Missing public XR schema contract: ${version}`);",
      '}',
      "process.stdout.write(JSON.stringify({ exports: expected, ok: true, schemas: expectedSchemas }));",
      '',
    ].join('\n'),
  );
  let consumerResult = run(process.execPath, ['smoke.mjs'], { cwd: consumerRoot });
  assert.deepEqual(JSON.parse(consumerResult.stdout), {
    exports: expectedExports,
    ok: true,
    schemas: expectedSchemaVersions,
  });

  let sourceIndexAfter = digest('sha256', await readFile(sourceIndexPath));
  assert.equal(sourceIndexAfter, sourceIndexBefore, 'package gate must not mutate xr/index.js');
  assert.equal(
    run('git', ['status', '--porcelain=v1', '--untracked-files=all']).stdout,
    statusBefore,
    'npm pack must preserve the complete dirty worktree status',
  );
  assert.equal(
    run('git', ['diff', '--binary', '--no-ext-diff']).stdout,
    worktreeDiffBefore,
    'npm pack must preserve unstaged tracked content',
  );
  assert.equal(
    run('git', ['diff', '--cached', '--binary', '--no-ext-diff']).stdout,
    indexDiffBefore,
    'npm pack must preserve the index',
  );
  t.diagnostic(JSON.stringify({
    artifactSha256,
    fileCount: pack.files.length,
    integrity: pack.integrity,
    shasum: pack.shasum,
    filename: pack.filename,
    size: pack.size,
    unpackedSize: pack.unpackedSize,
  }));
});
