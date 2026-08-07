import 'symbiote-ui/display/code-block';
import { configureMaterialSymbols } from 'symbiote-ui/canvas/node-canvas';
import { enhanceLibraryPages, enhanceDocsCodeBlocks } from 'library-pages/client';

// Icons resolve against the locally copied stylesheet so no external font host is contacted.
configureMaterialSymbols({
  hrefBuilder: () => '../../icons/material-symbols.css',
});

enhanceLibraryPages();
enhanceDocsCodeBlocks();

let stage = document.querySelector('[data-node-preview]');
if (stage) {
  let previewRoot = stage.closest('.node-preview');
  let fallback = stage.querySelector('.node-preview-fallback');
  let enhanceNodePreview = async () => {
    try {
      await customElements.whenDefined('node-canvas');
      let canvas = document.createElement('node-canvas');
      stage.append(canvas);
      canvas.setPresentationMode(true);
      canvas.setEditorModel({
        readonly: true,
        nodes: [
          { id: 'source', type: 'docs/source', name: 'Source', outputs: [{ name: 'value', type: 'number', label: 'value' }] },
          { id: 'double', type: 'docs/double', name: 'Double', inputs: [{ name: 'value', type: 'number', label: 'value' }], outputs: [{ name: 'result', type: 'number', label: 'result' }] },
        ],
        connections: [{ id: 'source-to-double', from: 'source', out: 'value', to: 'double', in: 'value' }],
        positions: { source: [48, 74], double: { x: 300, y: 74 } },
      });
      await new Promise((resolve) => requestAnimationFrame(resolve));

      let refitQueued = false;
      let refit = () => {
        if (refitQueued) return;
        refitQueued = true;
        requestAnimationFrame(() => {
          refitQueued = false;
          canvas.flyToNodes(['source', 'double'], { padding: 24, minZoom: 0.35, maxZoom: 1, select: false });
        });
      };
      refit();
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(refit).observe(stage);
      }

      previewRoot?.classList.add('is-ready');
      fallback?.setAttribute('hidden', '');
    } catch {
      // Keep the static fallback as the source of truth if the optional component cannot load.
    }
  };
  enhanceNodePreview();
}
