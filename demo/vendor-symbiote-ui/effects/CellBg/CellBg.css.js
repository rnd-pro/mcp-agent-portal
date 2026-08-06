export default `
:host {
  display: block;
}

cell-bg {
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}
cell-bg canvas {
  width: 100%;
  height: 100%;
  display: block;
  background: var(--sn-cell-bg);
}
cell-bg::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 50% -10%, var(--sn-cell-glare) 0%, transparent 100%),
    radial-gradient(circle at 50% 50%, transparent 20%, var(--sn-cell-vignette-mid) 70%, var(--sn-cell-vignette-edge) 100%),
    var(--sn-cell-noise);
}
`;
