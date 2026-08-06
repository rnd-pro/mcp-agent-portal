import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';

class TestCSSStyleSheet {
  replaceSync(text) {
    this.cssText = text;
  }
}

function installSsrDom() {
  let { window } = parseHTML('<!doctype html><html><body></body></html>');
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
    TextEncoder,
    CSSStyleSheet: TestCSSStyleSheet,
  });
  window.document.adoptedStyleSheets = [];
  Object.defineProperty(window.HTMLElement.prototype, 'adoptedStyleSheets', {
    configurable: true,
    get() {
      return this.__symbioteSsrSheets || [];
    },
    set(value) {
      this.__symbioteSsrSheets = value;
    },
  });
  globalThis.getComputedStyle = (element) => {
    return {
      getPropertyValue(prop) {
        return element.style?.getPropertyValue?.(prop) || '';
      }
    };
  };
  return window;
}

async function nextRenderTick() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('DatePicker rendering and value sync', async () => {
  installSsrDom();
  await import('../control/DatePicker/DatePicker.js');
  const el = document.createElement('sn-date-picker');
  document.body.append(el);
  await nextRenderTick();

  assert.equal(el.value, '');
  el.value = '2026-06-01';
  await nextRenderTick();
  assert.equal(el.getAttribute('value'), '2026-06-01');
  assert.equal(el.$.calendarTitle, 'June 2026');
  assert.equal(el.ref.nativeInput.value, '2026-06-01');

  let changed = null;
  el.addEventListener('sn-control-change', (event) => {
    changed = event.detail.value;
  });
  const dayCell = Array.from(el.ref.calendarGrid.querySelectorAll('.sn-calendar-day'))
    .find((cell) => cell.textContent === '2' && !cell.hasAttribute('data-other-month'));
  dayCell.dispatchEvent(new Event('click', { bubbles: true }));
  await nextRenderTick();
  assert.equal(el.value, '2026-06-02');
  assert.equal(changed, '2026-06-02');

  el.value = 'not-a-date';
  await nextRenderTick();
  assert.equal(el.ref.nativeInput.value, '');

  el.remove();
});

test('ColorPicker rendering and hex sync', async () => {
  installSsrDom();
  await import('../control/ColorPicker/ColorPicker.js');
  const el = document.createElement('sn-color-picker');
  document.body.append(el);
  await nextRenderTick();

  assert.equal(el.value, '#ffffff');
  el.value = '#ff0000';
  await nextRenderTick();
  assert.equal(el.getAttribute('value'), '#ff0000');

  let changes = [];
  el.addEventListener('sn-control-change', (event) => {
    changes.push(event.detail.value);
  });
  el.ref.hexInput.value = '#00ff00';
  el.ref.hexInput.dispatchEvent(new Event('input', { bubbles: true }));
  await nextRenderTick();
  assert.equal(el.value, '#00ff00');
  assert.deepEqual(changes, ['#00ff00']);

  const preset = el.ref.presets.querySelector('.sn-color-preset-swatch');
  preset.dispatchEvent(new Event('click', { bubbles: true }));
  await nextRenderTick();
  assert.equal(changes.at(-1), '#ff0000');

  el.disabled = true;
  await nextRenderTick();
  assert.equal(el.ref.hexInput.disabled, true);
  assert.equal(el.ref.hueSlider.disabled, true);

  el.remove();
});

