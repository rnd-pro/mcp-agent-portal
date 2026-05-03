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
  /* Layered backgrounds for smooth blending without banding (dithering via noise) */
  background: 
    /* 1. Subtle curved glass glare */
    radial-gradient(ellipse 80% 50% at 50% -10%, rgba(255,255,255,0.02) 0%, transparent 100%),
    /* 2. Smooth Vignette: transparent center -> 100% opaque edges */
    radial-gradient(ellipse at 50% 50%, transparent 20%, rgba(26,26,26, 0.7) 70%, rgba(26,26,26, 1) 100%),
    /* 3. Dithering noise to completely eliminate CSS gradient color banding */
    url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.5' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
}
`;
