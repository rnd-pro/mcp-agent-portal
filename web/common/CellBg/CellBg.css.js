export default `
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
  background: #1a1a1a;
}
/* CRT Glass & Vignette Overlay */
cell-bg::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* Deep vignette: stacked shadows ensure 100% opacity precisely at the edge, with a smooth parabolic fade */
  box-shadow: inset 0 0 80px rgba(26,26,26, 1), inset 0 0 160px rgba(26,26,26, 0.8), inset 0 0 250px rgba(26,26,26, 0.6);
  /* Subtle curved glass glare at the top */
  background: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(255,255,255,0.02) 0%, transparent 100%);
}
`;
