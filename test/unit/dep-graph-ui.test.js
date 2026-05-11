import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFlatPathHash, selectLabelMode } from '../../web/panels/dep-graph-ui.js';

test('buildFlatPathHash preserves query params for nested paths', () => {
  const params = new URLSearchParams('mode=flat&focus=src/app.js&style=pcb');

  assert.equal(
    buildFlatPathHash('src/components', params),
    '#graph/src/components?mode=flat&focus=src%2Fapp.js&style=pcb',
  );
});

test('buildFlatPathHash clears focus when returning to graph root', () => {
  const params = new URLSearchParams('mode=flat&focus=src/app.js&style=pcb');

  assert.equal(buildFlatPathHash('', params), '#graph?mode=flat&style=pcb');
});

test('selectLabelMode marks one button active and updates canvas mode', () => {
  function createButton(mode, active = false) {
    const attrs = new Set(active ? ['data-active'] : []);
    return {
      attrs,
      getAttribute(name) {
        return name === 'data-mode' ? mode : null;
      },
      setAttribute(name) {
        attrs.add(name);
      },
      removeAttribute(name) {
        attrs.delete(name);
      },
    };
  }

  const compact = createButton('compact', true);
  const full = createButton('full');
  const canvasAttrs = new Map();
  const canvas = {
    setAttribute(name, value) {
      canvasAttrs.set(name, value);
    },
  };

  assert.equal(selectLabelMode([compact, full], full, canvas), 'full');
  assert.equal(compact.attrs.has('data-active'), false);
  assert.equal(full.attrs.has('data-active'), true);
  assert.equal(canvasAttrs.get('data-label-mode'), 'full');
});
