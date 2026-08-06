import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { test } from 'node:test';

class TestCSSStyleSheet {
  replaceSync(text) {
    this.cssText = text;
  }
}

let testWindow = null;
const sourceViewerStylesUrl = new URL('../display/SourceViewer/SourceViewer.css.js', import.meta.url);
const sourceViewerTemplateUrl = new URL('../display/SourceViewer/SourceViewer.tpl.js', import.meta.url);
const codeBlockStylesUrl = new URL('../display/CodeBlock/CodeBlock.css.js', import.meta.url);
const cascadeThemeSourceUrl = new URL('../themes/cascade-theme.js', import.meta.url);

function installDom() {
  if (testWindow) {
    testWindow.document.body.innerHTML = '';
    testWindow.document.adoptedStyleSheets = [];
    return;
  }

  let { window } = parseHTML('<!doctype html><html><body></body></html>');
  testWindow = window;
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    customElements: window.customElements,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    MutationObserver: window.MutationObserver,
    CSSStyleSheet: TestCSSStyleSheet,
  });
  window.document.adoptedStyleSheets = [];
}

async function nextRenderTick() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function defineElement(tagName, ComponentClass) {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, ComponentClass);
  }
}

async function defineSourceViewerElements() {
  let [{ CodeBlock }, { SourceViewer }] = await Promise.all([
    import('../display/CodeBlock/CodeBlock.js'),
    import('../display/SourceViewer/SourceViewer.js'),
  ]);
  defineElement('code-block', CodeBlock);
  defineElement('source-viewer', SourceViewer);
}

async function defineSourceEditorElement() {
  let { SourceEditor } = await import('../display/SourceEditor/SourceEditor.js');
  defineElement('source-editor', SourceEditor);
}

test('source viewer forwards save actions and syntax tokens to code rendering', async () => {
  installDom();
  await defineSourceViewerElements();

  let viewer = document.createElement('source-viewer');
  document.body.append(viewer);
  await nextRenderTick();

  let actionDetail = null;
  viewer.addEventListener('source-viewer-action', (event) => {
    actionDetail = event.detail;
  });

  viewer.showFile({
    path: 'src/app.js',
    raw: 'export const ok = true;',
    lang: 'js',
    saveAction: {
      id: 'save-source',
      label: 'Save',
      intent: 'source:save',
      payload: { panel: 'source' },
    },
    syntaxTokens: {
      keyword: 'rgb(1, 2, 3)',
      '--sn-syntax-string': 'rgb(4, 5, 6)',
      unsafe: 'red',
    },
  });
  await nextRenderTick();

  let codeBlock = viewer.querySelector('code-block');
  assert.equal(viewer.hasAttribute('has-save-action'), true);
  assert.equal(viewer.style.getPropertyValue('--sn-syntax-keyword'), 'rgb(1, 2, 3)');
  assert.equal(viewer.style.getPropertyValue('--sn-syntax-string'), 'rgb(4, 5, 6)');
  assert.equal(viewer.style.getPropertyValue('unsafe') || '', '');
  assert.equal(codeBlock.style.getPropertyValue('--sn-syntax-keyword'), 'rgb(1, 2, 3)');

  assert.equal(viewer.triggerSourceAction(), true);
  assert.equal(actionDetail.path, 'src/app.js');
  assert.equal(actionDetail.content, 'export const ok = true;');
  assert.deepEqual(actionDetail.action, {
    id: 'save-source',
    label: 'Save',
    intent: 'source:save',
    payload: { panel: 'source' },
  });

  viewer.showEmpty();
  assert.equal(viewer.hasAttribute('has-save-action'), false);
  assert.equal(viewer.style.getPropertyValue('--sn-syntax-keyword') || '', '');
  assert.equal(codeBlock.style.getPropertyValue('--sn-syntax-keyword') || '', '');
});

