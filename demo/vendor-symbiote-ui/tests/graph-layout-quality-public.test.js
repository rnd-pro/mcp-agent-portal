import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

function runLayoutAudit(file) {
  return spawnSync(process.execPath, ['cli.js', 'layout-audit', file], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function createSnapshot(nodes) {
  return {
    version: 'graph-layout-snapshot-v1',
    nodes,
    edges: nodes.length === 2 ? [{ id: 'a-b', sourceId: 'a', targetId: 'b' }] : [],
  };
}

test('Node-safe entrypoints export the graph layout quality analyzer', async () => {
  let root = await import('../index.js');
  let graph = await import('../graph/index.js');

  assert.equal(typeof root.analyzeGraphLayout, 'function');
  assert.equal(root.analyzeGraphLayout, graph.analyzeGraphLayout);
  assert.equal(graph.GRAPH_LAYOUT_QUALITY_VERSION, 'graph-layout-quality-v1');
  assert.match(graph.GRAPH_LAYOUT_QUALITY_SCHEMA_ID, /graph-layout-quality-v1\.json$/);
  assert.ok(graph.GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.coordinateMaximum > 0);
});

test('manifest and discover expose the graph layout audit operation and schema', async () => {
  let graph = await import('../graph/index.js');
  let manifest = await import('../manifest/index.js');
  let { cmdDiscover } = await import('../discover.js');
  let schema = JSON.parse(await readFile(
    new URL('../schemas/graph-layout-quality-v1.json', import.meta.url),
    'utf8'
  ));
  let operation = manifest.getGraphAnalysisOperation('graph.layout.audit');
  let discovery = await cmdDiscover({});
  let discovered = discovery.manifest.graphAnalysis.find((item) => item.id === operation.id);
  let discoveredSchema = discovery.manifest.schemas.find(
    (item) => item.version === 'graph-layout-quality-v1'
  );

  assert.deepEqual(manifest.GRAPH_LAYOUT_QUALITY_SCHEMA, schema);
  assert.deepEqual(manifest.getGraphSchema('graph-layout-quality-v1'), schema);
  assert.equal(operation.function, 'analyzeGraphLayout');
  assert.equal(operation.specifier, 'symbiote-ui/graph');
  assert.equal(operation.runtime, 'node-safe');
  assert.equal(operation.annotations.readOnlyHint, true);
  assert.equal(operation.annotations.destructiveHint, false);
  assert.equal(operation.annotations.idempotentHint, true);
  assert.equal(operation.cli.command, 'layout-audit');
  assert.equal(operation.inputVersion, 'graph-layout-snapshot-v1');
  assert.equal(operation.reportVersion, graph.GRAPH_LAYOUT_QUALITY_VERSION);
  assert.deepEqual(operation.defaultPolicy, graph.GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY);
  assert.deepEqual(operation.numericDomain, graph.GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN);
  assert.deepEqual(
    operation.reportInvariants,
    manifest.GRAPH_LAYOUT_QUALITY_REPORT_INVARIANTS
  );
  assert.deepEqual(
    Object.keys(operation.policyFields),
    Object.keys(graph.GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY)
  );
  assert.deepEqual(
    operation.rules.map((rule) => rule.id),
    schema.$defs.finding.properties.ruleId.enum
  );
  assert.ok(operation.rules.every((rule) => (
    rule.payload?.actual?.type && rule.payload?.actual?.unit
      && rule.payload?.actual?.schema
      && rule.payload?.limit?.type && rule.payload?.limit?.unit
      && rule.payload?.limit?.schema
  )));
  assert.deepEqual(discovered, operation);
  assert.deepEqual(discoveredSchema, {
    version: 'graph-layout-quality-v1',
    path: 'schemas/graph-layout-quality-v1.json',
    description: discoveredSchema.description,
    ...schema,
  });
  assert.throws(
    () => manifest.getGraphAnalysisOperation('missing.operation'),
    /Unknown graph analysis operation "missing\.operation"/
  );
});

test('layout-audit CLI preserves pass, warn, fail, incomplete, and parse outcomes', async () => {
  let directory = await mkdtemp(join(tmpdir(), 'symbiote-ui-layout-audit-'));
  let goodFile = join(directory, 'good.json');
  let warningFile = join(directory, 'warning.json');
  let badFile = join(directory, 'bad.json');
  let incompleteFile = join(directory, 'incomplete.json');
  let malformedFile = join(directory, 'malformed.json');

  try {
    await writeFile(goodFile, JSON.stringify(createSnapshot([
      { id: 'a', bounds: { x: 0, y: 0, width: 100, height: 60 } },
      { id: 'b', bounds: { x: 180, y: 0, width: 100, height: 60 } },
    ])));
    await writeFile(badFile, JSON.stringify(createSnapshot([
      { id: 'a', bounds: { x: 0, y: 0, width: 100, height: 60 } },
      { id: 'b', bounds: { x: 40, y: 20, width: 100, height: 60 } },
    ])));
    await writeFile(warningFile, JSON.stringify(createSnapshot([
      { id: 'a', bounds: { x: 0, y: 0, width: 100, height: 60 } },
      { id: 'b', bounds: { x: 1000, y: 0, width: 100, height: 60 } },
    ])));
    await writeFile(incompleteFile, JSON.stringify({
      version: 'graph-layout-snapshot-v1',
      nodes: [
        { id: 'duplicate', bounds: { x: 0, y: 0, width: 100, height: 60 } },
        { id: 'duplicate', bounds: { x: 200, y: 0, width: 100, height: 60 } },
      ],
    }));
    await writeFile(malformedFile, '{');

    let good = runLayoutAudit(goodFile);
    let warning = runLayoutAudit(warningFile);
    let bad = runLayoutAudit(badFile);
    let incomplete = runLayoutAudit(incompleteFile);
    let malformed = runLayoutAudit(malformedFile);
    let goodReport = JSON.parse(good.stdout);
    let warningReport = JSON.parse(warning.stdout);
    let badReport = JSON.parse(bad.stdout);
    let incompleteReport = JSON.parse(incomplete.stdout);

    assert.equal(good.status, 0, good.stderr);
    assert.equal(goodReport.pass, true);
    assert.equal(warning.status, 0, warning.stderr);
    assert.equal(warningReport.status, 'warn');
    assert.equal(warningReport.pass, true);
    assert.equal(bad.status, 1, bad.stderr);
    assert.equal(badReport.pass, false);
    assert.ok(badReport.findings.some((finding) => finding.ruleId === 'node.overlap'));
    assert.equal(incomplete.status, 1, incomplete.stderr);
    assert.equal(incompleteReport.status, 'incomplete');
    assert.equal(incompleteReport.complete, false);
    assert.notEqual(malformed.status, 0);
    assert.match(malformed.stderr, /Unable to parse graph layout snapshot/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
