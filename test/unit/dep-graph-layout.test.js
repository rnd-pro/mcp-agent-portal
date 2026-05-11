import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFlatGroups, computeInitialGraphPositions } from '../../web/panels/dep-graph-layout.js';

function editorWithNodes(ids) {
  return {
    getNodes() {
      return ids.map((id) => ({ id }));
    },
  };
}

describe('dep-graph-layout', () => {
  it('buildFlatGroups maps directory files to node ids', () => {
    const dirFiles = new Map([
      ['src/', ['src/a.js', 'src/b.js', 'src/missing.js']],
      ['test/', ['test/a.test.js']],
    ]);
    const fileMap = new Map([
      ['src/a.js', 'node-a'],
      ['src/b.js', 'node-b'],
      ['test/a.test.js', 'node-test'],
    ]);

    assert.deepEqual(buildFlatGroups(dirFiles, fileMap), {
      'src/': ['node-a', 'node-b'],
      'test/': ['node-test'],
    });
  });

  it('computeInitialGraphPositions returns a position for every flat node', () => {
    const editor = editorWithNodes(['node-a', 'node-b', 'node-c']);
    const positions = computeInitialGraphPositions({
      editor,
      isStructured: false,
      dirFiles: null,
      dirNodeMap: null,
      groups: {},
    });

    assert.deepEqual(Object.keys(positions).sort(), ['node-a', 'node-b', 'node-c']);
    for (const pos of Object.values(positions)) {
      assert.equal(typeof pos.x, 'number');
      assert.equal(typeof pos.y, 'number');
    }
  });
});