test('source viewer exposes markdown document behavior', async () => {
  installDom();
  await defineSourceViewerElements();

  let viewer = document.createElement('source-viewer');
  document.body.append(viewer);
  await nextRenderTick();

  viewer.showFile({
    path: 'docs/agent-workspace.md',
    raw: '# Agent workspace\n\nRender markdown and code from the same library.',
    lang: 'md',
  });
  await nextRenderTick();

  let codeBlock = viewer.querySelector('code-block');
  assert.equal(viewer.$.viewMode, 'rendered');
  assert.equal(viewer.$.showToggle, true);
  assert.equal(viewer.hasAttribute('mode-raw'), false);
  assert.equal(codeBlock.$.isMarkdown, true);
  assert.match(codeBlock.$.highlighted, /Agent workspace/);

  await viewer.toggleMode();
  await nextRenderTick();
  assert.equal(viewer.$.viewMode, 'source');
  assert.equal(viewer.hasAttribute('mode-raw'), true);
  assert.equal(codeBlock.$.isMarkdown, false);
  assert.equal(codeBlock.$.lang, 'plain');

  await viewer.toggleMode();
  await nextRenderTick();
  assert.equal(viewer.$.viewMode, 'rendered');
  assert.equal(viewer.hasAttribute('mode-raw'), false);
  assert.equal(codeBlock.$.isMarkdown, true);
});

test('source viewer compact header keeps hidden labels out of control text', async () => {
  installDom();
  await defineSourceViewerElements();

  let viewer = document.createElement('source-viewer');
  document.body.append(viewer);
  await nextRenderTick();

  viewer.showFile({
    path: 'profile/photo.md',
    raw: '# Vladimir Matiasevich',
    lang: 'md',
    statsText: 'profile-photo',
  });
  await nextRenderTick();

  let controls = viewer.querySelector('.sv-controls');
  let stats = viewer.querySelector('.sv-stats');
  let toggleLabel = viewer.querySelector('.sv-toggle-label');
  let toggleAction = viewer.querySelector('.sv-toggle-action');

  assert.equal(stats.getAttribute('data-source-text'), 'profile-photo');
  assert.equal(toggleLabel.getAttribute('data-label'), 'rendered');
  assert.equal(toggleAction.getAttribute('aria-label'), viewer.$.toggleModeTitle);
  assert.doesNotMatch(controls.textContent, /profile-photo/);
  assert.doesNotMatch(controls.textContent, /rendered/);
});

