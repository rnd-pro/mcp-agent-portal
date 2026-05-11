import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseGraphHash, updateHashParam } from '../../web/panels/dep-graph-routing.js';

describe('dep-graph-routing', () => {
  it('parseGraphHash returns drill path and query params', () => {
    let parsed = parseGraphHash('#graph/src/core/?focus=src%2Fcore%2Findex.js&mode=flat');

    assert.equal(parsed.path, 'src/core/');
    assert.equal(parsed.params.get('focus'), 'src/core/index.js');
    assert.equal(parsed.params.get('mode'), 'flat');
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
});
