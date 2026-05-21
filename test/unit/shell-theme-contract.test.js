import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

describe('portal shell theme contract', () => {
  it('consumes symbiote-node theme tokens instead of copying provider colors', () => {
    let css = fs.readFileSync(path.join(ROOT, 'web/style.css'), 'utf8');
    for (let literal of [
      '#4c8bf5',
      '#4caf50',
      '#f44336',
      'rgba(76, 139, 245',
      'rgba(76, 175, 80',
      'rgba(244, 67, 54',
    ]) {
      assert.equal(css.includes(literal), false, `web/style.css must not copy provider color ${literal}`);
    }
    for (let token of [
      '--sn-node-selected',
      '--sn-success-color',
      '--sn-danger-color',
      '--sn-accent-bg',
      '--sn-scrollbar-thumb',
      '--sn-layout-resizer-hover-bg',
    ]) {
      assert.ok(css.includes(token), `web/style.css must consume ${token}`);
    }
  });

  it('keeps tree and skill panels on provider theme tokens', () => {
    for (let relative of [
      'web/panels/FileTree/FileTree.css.js',
      'web/panels/SkillManager/AgentPortalTree.css.js',
      'web/panels/SkillManager/OpenLibraryTree.css.js',
      'web/panels/SkillManager/SkillManager.css.js',
      'web/panels/SkillManager/SkillMetadata.js',
      'web/panels/CtxPanel/CtxPanel.css.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.equal(source.includes('hsl(35, 18%, 80%)'), false, `${relative} must not copy provider border fallback`);
      assert.equal(source.includes('hsl(37, 30%'), false, `${relative} must not copy provider surface fallback`);
      assert.equal(source.includes('hsl(30, 10%, 45%)'), false, `${relative} must not copy provider muted text fallback`);
      assert.equal(source.includes('hsl(30, 15%, 18%)'), false, `${relative} must not copy provider text fallback`);
    }
  });

  it('uses the symbiote tree panel component for project trees', () => {
    for (let relative of [
      'web/panels/FileTree/FileTree.tpl.js',
      'web/panels/SkillManager/AgentPortalTree.tpl.js',
      'web/panels/SkillManager/OpenLibraryTree.tpl.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.ok(source.includes('<sn-tree-panel'), `${relative} must compose the library tree panel`);
      assert.equal(source.includes('<sn-tree-view'), false, `${relative} must not bypass tree panel chrome`);
      assert.equal(source.includes('pg-panel-toolbar'), false, `${relative} must not copy panel toolbar markup`);
    }
  });

  it('uses symbiote surface cards for reusable card shells', () => {
    for (let relative of [
      'web/panels/ActiveTasks/TaskCard.js',
      'web/panels/ToolExplorer/ToolCard.js',
      'web/panels/Marketplace/McpServerCard.js',
      'web/panels/Marketplace/ContextCard.js',
      'web/panels/ProjectItem/ProjectItem.tpl.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.ok(source.includes('<sn-card'), `${relative} must compose the library card surface`);
      assert.equal(source.includes('<div class="ui-card"'), false, `${relative} must not copy card shell markup`);
    }
  });

  it('uses symbiote action buttons inside reusable card shells', () => {
    for (let relative of [
      'web/panels/ActiveTasks/TaskCard.js',
      'web/panels/Marketplace/McpServerCard.js',
      'web/panels/Marketplace/ContextCard.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.ok(source.includes('<sn-button'), `${relative} must compose the library action control`);
      assert.equal(source.includes('class="ui-btn'), false, `${relative} must not copy button shell classes`);
    }
  });

  it('uses symbiote field wrappers for reusable form shells', () => {
    for (let relative of [
      'web/panels/Marketplace/Marketplace.tpl.js',
      'web/panels/PeerReview/PeerReview.tpl.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.ok(source.includes('<sn-field'), `${relative} must compose the library field wrapper`);
      assert.equal(source.includes('<div class="ui-field">'), false, `${relative} must not copy field shell markup`);
    }
  });

  it('keeps active task cards off inline copied theme values', () => {
    let source = fs.readFileSync(path.join(ROOT, 'web/panels/ActiveTasks/TaskCard.js'), 'utf8');
    for (let literal of ['#9ca3af', '#404040', 'style="']) {
      assert.equal(source.includes(literal), false, `TaskCard must not copy provider styling with ${literal}`);
    }
    for (let token of ['--sn-font-mono', '--sn-text-dim']) {
      assert.ok(source.includes(token), `TaskCard must consume ${token}`);
    }
  });
});
