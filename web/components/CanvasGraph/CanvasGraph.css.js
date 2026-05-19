export default `
  :host {
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--sn-bg, #0f172a);
  }
  pg-canvas-graph > canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: block;
    outline: none;
    user-select: none;
    cursor: default;
  }
  pg-canvas-graph > canvas.grabbing { cursor: grabbing; }
  pg-canvas-graph > graph-breadcrumb {
    position: absolute;
    top: 16px;
    left: 16px;
    z-index: 10;
  }
`;