test('FileUpload validates dropped files and emits selection errors', async () => {
  installSsrDom();
  await import('../control/FileUpload/FileUpload.js');
  const el = document.createElement('sn-file-upload');
  el.setAttribute('accept', 'image/*,.svg');
  el.setAttribute('max-size', '5');
  el.setAttribute('multiple', '');
  document.body.append(el);
  await nextRenderTick();

  assert.equal(el.hasAttribute('multiple'), true);
  assert.equal(el.ref.fileInput.accept, 'image/*,.svg');

  const errors = [];
  const selections = [];
  el.addEventListener('sn-file-error', (event) => errors.push(event.detail));
  el.addEventListener('sn-file-select', (event) => selections.push(event.detail.files));

  const accepted = { name: 'image.png', type: 'image/png', size: 4 };
  const wrongType = { name: 'notes.txt', type: 'text/plain', size: 1 };
  const tooLarge = { name: 'large.svg', type: 'image/svg+xml', size: 9 };
  const drop = new Event('drop', { bubbles: true });
  Object.defineProperty(drop, 'dataTransfer', {
    value: { files: [wrongType, accepted, tooLarge] },
  });
  el.ref.dropzone.dispatchEvent(drop);
  await nextRenderTick();

  assert.deepEqual(el.files, [accepted]);
  assert.equal(selections.length, 1);
  assert.equal(selections[0][0], accepted);
  assert.deepEqual(errors.map((item) => item.error), [
    'File type is not accepted.',
    'File size exceeds maximum allowed.',
  ]);

  el.remove();
});

test('Transfer list layout and components', async () => {
  installSsrDom();
  await import('../control/Transfer/Transfer.js');
  const el = document.createElement('sn-transfer');
  document.body.append(el);
  await nextRenderTick();

  assert.ok(el.ref?.sourceList);
  assert.ok(el.ref?.targetList);
  el.setData({ source: [{ value: 'a', label: 'Alpha' }] });
  await nextRenderTick();

  let changed = null;
  el.addEventListener('sn-control-change', (event) => {
    changed = event.detail.value;
  });
  const checkbox = el.ref.sourceList.querySelector('input[type="checkbox"]');
  checkbox.checked = true;
  checkbox.dispatchEvent(new Event('click', { bubbles: true }));
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  await nextRenderTick();

  assert.equal(el.ref.toTargetBtn.disabled, false);
  el.ref.toTargetBtn.dispatchEvent(new Event('click', { bubbles: true }));
  await nextRenderTick();
  assert.equal(el.value, 'a');
  assert.equal(changed, 'a');

  el.remove();
});

test('Mentions textarea wrapper overlay behavior', async () => {
  installSsrDom();
  await import('../control/Mentions/Mentions.js');
  const el = document.createElement('sn-mentions');
  document.body.append(el);
  await nextRenderTick();

  const textarea = document.createElement('textarea');
  el.appendChild(textarea);
  await nextRenderTick();

  assert.ok(el.ref?.dropdown);

  el.remove();
});

test('TagsInput chips and input key down behavior', async () => {
  installSsrDom();
  await import('../control/TagsInput/TagsInput.js');
  const el = document.createElement('sn-tags-input');
  document.body.append(el);
  await nextRenderTick();

  assert.ok(el.ref?.input);
  assert.ok(el.ref?.container);
  assert.ok(el.ref?.tagsList);

  el.remove();
});

test('PinInput OTP input progression and length', async () => {
  installSsrDom();
  await import('../control/PinInput/PinInput.js');
  const el = document.createElement('sn-pin-input');
  el.setAttribute('length', '4');
  document.body.append(el);
  await nextRenderTick();

  assert.equal(el.getAttribute('length'), '4');

  el.remove();
});

test('SplitPanel layout divider resizing handle', async () => {
  installSsrDom();
  await import('../layout/SplitPanel/SplitPanel.js');
  const el = document.createElement('sn-split-panel');
  document.body.append(el);
  await nextRenderTick();

  assert.ok(el.ref?.divider);
  assert.equal(el.orientation, 'horizontal');

  el.remove();
});

test('ScrollArea custom scrollbar container', async () => {
  installSsrDom();
  await import('../layout/ScrollArea/ScrollArea.js');
  const el = document.createElement('sn-scroll-area');
  document.body.append(el);
  await nextRenderTick();

  assert.ok(el.ref?.viewport);
  assert.ok(el.ref?.vScrollbar);
  assert.ok(el.ref?.hScrollbar);
  let detail = null;
  el.addEventListener('sn-scroll-area-scroll', (event) => {
    detail = event.detail;
  });
  el.scrollToPosition({ top: 12, left: 7 });
  assert.equal(el.scrollTop, 12);
  assert.equal(el.scrollLeft, 7);
  assert.equal(detail.scrollTop, 12);
  assert.equal(detail.scrollLeft, 7);

  el.remove();
});

