import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const treePanelStyles = new URL('../tree/TreePanel/TreePanel.css.js', import.meta.url);
const treePanelTemplate = new URL('../tree/TreePanel/TreePanel.tpl.js', import.meta.url);
const componentRegistry = new URL('../manifest/component-registry.js', import.meta.url);
const customElements = new URL('../custom-elements.json', import.meta.url);

test('tree panel owns a resilient scroll container', async () => {
  let [styles, template] = await Promise.all([
    readFile(treePanelStyles, 'utf8'),
    readFile(treePanelTemplate, 'utf8'),
  ]);

  assert.match(template, /class="sn-tree-panel-shell"/);
  assert.match(styles, /:host,\s*sn-tree-panel \{[\s\S]*?height: 100%;[\s\S]*?min-block-size: 0;[\s\S]*?overflow: hidden;/);
  assert.match(styles, /\.sn-tree-panel-shell \{[\s\S]*?display: flex;[\s\S]*?block-size: 100%;[\s\S]*?min-block-size: 0;[\s\S]*?overflow: hidden;/);
  assert.match(styles, /\.sn-tree-panel-title\[hidden\] \{[\s\S]*?display: none;/);
  assert.match(styles, /\.sn-tree-panel-toolbar \{[\s\S]*?flex: 0 0 auto;/);
  assert.match(styles, /\.sn-tree-panel-content \{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-block-size: 0;[\s\S]*?overflow: auto;/);
  assert.match(styles, /sn-tree-view \{[\s\S]*?display: block;[\s\S]*?min-block-size: 0;/);
});

test('tree panel metadata exposes scroll container capability', async () => {
  let [registry, customElementsText] = await Promise.all([
    readFile(componentRegistry, 'utf8'),
    readFile(customElements, 'utf8'),
  ]);

  assert.match(registry, /tagName: 'sn-tree-panel'[\s\S]*?'scroll-container'/);
  assert.match(customElementsText, /"tagName": "sn-tree-panel"[\s\S]*?"scroll-container"/);
});
