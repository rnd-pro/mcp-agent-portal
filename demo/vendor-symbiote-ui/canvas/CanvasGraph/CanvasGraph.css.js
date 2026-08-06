export default `
  :host,
  canvas-graph {
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--sn-sys-surface);
  }
  canvas-graph > canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: block;
    outline: none;
    user-select: none;
    touch-action: none;
    cursor: default;
  }
  canvas-graph > canvas.grabbing { cursor: grabbing; }
  canvas-graph > graph-breadcrumb {
    position: absolute;
    top: var(--sn-step-8);
    left: var(--sn-step-8);
    z-index: 10;
  }
`;
