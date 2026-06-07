import {
  createXRProjectDeepGraphProjection,
} from 'symbiote-ui/xr';

export function createPortalXRDeepGraphScene(skeleton, options = {}) {
  let projection = createXRProjectDeepGraphProjection(skeleton, {
    ...options,
    mode: options.mode || 'agent-portal-project-graph-deep-dive',
  });

  return {
    version: 'agent-portal-xr-deep-graph-adapter-v1',
    graphModel: projection.graphModel,
    scene: projection.scene,
    preview: projection.preview,
    previewSummary: projection.previewSummary,
    focus: projection.focus,
    diagnostics: {
      ...projection.diagnostics,
      projectId: options.projectId || null,
    },
  };
}