test('FloatingPanel draggable panel controls', async () => {
  installSsrDom();
  await import('../layout/FloatingPanel/FloatingPanel.js');
  const el = document.createElement('sn-floating-panel');
  document.body.append(el);
  await nextRenderTick();

  assert.ok(el.ref?.header);
  assert.ok(el.ref?.closeBtn);

  el.remove();
});

test('AspectRatio styling constraints', async () => {
  installSsrDom();
  await import('../layout/AspectRatio/AspectRatio.js');
  const el = document.createElement('sn-aspect-ratio');
  el.setAttribute('ratio', '16/9');
  document.body.append(el);
  await nextRenderTick();

  assert.equal(el.getAttribute('ratio'), '16/9');

  el.remove();
});

test('Chart lines and categories visualization', async () => {
  installSsrDom();
  await import('../display/Chart/Chart.js');
  const el = document.createElement('sn-chart');
  document.body.append(el);
  await nextRenderTick();

  assert.ok(el.ref?.svg);
  el.setData([{ label: 'Loss', value: -5 }, { label: 'Gain', value: 10 }]);
  await nextRenderTick();
  const bars = Array.from(el.ref.svg.querySelectorAll('.sn-chart-bar'));
  assert.equal(bars.length, 2);
  assert.ok(bars.every((bar) => Number(bar.getAttribute('height')) > 0));
  assert.ok(bars.every((bar) => Number.isFinite(Number(bar.getAttribute('y')))));

  el.remove();
});

