import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getGraphPathStyleDisplay as getPathStyleDisplay,
  getNextGraphPathStyle as getNextPathStyle,
  resolveInitialGraphViewMode as resolveInitialViewMode,
} from 'symbiote-node/ui';

describe('dep-graph-modes', () => {
  it('resolveInitialViewMode supports mode query params', () => {
    assert.equal(resolveInitialViewMode(new URLSearchParams('mode=flat')), 'flat');
    assert.equal(resolveInitialViewMode(new URLSearchParams('mode=tree')), 'structured');
    assert.equal(resolveInitialViewMode(new URLSearchParams()), 'structured');
  });

  it('getNextPathStyle cycles through supported styles', () => {
    assert.equal(getNextPathStyle('pcb'), 'bezier');
    assert.equal(getNextPathStyle('bezier'), 'orthogonal');
    assert.equal(getNextPathStyle('orthogonal'), 'straight');
    assert.equal(getNextPathStyle('straight'), 'pcb');
    assert.equal(getNextPathStyle('unknown'), 'pcb');
  });

  it('getPathStyleDisplay identifies the active PCB style', () => {
    assert.deepEqual(getPathStyleDisplay('pcb'), { icon: 'route', text: 'PCB', active: true });
    assert.deepEqual(getPathStyleDisplay('bezier'), { icon: 'timeline', text: 'BEZIER', active: false });
  });
});
