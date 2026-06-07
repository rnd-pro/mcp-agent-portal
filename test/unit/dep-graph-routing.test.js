import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getGraphUrlParams, parseGraphHash, updateHashParam } from 'symbiote-ui/ui';

const ROOT = path.resolve(import.meta.dirname, '../..');

describe('dep-graph-routing', () => {
  it('parseGraphHash returns drill path and query params', () => {
    let parsed = parseGraphHash('#graph/src/core/?focus=src%2Fcore%2Findex.js&mode=flat');

    assert.equal(parsed.path, 'src/core/');
    assert.equal(parsed.params.get('focus'), 'src/core/index.js');
    assert.equal(parsed.params.get('mode'), 'flat');
  });

  it('getGraphUrlParams merges URL search with graph hash params', () => {
    let params = getGraphUrlParams({
      search: '?server=main&project=root&mode=tree',
      hash: '#graph/scripts?project=graph-project&focus=scripts%2Fdiagnostics%2Fopencode-e2e.js&mode=flat',
    });

    assert.equal(params.get('server'), 'main');
    assert.equal(params.get('project'), 'graph-project');
    assert.equal(params.get('focus'), 'scripts/diagnostics/opencode-e2e.js');
    assert.equal(params.get('mode'), 'flat');
  });

  it('updateHashParam preserves path and unrelated params', () => {
    let locationObj = { hash: '#graph/src?mode=flat&focus=old.js' };
    let nextUrl;
    let historyObj = {
      replaceState(_state, _title, url) {
        nextUrl = url;
      },
    };

    updateHashParam('focus', 'new.js', locationObj, historyObj);
    assert.equal(nextUrl, '#graph/src?mode=flat&focus=new.js');

    locationObj.hash = nextUrl;
    updateHashParam('focus', null, locationObj, historyObj);
    assert.equal(nextUrl, '#graph/src?mode=flat');
  });

  it('updateHashParam skips history writes when hash is unchanged', () => {
    let replaceCount = 0;
    updateHashParam(
      'focus',
      'src/app.js',
      { hash: '#graph?focus=src%2Fapp.js' },
      { replaceState() { replaceCount++; } },
    );

    assert.equal(replaceCount, 0);
  });

  it('GraphFlows does not auto-publish the first story beat on load', () => {
    let source = fs.readFileSync(path.join(ROOT, 'web/panels/GraphFlows/GraphFlows.js'), 'utf8');

    assert.match(source, /button\.onclick = \(\) => \{\s*this\._activeStoryIndex = Number\(button\.dataset\.storyIndex\);[\s\S]*?this\._publishCurrentBeat\(\);[\s\S]*?\};/);
    assert.doesNotMatch(source, /metadata\.stories\.length\s*>\s*0\)\s*this\._publishCurrentBeat\(\)/);
  });

  it('dep graph keeps readonly editing while allowing node selection and drag', () => {
    let source = fs.readFileSync(path.join(ROOT, 'web/panels/dep-graph.js'), 'utf8');

    assert.match(
      source,
      /this\._canvas\.setReadonly\(true\);\s*this\._canvas\.setReadonlyNodeDragging\(true\);/,
    );
  });
});
