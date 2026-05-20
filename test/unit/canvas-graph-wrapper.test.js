import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const symbioteNodeUiUrl = pathToFileURL(resolve(repoRoot, 'packages', 'symbiote-node', 'ui', 'index.js')).href;
const loaderSource = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'symbiote-node/ui') {
    return { url: ${JSON.stringify(symbioteNodeUiUrl)}, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
`;

register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

describe('CanvasGraph portal wrapper', () => {
  let hadCustomElements;
  let hadHTMLElement;
  let hadWindow;
  let hadCSSStyleSheet;
  let hadDocument;
  let registry;

  before(() => {
    hadCustomElements = 'customElements' in globalThis;
    hadHTMLElement = 'HTMLElement' in globalThis;
    hadWindow = 'window' in globalThis;
    hadCSSStyleSheet = 'CSSStyleSheet' in globalThis;
    hadDocument = 'document' in globalThis;

    registry = new Map();
    globalThis.customElements = {
      define(name, constructor) {
        registry.set(name, constructor);
      },
      get(name) {
        return registry.get(name);
      },
    };
    globalThis.HTMLElement = class {};
    globalThis.window = globalThis;
    globalThis.CSSStyleSheet = class {
      replaceSync(cssText) {
        this.cssText = cssText;
      }
    };
    globalThis.document = { createElement() { return {}; } };
  });

  after(() => {
    if (!hadCustomElements) delete globalThis.customElements;
    if (!hadHTMLElement) delete globalThis.HTMLElement;
    if (!hadWindow) delete globalThis.window;
    if (!hadCSSStyleSheet) delete globalThis.CSSStyleSheet;
    if (!hadDocument) delete globalThis.document;
  });

  it('registers the portal tag as a thin extension of the library canvas graph', async () => {
    const [{ CanvasGraph }, { CanvasGraph: BaseCanvasGraph }] = await Promise.all([
      import('../../web/components/CanvasGraph/CanvasGraph.js?wrapper-test'),
      import('symbiote-node/ui'),
    ]);

    assert.equal(customElements.get('canvas-graph'), BaseCanvasGraph);
    assert.equal(customElements.get('pg-canvas-graph'), CanvasGraph);
    assert.equal(Object.getPrototypeOf(CanvasGraph.prototype), BaseCanvasGraph.prototype);
    assert.notEqual(CanvasGraph.rootStyleSheets, BaseCanvasGraph.rootStyleSheets);
    assert.equal(CanvasGraph.rootStyleSheets.length, BaseCanvasGraph.rootStyleSheets.length + 1);

    for (let method of [
      'setGraphModel',
      'setLayoutSnapshot',
      'setPath',
      'resetView',
      'fitView',
      'flyToNode',
      'focusSemanticCluster',
    ]) {
      assert.equal(typeof CanvasGraph.prototype[method], 'function', `${method} must be inherited`);
    }
  });
});
