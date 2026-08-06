export default /*css*/ `
sn-progress-bar {
  display: block;
  box-sizing: border-box;
  width: 100%;
  height: var(--sn-progress-bar-height, 6px);
  background: var(--sn-progress-bg, var(--sn-sys-outline-subtle));
  border-radius: var(--sn-progress-radius, 3px);
  overflow: hidden;
  position: relative;
}

sn-progress-bar[hidden] {
  display: none !important;
}

.sn-progress-bar-fill {
  height: 100%;
  background: var(--sn-progress-fill, var(--sn-sys-accent));
  transition: width var(--sn-transition-normal, 240ms) ease;
  width: 0%;
}

sn-progress-bar[indeterminate] .sn-progress-bar-fill {
  width: 50%;
  position: absolute;
  animation: sn-progress-bar-indet var(--sn-transition-slow, 1.2s) infinite linear;
  transform-origin: left;
}

@keyframes sn-progress-bar-indet {
  0% {
    left: -50%;
    transform: scaleX(1);
  }
  50% {
    left: 25%;
    transform: scaleX(1.5);
  }
  100% {
    left: 100%;
    transform: scaleX(0.5);
  }
}

sn-progress-ring {
  display: inline-block;
  box-sizing: border-box;
  width: var(--sn-progress-ring-size, 36px);
  height: var(--sn-progress-ring-size, 36px);
  position: relative;
}

sn-progress-ring[hidden] {
  display: none !important;
}

.sn-progress-ring-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.sn-progress-ring-track {
  fill: none;
  stroke: var(--sn-progress-bg, var(--sn-sys-outline-subtle));
  stroke-width: var(--sn-progress-ring-stroke, 4px);
}

.sn-progress-ring-fill {
  fill: none;
  stroke: var(--sn-progress-fill, var(--sn-sys-accent));
  stroke-width: var(--sn-progress-ring-stroke, 4px);
  stroke-linecap: round;
  transition: stroke-dashoffset var(--sn-transition-normal, 240ms) ease;
}

sn-progress-ring[indeterminate] .sn-progress-ring-svg {
  animation: sn-progress-ring-rot var(--sn-animation-duration-slower, 2s) linear infinite;
}

sn-progress-ring[indeterminate] .sn-progress-ring-fill {
  animation: sn-progress-ring-dash var(--sn-animation-duration-slow, 1.5s) ease-in-out infinite;
}

@keyframes sn-progress-ring-rot {
  100% { transform: rotate(270deg); }
}

@keyframes sn-progress-ring-dash {
  0% {
    stroke-dasharray: 1, 150;
    stroke-dashoffset: 0;
  }
  50% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -35;
  }
  100% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -124;
  }
}

sn-spinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: var(--sn-spinner-size, 1em);
  height: var(--sn-spinner-size, 1em);
  color: inherit;
}

sn-spinner[hidden] {
  display: none !important;
}

.sn-spinner-indicator {
  display: inline-block;
  width: 100%;
  height: 100%;
  border: var(--sn-spinner-stroke, 2px) solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: sn-spinner-rot var(--sn-transition-slow, 600ms) linear infinite;
}

@keyframes sn-spinner-rot {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  sn-progress-bar[indeterminate] .sn-progress-bar-fill,
  sn-progress-ring[indeterminate] .sn-progress-ring-svg,
  sn-progress-ring[indeterminate] .sn-progress-ring-fill,
  .sn-spinner-indicator {
    animation-duration: var(--sn-animation-duration-slower, 2.5s);
  }
}
`;
