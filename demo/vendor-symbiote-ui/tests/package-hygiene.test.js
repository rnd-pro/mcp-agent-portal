import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args, options = {}) {
  let result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  return result;
}

function assertNoPrivatePackFiles(files) {
  let blockedPatterns = [
    /^\.agent-portal(?:\/|$)/,
    /^\.gitmodules$/,
    /^tmp(?:\/|$)/,
    /(?:^|\/)delegation(?:\/|$)/,
    /(?:^|\/)audit(?:[-_]|\/)/i,
    /(?:^|\/)(?:scratch|probe|screenshot|session|private-memory)(?:[-_.]|\/|$)/i,
    /\.(?:png|jpe?g|webp|gif)$/i,
  ];
  for (let file of files) {
    assert.equal(file.includes('/Users/'), false, `packed file leaks local path: ${file}`);
    assert.equal(file.includes('team-memory'), false, `packed file leaks private memory name: ${file}`);
    assert.equal(
      blockedPatterns.some((pattern) => pattern.test(file)),
      false,
      `private or scratch file included in pack output: ${file}`
    );
  }
}

function parseGitFileList(output) {
  return output
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean);
}

function listPublicFilesAndPendingAdditions() {
  let listed = run('git', ['ls-files', '--cached', '--others', '--exclude-standard']);
  return parseGitFileList(listed.stdout);
}