test('source viewer header keeps one row and hides controls by priority', async () => {
  const [styles, template, cascadeTheme] = await Promise.all([
    readFile(sourceViewerStylesUrl, 'utf8'),
    readFile(sourceViewerTemplateUrl, 'utf8'),
    readFile(cascadeThemeSourceUrl, 'utf8'),
  ]);

  assert.match(template, /class="sv-shell"/);
  assert.match(styles, /\.sv-shell \{[\s\S]*?display: flex;[\s\S]*?block-size: 100%;[\s\S]*?min-block-size: 0;[\s\S]*?overflow: hidden;/);
  assert.match(styles, /\.sv-header \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(0, max-content\);[\s\S]*?column-gap: var\(--sn-source-toolbar-gap, 8px\);[\s\S]*?block-size: var\(--sn-source-header-block-size,/);
  assert.match(styles, /\.sv-controls \{[\s\S]*?gap: var\(--sn-source-toolbar-gap, 8px\);[\s\S]*?flex-wrap: nowrap;[\s\S]*?block-size: 100%;[\s\S]*?max-inline-size: var\(--sn-source-controls-max-inline-size, 46cqw\);[\s\S]*?overflow: hidden;/);
  assert.match(styles, /\.sv-stats \{[\s\S]*?flex: 1 1 auto;[\s\S]*?max-inline-size: var\(--sn-source-stats-max-inline-size, 16ch\);/);
  assert.match(styles, /\.sv-action \{[\s\S]*?box-sizing: border-box;[\s\S]*?justify-content: center;[\s\S]*?flex: 0 0 auto;[\s\S]*?min-inline-size: var\(--sn-source-action-min-inline-size, var\(--sn-layout-header-button-min-inline-size, 24px\)\);[\s\S]*?block-size: var\(--sn-source-action-block-size,/);
  assert.match(styles, /\.sv-toggle-label \{[\s\S]*?max-inline-size: var\(--sn-source-toggle-label-max-inline-size, 10ch\);/);
  assert.match(styles, /\.sv-stats::before \{[\s\S]*?content: attr\(data-source-text\);/);
  assert.match(styles, /\.sv-action-label::before \{[\s\S]*?content: attr\(data-label\);/);
  assert.match(styles, /@container \(max-width: 520px\) \{[\s\S]*?\.sv-controls \{[\s\S]*?gap: var\(--sn-source-toolbar-compact-gap, var\(--sn-layout-header-button-gap, 4px\)\);[\s\S]*?\.sv-action \{[\s\S]*?inline-size: var\(--sn-source-action-compact-size, var\(--sn-layout-header-button-min-inline-size, 24px\)\);[\s\S]*?padding: 0;[\s\S]*?gap: 0;[\s\S]*?\.sv-action-label \{[\s\S]*?display: none;/);
  assert.match(styles, /@container \(max-width: 460px\) \{[\s\S]*?\.sv-stats \{[\s\S]*?display: none;/);
  assert.match(styles, /@container \(max-width: 380px\) \{[\s\S]*?\.sv-graph-action \{[\s\S]*?display: none;/);
  assert.match(styles, /@container \(max-width: 320px\) \{[\s\S]*?\.sv-save-action \{[\s\S]*?display: none;/);
  assert.doesNotMatch(styles, /grid-template-columns: minmax\(0, 1fr\);\s*align-items: start;/);
  assert.doesNotMatch(template, /textContent: statsText/);
  assert.doesNotMatch(template, /textContent: saveLabel/);
  assert.doesNotMatch(template, /textContent: graphLabel/);
  assert.doesNotMatch(template, /textContent: modeLabel/);
  assert.match(template, /class="sv-stats"/);
  assert.match(template, /class="sv-action-label sv-save-label"/);
  assert.match(template, /class="sv-action sv-graph-action"/);
  assert.match(template, /class="sv-action sv-toggle-action"/);
  assert.match(cascadeTheme, /'--sn-source-toolbar-gap': densityToken\(8\)/);
});

test('code block raw mode preserves long lines for horizontal scrolling', async () => {
  const styles = await readFile(codeBlockStylesUrl, 'utf8');

  assert.match(styles, /\.cb-scroll \{[\s\S]*?min-inline-size: 0;[\s\S]*?overflow: auto;/);
  assert.match(styles, /\.cb-gutter \{[\s\S]*?color: var\(\s*--sn-code-gutter-color,[\s\S]*?color-mix\(in oklch, var\(--sn-sys-on-surface-dim\) 64%, var\(--sn-sys-surface\)\)[\s\S]*?\);/);
  assert.match(styles, /\.cb-gutter \{[\s\S]*?background: var\(\s*--sn-code-gutter-bg,[\s\S]*?color-mix\(in oklch, var\(--sn-sys-surface\) 92%, black\)[\s\S]*?\);/);
  assert.doesNotMatch(styles, /\.cb-gutter \{[\s\S]*?opacity:/);
  assert.match(styles, /\.cb-pre \{[\s\S]*?flex: 1 0 max-content;[\s\S]*?min-inline-size: var\(--sn-code-content-min-inline-size, 0\);[\s\S]*?white-space: pre;/);
  assert.doesNotMatch(styles, /\.cb-pre \{[^}]*flex: 1;[^}]*min-width: 0;/);
});

test('source editor accepts source documents and emits host save intents', async () => {
  installDom();
  await defineSourceEditorElement();

  let editor = document.createElement('source-editor');
  document.body.append(editor);
  await nextRenderTick();

  let saveDetail = null;
  editor.addEventListener('source-editor-save', (event) => {
    saveDetail = event.detail;
  });

  editor.setSourceDocument({
    path: 'docs/readme.md',
    content: '# Readme',
    language: 'md',
    readOnly: true,
    dirty: true,
    saveAction: 'save-doc',
    syntaxTheme: {
      id: 'agent-docs',
      tokens: {
        comment: 'rgb(10, 20, 30)',
      },
    },
  });
  await nextRenderTick();

  assert.equal(editor.getContent(), '# Readme');
  assert.equal(editor.readOnly, true);
  assert.equal(editor.$.language, 'md');
  assert.equal(editor.$.dirty, true);
  assert.equal(editor.hasAttribute('dirty'), true);
  assert.equal(editor.hasAttribute('has-save-action'), true);
  assert.equal(editor.style.getPropertyValue('--sn-syntax-comment'), 'rgb(10, 20, 30)');

  assert.equal(editor.triggerSave({ source: 'keyboard' }), true);
  assert.deepEqual(saveDetail, {
    action: { id: 'save-doc', label: 'save-doc' },
    path: 'docs/readme.md',
    value: '# Readme',
    dirty: true,
    language: 'md',
    source: 'keyboard',
  });
});

test('renderMarkdown emits a content-slot placeholder for a valid directive', async () => {
  let { renderMarkdown } = await import('../display/highlight.js');
  let html = renderMarkdown('Intro paragraph.\n\n:::content-slot hero\n\nOutro paragraph.');
  let placeholders = html.match(/class="cb-content-slot"/g) || [];
  assert.equal(placeholders.length, 1);
  assert.match(html, /<div class="cb-content-slot" data-content-slot="hero"><\/div>/);
});

test('renderMarkdown emits content-slot placeholders in document order', async () => {
  let { renderMarkdown } = await import('../display/highlight.js');
  let html = renderMarkdown(':::content-slot first\n\n:::content-slot second\n\n:::content-slot third');
  let keys = [...html.matchAll(/data-content-slot="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(keys, ['first', 'second', 'third']);
});

test('renderMarkdown treats unsafe content-slot directives as inert escaped text', async () => {
  let { renderMarkdown } = await import('../display/highlight.js');
  let unsafe = [
    ':::content-slot "quoted"',
    ':::content-slot <script>',
    ':::content-slot has space',
    ':::content-slot key attr=val',
    ':::content-slot key>evil',
  ];
  for (let source of unsafe) {
    let html = renderMarkdown(source);
    assert.doesNotMatch(html, /cb-content-slot/, `no placeholder for: ${source}`);
    assert.doesNotMatch(html, /<script>/, `no raw markup for: ${source}`);
  }
});

async function mountMarkdownViewer(raw = '# One') {
  installDom();
  await defineSourceViewerElements();
  let viewer = document.createElement('source-viewer');
  document.body.append(viewer);
  await nextRenderTick();
  viewer.showFile({ path: 'docs/a.md', raw, lang: 'md' });
  await nextRenderTick();
  let codeBlock = viewer.querySelector('code-block');
  return { viewer, codeBlock };
}

test('code block renders content slots inside the markdown body', async () => {
  let { codeBlock } = await mountMarkdownViewer('# Doc\n\n:::content-slot main');

  let scroll = codeBlock.querySelector('.cb-scroll');
  let flow = scroll.querySelector('.cb-flow');
  let markdown = flow.querySelector('.cb-md');
  assert.ok(markdown, 'the markdown body lives in the flow wrapper');
  assert.equal(flow.querySelector('.cb-ext-host'), null, 'the legacy extension host is gone');

  let slot = markdown.querySelector('.cb-content-slot[data-content-slot="main"]');
  assert.ok(slot, 'the directive placeholder is part of the rendered markdown body');
  assert.equal(slot.closest('.cb-md'), markdown, 'slots are descendants of the markdown body');
});

test('code block composes content slots against already-rendered markdown', async () => {
  let { codeBlock } = await mountMarkdownViewer('# Doc\n\n:::content-slot alpha\n\nBetween.\n\n:::content-slot beta');

  let received = [];
  let composed = codeBlock.renderContentSlots((slot, key) => {
    received.push(key);
    let marker = document.createElement('div');
    marker.className = 'slot-marker';
    slot.append(marker);
  });

  assert.deepEqual(received, ['alpha', 'beta'], 'the composer receives every slot key in document order');
  assert.equal(composed.length, 2, 'renderContentSlots returns the composed host elements');
  let slots = codeBlock.querySelectorAll('.cb-md .cb-content-slot');
  assert.equal(slots.length, 2);
  for (let slot of slots) {
    assert.equal(slot.querySelectorAll('.slot-marker').length, 1, 'each slot has exactly one composed child');
  }
});

test('code block hands the composer its owned scroll viewport as scrollRoot', async () => {
  let { codeBlock } = await mountMarkdownViewer('# Doc\n\n:::content-slot main');
  let scroll = codeBlock.querySelector('.cb-scroll');
  let seen = [];

  codeBlock.renderContentSlots((slot, key, context) => {
    seen.push({ key, context });
  });

  assert.equal(seen.length, 1);
  assert.equal(seen[0].key, 'main');
  assert.equal(seen[0].context.scrollRoot, scroll);
});

test('code block keeps handing the same scrollRoot across re-compositions', async () => {
  let { codeBlock } = await mountMarkdownViewer('# One\n\n:::content-slot main');
  let roots = [];

  codeBlock.renderContentSlots((slot, key, context) => {
    roots.push(context.scrollRoot);
  });
  codeBlock.setContent('# Two\n\n:::content-slot main', 'md');
  await nextRenderTick();
  codeBlock.setContent('# Three\n\n:::content-slot main', 'md');
  await nextRenderTick();

  assert.equal(roots.length, 3);
  let scroll = codeBlock.querySelector('.cb-scroll');
  assert.ok(roots.every((root) => root === scroll));
});

test('source viewer forwards the scrollRoot composer context without loss', async () => {
  let { viewer, codeBlock } = await mountMarkdownViewer('# A\n\n:::content-slot main');
  let scroll = codeBlock.querySelector('.cb-scroll');
  let seen = [];

  viewer.renderContentSlots((slot, key, context) => {
    seen.push({ key, context });
  });

  assert.equal(seen.length, 1);
  assert.equal(seen[0].key, 'main');
  assert.equal(seen[0].context.scrollRoot, scroll);
});

test('code block recomposes content slots after each markdown replacement', async () => {
  let { codeBlock } = await mountMarkdownViewer('# One\n\n:::content-slot main');
  let root = codeBlock.querySelector('.cb-md');

  let composeCount = 0;
  codeBlock.renderContentSlots((slot) => {
    composeCount += 1;
    slot.append(document.createElement('div'));
  });
  assert.equal(composeCount, 1, 'registration composes once against the current content');

  codeBlock.setContent('# Two\n\n:::content-slot main', 'md');
  await nextRenderTick();
  assert.equal(composeCount, 2, 'a markdown replacement recomposes');

  codeBlock.setContent('# Three\n\n:::content-slot main', 'md');
  await nextRenderTick();
  codeBlock.setContent('# Four\n\n:::content-slot main', 'md');
  await nextRenderTick();
  assert.equal(composeCount, 4, 'each subsequent replacement recomposes exactly once');

  assert.equal(codeBlock.querySelector('.cb-md'), root, 'the markdown root node identity is stable across replacements');
  let slot = codeBlock.querySelector('.cb-md .cb-content-slot');
  assert.equal(slot.children.length, 1, 'each render composes exactly one child per slot');
});

test('code block stops composing content slots after clear', async () => {
  let { codeBlock } = await mountMarkdownViewer('# One\n\n:::content-slot main');

  let composeCount = 0;
  codeBlock.renderContentSlots((slot) => {
    composeCount += 1;
    slot.append(document.createElement('div'));
  });
  assert.equal(composeCount, 1);

  codeBlock.clearContentSlots();

  codeBlock.setContent('# Two\n\n:::content-slot main', 'md');
  await nextRenderTick();
  assert.equal(composeCount, 1, 'a cleared composer never recomposes');
  let slot = codeBlock.querySelector('.cb-md .cb-content-slot');
  assert.equal(slot.children.length, 0, 'no stale composed content remains');
});

test('code block disconnects the slot observer when removed from the document', async () => {
  let { codeBlock } = await mountMarkdownViewer('# One\n\n:::content-slot main');

  let composeCount = 0;
  codeBlock.renderContentSlots((slot) => {
    composeCount += 1;
    slot.append(document.createElement('div'));
  });
  assert.equal(composeCount, 1);

  codeBlock.remove();
  await nextRenderTick();

  codeBlock.setContent('# Two\n\n:::content-slot main', 'md');
  await nextRenderTick();
  assert.equal(composeCount, 1, 'a disconnected code block no longer composes on later renders');
});

test('source viewer forwards content slot and scroll APIs to the code block', async () => {
  let { viewer, codeBlock } = await mountMarkdownViewer();

  let calls = [];
  codeBlock.renderContentSlots = (composer) => { calls.push(['render', composer]); return ['slot']; };
  codeBlock.clearContentSlots = () => { calls.push(['clear']); };
  codeBlock.scrollToTop = (options) => { calls.push(['top', options]); };
  codeBlock.scrollToFragment = (id, options) => { calls.push(['scroll', id, options]); };

  let composer = () => {};
  assert.deepEqual(viewer.renderContentSlots(composer), ['slot']);
  viewer.clearContentSlots();
  viewer.scrollToTop({ behavior: 'auto' });
  viewer.scrollToFragment('sec', { behavior: 'auto' });

  assert.deepEqual(calls, [
    ['render', composer],
    ['clear'],
    ['top', { behavior: 'auto' }],
    ['scroll', 'sec', { behavior: 'auto' }],
  ]);
  assert.equal(typeof viewer.renderContentExtension, 'undefined', 'the legacy extension API is gone');
  assert.equal(typeof viewer.clearContentExtension, 'undefined', 'the legacy extension API is gone');
});

test('source viewer resets slot composition across files', async () => {
  let { viewer, codeBlock } = await mountMarkdownViewer('# A\n\n:::content-slot main');

  let composeCount = 0;
  viewer.renderContentSlots((slot) => {
    composeCount += 1;
    slot.append(document.createElement('div'));
  });
  assert.equal(composeCount, 1);

  viewer.showFile({ path: 'docs/b.md', raw: '# B\n\n:::content-slot main', lang: 'md' });
  await nextRenderTick();
  assert.equal(composeCount, 1, 'a stale composer never leaks into the next file');
  let slot = codeBlock.querySelector('.cb-md .cb-content-slot');
  assert.equal(slot.children.length, 0, 'the next file renders its slots empty');
});

test('source viewer keeps clean markdown source separate from rendered slot directives', async () => {
  let { viewer, codeBlock } = await mountMarkdownViewer();
  viewer.showFile({
    path: 'docs/media.md',
    raw: '# Article\n\n[Original link](https://example.test/video)',
    renderedRaw: '# Article\n\n:::content-slot media-player',
    lang: 'md',
  });
  viewer.renderContentSlots((slot) => slot.append(document.createElement('div')));

  assert.ok(codeBlock.querySelector('[data-content-slot="media-player"]'));
  await viewer.toggleMode();
  assert.match(codeBlock.textContent, /Original link/);
  assert.doesNotMatch(codeBlock.textContent, /content-slot/);

  await viewer.toggleMode();
  await nextRenderTick();
  assert.ok(codeBlock.querySelector('[data-content-slot="media-player"]'));
});

test('code block scrollToFragment scrolls the scroll container to a rendered anchor', async () => {
  let { codeBlock } = await mountMarkdownViewer('# Doc\n\n:::content-slot main');
  codeBlock.renderContentSlots((slot) => {
    let anchor = document.createElement('div');
    anchor.id = 'section-2';
    slot.append(anchor);
  });

  let scroll = codeBlock.querySelector('.cb-scroll');
  assert.ok(scroll.contains(document.getElementById('section-2')), 'anchor is part of the rendered flow');

  let scrolledTop = null;
  scroll.scrollTo = (opts) => { scrolledTop = opts.top; };
  codeBlock.scrollToFragment('section-2');
  assert.equal(typeof scrolledTop, 'number', 'the scroll container is scrolled to the anchor');
});

test('code block scrollToTop resets both viewport axes with the requested behavior', async () => {
  let { codeBlock } = await mountMarkdownViewer('# Doc');
  let scroll = codeBlock.querySelector('.cb-scroll');
  let scrollOptions = null;
  scroll.scrollTo = (options) => { scrollOptions = options; };

  codeBlock.scrollToTop({ behavior: 'auto' });

  assert.deepEqual(scrollOptions, {
    top: 0,
    left: 0,
    behavior: 'auto',
  });
});

test('code block scrollToFragment is a no-op for a missing or invalid id', async () => {
  let { codeBlock } = await mountMarkdownViewer();
  let scroll = codeBlock.querySelector('.cb-scroll');
  scroll.scrollTo = () => { throw new Error('unexpected scroll'); };

  assert.doesNotThrow(() => codeBlock.scrollToFragment('does-not-exist'));
  assert.doesNotThrow(() => codeBlock.scrollToFragment(''));
  assert.doesNotThrow(() => codeBlock.scrollToFragment(null));
});

test('code block scrollToFragment honors reduced motion and explicit behavior', async () => {
  let { codeBlock } = await mountMarkdownViewer('# Doc\n\n:::content-slot main');
  codeBlock.renderContentSlots((slot) => {
    let anchor = document.createElement('div');
    anchor.id = 'section-x';
    slot.append(anchor);
  });

  let scroll = codeBlock.querySelector('.cb-scroll');
  let behaviorSeen = null;
  scroll.scrollTo = (opts) => { behaviorSeen = opts.behavior; };

  window.matchMedia = () => ({ matches: true });
  codeBlock.scrollToFragment('section-x');
  assert.equal(behaviorSeen, 'auto', 'reduced motion resolves the default behavior to auto');

  codeBlock.scrollToFragment('section-x', { behavior: 'smooth' });
  assert.equal(behaviorSeen, 'smooth', 'an explicit behavior is honored under reduced motion');

  window.matchMedia = () => ({ matches: false });
  codeBlock.scrollToFragment('section-x');
  assert.equal(behaviorSeen, 'smooth', 'without reduced motion the default behavior is smooth');

  delete window.matchMedia;
});

test('source-contract: parseGitDiffPatch parses raw diff patches', async () => {
  const patch = `
--- a/src/index.js
+++ b/src/index.js
@@ -1,3 +1,4 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 const d = 5;
`;

  const parsed = import.meta.resolve ? (await import('../display/source-contract.js')).parseGitDiffPatch(patch) : null;
  if (parsed) {
    assert.equal(parsed.path, 'src/index.js');
    assert.equal(parsed.hunks.length, 1);
    let hunk = parsed.hunks[0];
    assert.equal(hunk.lines.length, 5);
    assert.equal(hunk.lines[0].type, 'normal');
    assert.equal(hunk.lines[1].type, 'deletion');
    assert.equal(hunk.lines[1].originalLineNumber, 2);
    assert.equal(hunk.lines[1].modifiedLineNumber, null);
    assert.equal(hunk.lines[2].type, 'addition');
    assert.equal(hunk.lines[2].originalLineNumber, null);
    assert.equal(hunk.lines[2].modifiedLineNumber, 2);
  }
});

test('source-contract: normalizeDiffData keeps line metadata safe and structured', async () => {
  let { normalizeDiffData } = await import('../display/source-contract.js');
  let normalized = normalizeDiffData({
    path: 'src/app.js',
    hunks: [
      {
        header: '@@ -1 +1 @@',
        lines: [
          {
            type: 'addition',
            originalLineNumber: 'bad',
            modifiedLineNumber: '4',
            content: '<script>',
            diagnostics: [
              { severity: 'warning', message: 'Review this line', code: 42 },
              { severity: 'critical', label: 'Unknown severity' },
            ],
          },
        ],
      },
    ],
  });

  let line = normalized.hunks[0].lines[0];
  assert.equal(line.originalLineNumber, null);
  assert.equal(line.modifiedLineNumber, 4);
  assert.equal(line.content, '<script>');
  assert.deepEqual(line.diagnostics, [
    { severity: 'warning', message: 'Review this line', code: '42' },
    { severity: 'info', message: 'Unknown severity', code: '' },
  ]);
});

test('code-block: comprehensive presentation contract', async () => {
  installDom();
  await defineSourceViewerElements();

  let cb = document.createElement('code-block');
  cb.setAttribute('copyable', '');
  cb.setAttribute('language-label', 'Python');
  cb.setAttribute('line-numbers', 'hide');
  cb.setAttribute('frameless', '');

  assert.equal(cb.copyable, true);
  assert.equal(cb.languageLabel, 'Python');
  assert.equal(cb.lineNumbers, 'hide');
  assert.equal(cb.frameless, true);

  document.body.append(cb);
  await nextRenderTick();

  assert.equal(cb.copyable, true);
  assert.equal(cb.languageLabel, 'Python');
  assert.equal(cb.lineNumbers, 'hide');
  assert.equal(cb.frameless, true);

  assert.equal(cb.hasAttribute('copyable'), true);
  assert.equal(cb.getAttribute('language-label'), 'Python');
  assert.equal(cb.getAttribute('line-numbers'), 'hide');
  assert.equal(cb.hasAttribute('frameless'), true);
  assert.equal(cb.$.toolbarVisible, true);

  cb.setAttribute('language-label', 'Rust');
  cb.setAttribute('line-numbers', 'show');
  await nextRenderTick();

  assert.equal(cb.languageLabel, 'Rust');
  assert.equal(cb.lineNumbers, 'show');
  assert.equal(cb.getAttribute('language-label'), 'Rust');
  assert.equal(cb.getAttribute('line-numbers'), null);

  cb.remove();
  await nextRenderTick();
  document.body.append(cb);
  await nextRenderTick();

  assert.equal(cb.languageLabel, 'Rust');
  assert.equal(cb.lineNumbers, 'show');
  assert.equal(cb.getAttribute('language-label'), 'Rust');
  assert.equal(cb.getAttribute('line-numbers'), null);

  cb.lineNumbers = 'invalid-value';
  await nextRenderTick();
  assert.equal(cb.lineNumbers, 'show');
  assert.equal(cb.getAttribute('line-numbers'), null);

  cb.lineNumbers = 'hide';
  await nextRenderTick();
  assert.equal(cb.lineNumbers, 'hide');
  assert.equal(cb.getAttribute('line-numbers'), 'hide');

  let copyData = null;
  let simulateError = false;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      clipboard: {
        writeText: async (text) => {
          if (simulateError) {
            throw new Error('Clipboard failed');
          }
          copyData = text;
          return true;
        }
      }
    },
    configurable: true,
    writable: true
  });

  let events = [];
  cb.addEventListener('code-block-copy', (e) => {
    events.push(e.detail);
  });

  cb.setContent('print("Hello")', 'python');
  await nextRenderTick();

  let success = await cb.copyContent();
  assert.equal(success, true);
  assert.equal(copyData, 'print("Hello")');
  assert.equal(events.length, 1);
  assert.equal(events[0].success, true);
  assert.equal(events[0].content, 'print("Hello")');

  simulateError = true;
  success = await cb.copyContent();
  assert.equal(success, false);
  assert.equal(events.length, 2);
  assert.equal(events[1].success, false);
  assert.equal(events[1].content, 'print("Hello")');
  assert.ok(events[1].error);
  assert.equal(events[1].error.message, 'Clipboard failed');

  assert.ok(cb._copyTimer);
  cb.remove();
  assert.equal(cb._copyTimer, null);

  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', originalNavigator);
  } else {
    delete globalThis.navigator;
  }
});
