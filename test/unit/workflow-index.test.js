import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let parseFrontmatter, buildTagIndex, searchByTags, toLightList;

const TEST_DIR = path.join(os.tmpdir(), `context-x-mcp-test-${Date.now()}`);

describe('workflow-index', () => {
  before(async () => {
    const mod = await import('../../packages/context-x-mcp/src/workflow-index.js');
    parseFrontmatter = mod.parseFrontmatter;
    buildTagIndex = mod.buildTagIndex;
    searchByTags = mod.searchByTags;
    toLightList = mod.toLightList;

    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  after(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('parseFrontmatter', () => {
    it('returns null if no frontmatter', () => {
      const res = parseFrontmatter('# Just a heading\nNo frontmatter here.');
      assert.strictEqual(res, null);
    });

    it('parses basic frontmatter', () => {
      const content = `---\nname: Test Workflow\nworkflow: debug\n---\n# Body`;
      const res = parseFrontmatter(content);
      assert.ok(res);
      assert.deepStrictEqual(res.meta, { name: 'Test Workflow', workflow: 'debug' });
      assert.strictEqual(res.body, '# Body');
    });

    it('parses inline arrays', () => {
      const content = `---\ntags: [debug, first-step]\n---\nBody`;
      const res = parseFrontmatter(content);
      assert.deepStrictEqual(res.meta.tags, ['debug', 'first-step']);
    });

    it('parses inline objects', () => {
      const content = `---\ntransitions: { success: [next], fail: [abort] }\n---\nBody`;
      const res = parseFrontmatter(content);
      assert.deepStrictEqual(res.meta.transitions, { success: ['next'], fail: ['abort'] });
    });

    it('parses multi-line arrays', () => {
      const content = `---\ntags:\n  - debug\n  - step2\n---\nBody`;
      const res = parseFrontmatter(content);
      assert.deepStrictEqual(res.meta.tags, ['debug', 'step2']);
    });

    it('parses nested YAML', () => {
      const content = `---\ntransitions:\n  success:\n    require_tags: [next]\n---\nBody`;
      const res = parseFrontmatter(content);
      assert.deepStrictEqual(res.meta.transitions, { success: { require_tags: ['next'] } });
    });

    it('casts values correctly', () => {
      const content = `---\nisTrue: true\nisFalse: false\nisNull: null\nnumber: 42\n---\nBody`;
      const res = parseFrontmatter(content);
      assert.strictEqual(res.meta.isTrue, true);
      assert.strictEqual(res.meta.isFalse, false);
      assert.strictEqual(res.meta.isNull, null);
      assert.strictEqual(res.meta.number, 42);
    });
  });

  describe('TagIndex', () => {
    before(() => {
      fs.writeFileSync(path.join(TEST_DIR, 'node1.md'), '---\ntags: [a, b]\nname: Node 1\n---\nContent 1');
      fs.writeFileSync(path.join(TEST_DIR, 'node2.md'), '---\ntags: [b, c]\nname: Node 2\ndescription: Desc 2\n---\nContent 2');
      fs.writeFileSync(path.join(TEST_DIR, 'node3.md'), '---\ntags: [a, c, d]\nname: Node 3\n---\nContent 3');
      fs.writeFileSync(path.join(TEST_DIR, 'ignored.txt'), 'Not a markdown file');
    });

    it('buildTagIndex scans directory and builds index', () => {
      const { nodes, tagIndex } = buildTagIndex(TEST_DIR);
      assert.strictEqual(nodes.size, 3);
      assert.ok(tagIndex.has('a'));
      assert.deepStrictEqual(tagIndex.get('a').sort(), ['node1', 'node3']);
    });

    it('searchByTags with AND logic', () => {
      const { nodes, tagIndex } = buildTagIndex(TEST_DIR);
      
      const resAB = searchByTags(nodes, tagIndex, ['a', 'b']);
      assert.strictEqual(resAB.length, 1);
      assert.strictEqual(resAB[0].id, 'node1');

      const resC = searchByTags(nodes, tagIndex, ['c']);
      assert.strictEqual(resC.length, 2);
      
      const resNone = searchByTags(nodes, tagIndex, ['x']);
      assert.strictEqual(resNone.length, 0);
    });

    it('toLightList returns minimal info', () => {
      const { nodes, tagIndex } = buildTagIndex(TEST_DIR);
      const resC = searchByTags(nodes, tagIndex, ['c']);
      
      const lightList = toLightList(resC);
      assert.strictEqual(lightList.length, 2);
      const node2Light = lightList.find(n => n.id === 'node2');
      assert.strictEqual(node2Light.name, 'Node 2');
      assert.strictEqual(node2Light.description, 'Desc 2');
      assert.strictEqual(node2Light.body, undefined);
    });
  });
});