async function readPublicFile(file) {
  try {
    return await readFile(join(repoRoot, file), 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return run('git', ['show', `:${file}`]).stdout;
  }
}

function isTextScanCandidate(file) {
  if (file === '.agent-portal') return false;
  if (file === '.gitmodules') return false;
  if (file === 'tests/package-hygiene.test.js') return false;
  return !/\.(?:avif|gif|jpe?g|png|svgz|tgz|ttf|woff2?|zip)$/i.test(file);
}

async function listTextFiles(root, dir = root) {
  let entries = await readdir(dir, { withFileTypes: true });
  let files = [];
  for (let entry of entries) {
    let fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listTextFiles(root, fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (/\.(?:ttf|png|jpe?g|webp|gif|tgz)$/i.test(entry.name)) continue;
    files.push(fullPath);
  }
  return files;
}

async function assertNoPrivatePackContent(packageDir) {
  let blockedPatterns = [
    /\/Users\//,
    /\.agent-portal/,
    /team-memory/i,
    /private memory/i,
    /Bearer\s+[A-Za-z0-9._-]+/,
    /(?:api[_-]?key|secret|token)\s*[:=]\s*['"](?!--)[A-Za-z0-9._-]{12,}/i,
    /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/,
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
    /\bnpm_[A-Za-z0-9]{20,}\b/,
  ];
  for (let file of await listTextFiles(packageDir)) {
    let text = await readFile(file, 'utf8');
    for (let pattern of blockedPatterns) {
      assert.equal(pattern.test(text), false, `packed file content failed hygiene scan: ${file}`);
    }
  }
}

test('public repository files and pending additions pass private hygiene scan', async () => {
  // Shared-clone architecture: team memory is a configured directory, not a
  // submodule. A .gitmodules may be absent; if present it must never expose a
  // remote URL or reference the private team-memory repository.
  let gitmodules = await readFile(join(repoRoot, '.gitmodules'), 'utf8').catch(() => '');
  assert.doesNotMatch(gitmodules, /https?:\/\/|git@/, '.gitmodules must not expose a remote URL');
  assert.doesNotMatch(gitmodules, /team-memory/i, '.gitmodules must not reference private team memory');

  let blockedPatterns = [
    { pattern: /\/Users\//, label: 'absolute local path' },
    { pattern: /\.agent-portal\//, label: 'private memory path' },
    { pattern: /team-memory/i, label: 'private memory repository name' },
    { pattern: /Bearer\s+[A-Za-z0-9._-]+/, label: 'bearer token' },
    { pattern: /(?:api[_-]?key|secret|token)\s*[:=]\s*['"](?!--)[A-Za-z0-9._-]{12,}/i, label: 'secret-looking assignment' },
    { pattern: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/, label: 'private key' },
    { pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/, label: 'GitHub token' },
    { pattern: /\bnpm_[A-Za-z0-9]{20,}\b/, label: 'npm token' },
  ];

  for (let file of listPublicFilesAndPendingAdditions().filter(isTextScanCandidate)) {
    let text = await readPublicFile(file);
    for (let { pattern, label } of blockedPatterns) {
      assert.equal(pattern.test(text), false, `${file} contains ${label}`);
    }
  }
});

test('npm pack output excludes private memory and scratch artifacts', async () => {
  let result = run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts']);
  let [pack] = JSON.parse(result.stdout);
  let files = pack.files.map((file) => file.path);
  let uiSource = await readFile(join(repoRoot, 'ui', 'index.js'), 'utf8');
  let uiDynamicImports = [...uiSource.matchAll(/import\(['"]\.\.\/([^'"]+)['"]\)/g)]
    .map((match) => match[1])
    .sort();

  assert.equal(pack.name, 'symbiote-ui');
  assert.ok(files.includes('package.json'));
  assert.ok(files.includes('custom-elements.json'));
  assert.ok(files.includes('index.js'));
  assert.ok(files.includes('cli.js'));
  assert.ok(files.includes('discover.js'));
  assert.ok(files.includes('audit.js'));
  assert.ok(files.includes('ui/index.js'));
  assert.ok(files.includes('runtime/index.js'));
  assert.ok(files.includes('manifest/component-registry.js'));
  assert.ok(files.includes('manifest/xr-spatial-schema-catalog.js'));
  assert.ok(files.includes('schemas/xr-spatial-placement-receipt-v1.json'));
  assert.ok(files.includes('schemas/xr-final-session-snapshot-v1.json'));
  assert.ok(files.includes('schemas/xr-frame-timing-v1.json'));
  assert.ok(files.includes('schemas/xr-portable-panel-receipt-v1.json'));
  assert.ok(files.includes('schemas/xr-portable-panel-state-v1.json'));
  for (let excludedPath of ['site/', '_site/', '.github/', 'tests/', 'scripts/']) {
    assert.equal(
      files.some((file) => file.startsWith(excludedPath)),
      false,
      `${excludedPath} must stay outside the runtime package`
    );
  }
  assert.equal(files.includes('project.cfg.js'), false);
  for (let importPath of uiDynamicImports) {
    assert.ok(files.includes(importPath), `ui dynamic import missing from pack output: ${importPath}`);
  }
  assertNoPrivatePackFiles(files);
});

test('packed package imports from a consumer project with SSR-safe entrypoints', async () => {
  let tmpRoot = await mkdtemp(join(tmpdir(), 'symbiote-ui-pack-'));
  try {
    let packResult = run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', tmpRoot]);
    let [pack] = JSON.parse(packResult.stdout);
    let tarball = join(tmpRoot, pack.filename);
    let packageDir = join(tmpRoot, 'package');
    let consumerDir = join(tmpRoot, 'consumer');
    let tmpNodeModules = join(tmpRoot, 'node_modules');

    run('tar', ['-xzf', tarball, '-C', tmpRoot]);
    await assertNoPrivatePackContent(packageDir);
    await mkdir(join(consumerDir, 'node_modules', '@symbiotejs'), { recursive: true });
    await mkdir(join(consumerDir, 'node_modules', '.bin'), { recursive: true });
    await mkdir(join(tmpNodeModules, '@symbiotejs'), { recursive: true });
    await symlink(packageDir, join(consumerDir, 'node_modules', 'symbiote-ui'), 'dir');
    await symlink(
      join('..', 'symbiote-ui', 'cli.js'),
      join(consumerDir, 'node_modules', '.bin', 'symbiote-ui')
    );
    await symlink(
      resolve(repoRoot, 'node_modules', '@symbiotejs', 'symbiote'),
      join(consumerDir, 'node_modules', '@symbiotejs', 'symbiote'),
      'dir'
    );
    await symlink(
      resolve(repoRoot, 'node_modules', 'symbiote-engine'),
      join(consumerDir, 'node_modules', 'symbiote-engine'),
      'dir'
    );
    await symlink(
      resolve(repoRoot, 'node_modules', '@symbiotejs', 'symbiote'),
      join(tmpNodeModules, '@symbiotejs', 'symbiote'),
      'dir'
    );
    await symlink(
      resolve(repoRoot, 'node_modules', 'symbiote-engine'),
      join(tmpNodeModules, 'symbiote-engine'),
      'dir'
    );

    let smoke = `
      const root = await import('symbiote-ui');
      const core = await import('symbiote-ui/core');
      const basePath = await import('symbiote-ui/core/base-path.js');
      const runtime = await import('symbiote-ui/runtime');
      const manifest = await import('symbiote-ui/manifest');
      const webmcp = await import('symbiote-ui/webmcp');
      const screencast = await import('symbiote-ui/ui/screencast-recorder.js');
      const tourScreencast = await import('symbiote-ui/ui/tour-screencast.js');
      const tourAudio = await import('symbiote-ui/ui/tour-audio-provider.js');
      const tourMedia = await import('symbiote-ui/ui/tour-media-renderer.js');

      const finalSessionSnapshot = await import('symbiote-ui/schemas/xr-final-session-snapshot-v1.json', { with: { type: 'json' } });
      const frameTiming = await import('symbiote-ui/schemas/xr-frame-timing-v1.json', { with: { type: 'json' } });
      const portablePanelReceipt = await import('symbiote-ui/schemas/xr-portable-panel-receipt-v1.json', { with: { type: 'json' } });
      const portablePanelState = await import('symbiote-ui/schemas/xr-portable-panel-state-v1.json', { with: { type: 'json' } });

      const xr = await import('symbiote-ui/xr');
      const spatialIndex = await import('symbiote-ui/xr/spatial-index');
      const spatialGraph = await import('symbiote-ui/xr/spatial-graph');
      const sphericalLayout = await import('symbiote-ui/xr/spherical-layout');
      const spatialDrag = await import('symbiote-ui/xr/spatial-drag-controller');
      const forceLayout = await import('symbiote-ui/xr/force-layout');
      const forceLayoutAdapter = await import('symbiote-ui/xr/force-layout-adapter');
      const dualView = await import('symbiote-ui/xr/dual-view-controller');
      const nativePanelLayout = await import('symbiote-ui/xr/native-panel-layout');
      const nativePanelRenderer = await import('symbiote-ui/xr/three-native-panel-renderer');
      const spatialSnapshot = await import('symbiote-ui/xr/spatial-snapshot');
      const spatialSnapshotCompile = await import('symbiote-ui/xr/spatial-snapshot-compile');
      const spatialParity = await import('symbiote-ui/xr/spatial-parity');
      const domSpatialCapture = await import('symbiote-ui/xr/dom-spatial-capture');
      const spatialContract = await import('symbiote-ui/xr/spatial-contract');
      const spatialMath = await import('symbiote-ui/xr/spatial-math');
      const spatialProjection = await import('symbiote-ui/xr/spatial-projection');
      const spatialEvidence = await import('symbiote-ui/xr/spatial-evidence');
      const spatialStability = await import('symbiote-ui/xr/spatial-stability');
      const xrPointer = await import('symbiote-ui/xr/pointer');

      if (typeof root.NodeEditor !== 'function') throw new Error('missing root NodeEditor');
      if (typeof core.NodeEditor !== 'function') throw new Error('missing core NodeEditor');
      if (typeof basePath.withAppBasePath !== 'function') throw new Error('missing core base-path helper');
      if (runtime.RUNTIME_UI_CONTRACT.version !== 'runtime-ui-v1') throw new Error('bad runtime contract');
      if (typeof manifest.listComponents !== 'function') throw new Error('missing manifest listComponents');
      if (typeof webmcp.createToolDescriptor !== 'function') throw new Error('missing webmcp helper');
      if (typeof screencast.installScreencastHotkeys !== 'function') throw new Error('missing screencast hotkey helper');
      if (typeof tourScreencast.recordTourScreencast !== 'function') throw new Error('missing tour screencast helper');
      if (typeof tourAudio.createTourAudioProvider !== 'function') throw new Error('missing tour audio provider registry');
      if (typeof tourAudio.createTourCueAudioProvider !== 'function') throw new Error('missing tour audio provider helper');
      if (typeof tourMedia.renderTourVideo !== 'function') throw new Error('missing tour media renderer helper');

      if (typeof xr.createOctree !== 'function') throw new Error('missing xr.createOctree');
      if (typeof spatialIndex.createOctree !== 'function') throw new Error('missing spatialIndex.createOctree');
      if (typeof spatialGraph.createSpatialGraphModel !== 'function') throw new Error('missing spatialGraph.createSpatialGraphModel');
      if (typeof sphericalLayout.createSphericalGraphLayout !== 'function') throw new Error('missing sphericalLayout.createSphericalGraphLayout');
      if (typeof spatialDrag.createSpatialDragController !== 'function') throw new Error('missing spatialDrag.createSpatialDragController');
      if (typeof forceLayout.createSimulation !== 'function') throw new Error('missing forceLayout.createSimulation');
      if (typeof forceLayoutAdapter.createForceLayoutAdapter !== 'function') throw new Error('missing forceLayoutAdapter.createForceLayoutAdapter');
      if (typeof dualView.createDualViewController !== 'function') throw new Error('missing dualView.createDualViewController');
      if (typeof nativePanelLayout.compileNativePanelPrimitives !== 'function') throw new Error('missing nativePanelLayout.compileNativePanelPrimitives');
      if (typeof nativePanelRenderer.createThreeNativePanelRenderer !== 'function') throw new Error('missing nativePanelRenderer.createThreeNativePanelRenderer');
      if (typeof spatialSnapshot.normalizeSpatialSnapshot !== 'function') throw new Error('missing spatialSnapshot.normalizeSpatialSnapshot');
      if (typeof spatialSnapshotCompile.compileSpatialSnapshot !== 'function') throw new Error('missing spatialSnapshotCompile.compileSpatialSnapshot');
      if (typeof spatialParity.createSpatialParityReport !== 'function') throw new Error('missing spatialParity.createSpatialParityReport');
      if (typeof domSpatialCapture.captureSpatialSnapshot !== 'function') throw new Error('missing domSpatialCapture.captureSpatialSnapshot');
      if (spatialContract.XR_SPATIAL_VERSIONS.audit !== 'xr-spatial-audit-v1') throw new Error('bad spatial contract');
      if (typeof spatialMath.relativeMatrix !== 'function') throw new Error('missing spatialMath.relativeMatrix');
      if (typeof spatialProjection.projectAxonometric !== 'function') throw new Error('missing spatialProjection.projectAxonometric');
      if (typeof spatialEvidence.verifyXRSpatialAuditEnvelope !== 'function') throw new Error('missing spatial audit verifier');
      if (typeof spatialStability.SpatialStabilityTracker !== 'function') throw new Error('missing spatial stability tracker');
      if (typeof xrPointer.createXRPlacementReceipt !== 'function') throw new Error('missing placement receipt creator');
      if (typeof xrPointer.verifyXRPlacementReceipt !== 'function') throw new Error('missing placement receipt verifier');
      if (typeof xr.createXRPlacementReceipt !== 'function') throw new Error('missing xr placement receipt export');

      if (typeof xr.createXRPortablePanelStore !== 'function') throw new Error('missing xr.createXRPortablePanelStore');
      if (typeof xr.verifyXRPortablePanelReceipt !== 'function') throw new Error('missing xr.verifyXRPortablePanelReceipt');
      if (typeof xr.verifyXRPortablePanelStateSnapshot !== 'function') throw new Error('missing xr.verifyXRPortablePanelStateSnapshot');
      if (typeof xr.createXRFrameTimingTracker !== 'function') throw new Error('missing xr.createXRFrameTimingTracker');
      if (typeof xr.createXRThreeWebXRAdapter !== 'function') throw new Error('missing xr.createXRThreeWebXRAdapter');
      if (typeof xr.createXRThreeSessionController !== 'function') throw new Error('missing xr.createXRThreeSessionController');
      if (typeof xr.createXRThreeInteractionReadinessSummary !== 'function') throw new Error('missing xr.createXRThreeInteractionReadinessSummary');

      if (!finalSessionSnapshot.default || typeof finalSessionSnapshot.default !== 'object') throw new Error('missing finalSessionSnapshot schema');
      if (!frameTiming.default || typeof frameTiming.default !== 'object') throw new Error('missing frameTiming schema');
      if (!portablePanelReceipt.default || typeof portablePanelReceipt.default !== 'object') throw new Error('missing portablePanelReceipt schema');
      if (!portablePanelState.default || typeof portablePanelState.default !== 'object') throw new Error('missing portablePanelState schema');

      const contractSchemas = manifest.XR_SPATIAL_EVIDENCE_CONTRACT?.schemas?.map((entry) => entry.version) || [];
      for (const version of ['xr-final-session-snapshot-v1', 'xr-frame-timing-v1', 'xr-portable-panel-receipt-v1', 'xr-portable-panel-state-v1']) {
        if (!contractSchemas.includes(version)) throw new Error('Missing public XR schema contract: ' + version);
      }
    `;
    run(process.execPath, ['--input-type=module', '-e', smoke], { cwd: consumerDir });
    let cli = run(process.execPath, [join('node_modules', '.bin', 'symbiote-ui'), 'discover'], { cwd: consumerDir });
    let data = JSON.parse(cli.stdout);
    assert.equal(data.command, 'discover');
    assert.equal(data.package.name, 'symbiote-ui');
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test('all public core subpath modules import in Node without DOM globals', async () => {
  let coreDir = resolve(repoRoot, 'core');
  let files = (await readdir(coreDir))
    .filter((file) => file.endsWith('.js'))
    .sort();
  assert.ok(files.includes('base-path.js'));

  for (let file of files) {
    await import(new URL(`../core/${file}`, import.meta.url).href);
  }
});

test('JSDA integration stays outside mandatory runtime dependencies', async () => {
  let pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies?.['jsda-kit'], undefined);
  assert.equal(pkg.peerDependencies?.['jsda-kit'], undefined);
  assert.equal(pkg.optionalDependencies?.['jsda-kit'], undefined);
  assert.equal(pkg.dependencies?.linkedom, undefined);
  assert.equal(pkg.peerDependencies?.linkedom, undefined);
});

test('browser component modules stay behind the explicit UI entrypoint DOM guard', async () => {
  let [rootSource, coreSource, uiSource] = await Promise.all([
    readFile(new URL('../index.js', import.meta.url), 'utf8'),
    readFile(new URL('../core/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../ui/index.js', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(rootSource, /from ['"]\.\/ui(?:\/index\.js)?['"]/);
  assert.doesNotMatch(coreSource, /from ['"]\.\.\/ui(?:\/index\.js)?['"]/);
  for (let browserComponentImport of [
    "import('../chat/ChatComposer/ChatComposer.js')",
    "import('../canvas/NodeCanvas/NodeCanvas.js')",
    "import('../layout/Layout/Layout.js')",
    "import('../effects/CellBg/CellBg.js')",
    "import('../themes/CascadeThemeEditor/CascadeThemeEditor.js')",
  ]) {
    let guardIndex = uiSource.indexOf('if (hasDOMGlobals)');
    let importIndex = uiSource.indexOf(browserComponentImport);
    assert.ok(importIndex > guardIndex, `${browserComponentImport} must stay behind hasDOMGlobals`);
  }
  assert.match(uiSource, /typeof window !== 'undefined'/);
  assert.match(uiSource, /typeof customElements !== 'undefined'/);
});

test('runner contract test: every browser test in graph-browser-smoke.test.js is in run-tests.js browserSmokeSegments', async () => {
  const runTestsSource = await readFile(new URL('./run-tests.js', import.meta.url), 'utf8');
  const smokeTestsSource = await readFile(new URL('./graph-browser-smoke.test.js', import.meta.url), 'utf8');

  // Extract browserSmokeSegments array content
  const segmentsMatch = runTestsSource.match(/const\s+browserSmokeSegments\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(segmentsMatch, 'Could not find browserSmokeSegments in run-tests.js');
  const segmentLines = segmentsMatch[1]
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith("'") || line.startsWith('"'))
    .map(line => line.replace(/^['"]|['"],?$/g, ''));

  const segmentsSet = new Set(segmentLines);

  // Extract all test definitions in graph-browser-smoke.test.js
  const testNameRegex = /test\(\s*(['"`])(.*?)\1/g;
  let match;
  const foundTests = [];
  while ((match = testNameRegex.exec(smokeTestsSource)) !== null) {
    foundTests.push(match[2]);
  }

  assert.ok(foundTests.length > 0, 'Should find at least some tests in graph-browser-smoke.test.js');

  for (const testName of foundTests) {
    assert.ok(
      segmentsSet.has(testName),
      `Browser test "${testName}" in graph-browser-smoke.test.js is missing from browserSmokeSegments in run-tests.js. ` +
      `Please add it to the list.`
    );
  }
});

test('browser UI modules use explicit symbiote-engine subpaths', async () => {
  let uiDir = resolve(repoRoot, 'ui');
  let files = (await readdir(uiDir))
    .filter((file) => file.endsWith('.js'))
    .sort();

  for (let file of files) {
    let source = await readFile(join(uiDir, file), 'utf8');
    assert.doesNotMatch(
      source,
      /(?:from\s+|import\()\s*['"]symbiote-engine['"]/,
      `ui/${file} must not import the Node-safe package root from browser code`
    );
  }
});
