import { before, describe, it } from 'node:test';
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

describe('dep-graph-modes', () => {
  let getNextPathStyle;
  let getPathStyleDisplay;
  let resolveInitialViewMode;

  before(async () => {
    ({
      getNextPathStyle,
      getPathStyleDisplay,
      resolveInitialViewMode,
    } = await import('../../web/panels/dep-graph-modes.js'));
  });

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