test('Chart theme aliases cover its CSS cascade tokens', async () => {
  const [styles, customElements, registry] = await Promise.all([
    readFile(new URL('../display/Chart/Chart.css.js', import.meta.url), 'utf8'),
    readFile(new URL('../custom-elements.json', import.meta.url), 'utf8').then(JSON.parse),
    import('../manifest/component-registry.js'),
  ]);
  const cssTokens = [...styles.matchAll(/var\((--sn-[a-z0-9-]+)/g)].map((match) => match[1]);
  const expectedTokens = [...new Set(cssTokens)];
  const registryAliases = registry.getComponent('sn-chart').contract.themeAliases;
  const chartDeclaration = customElements.modules
    .flatMap((module) => module.declarations || [])
    .find((declaration) => declaration.tagName === 'sn-chart');

  for (let token of expectedTokens) {
    assert.ok(registryAliases.includes(token), `registry is missing ${token}`);
    assert.ok(chartDeclaration.contract.themeAliases.includes(token), `custom-elements contract is missing ${token}`);
    assert.ok(chartDeclaration.metadata.contract.themeAliases.includes(token), `custom-elements metadata is missing ${token}`);
  }
});

test('RichTextEditor inline text editing toolbar', async () => {
  installSsrDom();
  await import('../control/RichTextEditor/RichTextEditor.js');
  let el = document.createElement('sn-rich-text-editor');
  document.body.append(el);
  await nextRenderTick();

  assert.ok(el.ref?.editor);
  assert.ok(el.ref?.toolbar);

  // Test setting/getting value
  el.value = '<p>Hello <strong>World</strong></p>';
  await nextRenderTick();
  assert.equal(el.value, '<p>Hello <strong>World</strong></p>');
  assert.equal(el.getAttribute('value'), '<p>Hello <strong>World</strong></p>');

  // Test HTML sanitization
  el.value = '<p style="color:red">Hello <script>alert(1);</script>World<a href="javascript:evil()" onclick="evil()">link</a><img src="data:image/svg+xml,<svg></svg>" onerror="evil()"></p>';
  await nextRenderTick();
  assert.equal(el.value.includes('<script>'), false);
  assert.equal(el.value.includes('javascript:'), false);
  assert.equal(el.value.includes('onerror'), false);
  assert.equal(el.value.includes('onclick'), false);
  assert.equal(el.value.includes('style='), false);
  assert.equal(el.value.includes('data:image/svg+xml'), false);
  assert.equal(el.value.includes('World'), true);

  // Test unsafe bypass attribute
  el.setAttribute('unsafe', '');
  el.value = '<p>Hello <script>alert(1);</script>World</p>';
  await nextRenderTick();
  assert.equal(el.value.includes('<script>'), true);
  el.removeAttribute('unsafe');
  await nextRenderTick();
  assert.equal(el.value.includes('<script>'), false);

  // Test disabled state
  assert.equal(el.ref.editor.getAttribute('contenteditable'), 'true');
  el.disabled = true;
  await nextRenderTick();
  assert.equal(el.ref.editor.getAttribute('contenteditable'), 'false');
  el.disabled = false;

  // Test events on input/blur
  let events = [];
  el.addEventListener('sn-control-change', (e) => {
    events.push(e.detail.value);
  });
  el.ref.editor.innerHTML = '<p style="color:red">User edit<img src="x" onerror="evil()"></p>';
  el.ref.editor.dispatchEvent(new Event('input', { bubbles: true }));
  await nextRenderTick();
  assert.equal(events.length, 1);
  assert.equal(events[0].includes('User edit'), true);
  assert.equal(events[0].includes('style='), false);
  assert.equal(events[0].includes('onerror'), false);

  el.remove();
});

test('Tour coachmark popovers overlay flow', async () => {
  installSsrDom();
  await import('../display/Tour/Tour.js');
  const el = document.createElement('sn-tour');
  document.body.append(el);
  await nextRenderTick();

  assert.ok(el.ref?.popover);

  el.remove();
});

test('Carousel slide indicators and navigation', async () => {
  installSsrDom();
  await import('../display/Carousel/Carousel.js');
  const el = document.createElement('sn-carousel');
  document.body.append(el);
  await nextRenderTick();

  assert.ok(el.ref?.prevBtn);
  assert.ok(el.ref?.nextBtn);

  el.remove();
});

test('QrCode SVG grid rendering', async () => {
  installSsrDom();
  await import('../display/QrCode/QrCode.js');
  const el = document.createElement('sn-qr-code');
  el.setAttribute('value', 'https://example.com');
  document.body.append(el);
  await nextRenderTick();

  assert.equal(el.getAttribute('value'), 'https://example.com');
  assert.equal(el.ref.svg.getAttribute('viewBox'), '0 0 25 25');
  let modules = Array.from(el.ref.svg.querySelectorAll('.sn-qr-module'));
  assert.equal(modules.length, 340);
  assert.equal(modules.some((rect) => rect.getAttribute('fill')), false);
  assert.ok(modules.some((rect) => rect.getAttribute('x') === '0' && rect.getAttribute('y') === '0'));

  el.value = 'hello';
  await nextRenderTick();
  assert.equal(el.ref.svg.getAttribute('viewBox'), '0 0 21 21');
  modules = Array.from(el.ref.svg.querySelectorAll('.sn-qr-module'));
  assert.equal(modules.length, 226);

  const firstSvg = el.ref.svg.innerHTML;
  el.value = 'https://example.org';
  await nextRenderTick();
  assert.notEqual(el.ref.svg.innerHTML, firstSvg);

  let qrError = null;
  el.addEventListener('sn-qr-error', (event) => {
    qrError = event.detail;
  });
  el.value = 'x'.repeat(90);
  await nextRenderTick();
  assert.equal(el.ref.svg.hasAttribute('data-error'), true);
  assert.equal(qrError.value, 'x'.repeat(90));

  el.remove();
});

test('VideoPlayer custom styled media tracking controls', async () => {
  installSsrDom();
  await import('../display/VideoPlayer/VideoPlayer.js');
  const el = document.createElement('sn-video-player');
  document.body.append(el);
  await nextRenderTick();

  assert.ok(el.ref?.video);
  assert.ok(el.ref?.playBtn);

  el.remove();
});
