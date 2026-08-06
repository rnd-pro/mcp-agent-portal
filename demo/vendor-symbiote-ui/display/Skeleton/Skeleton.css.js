export default /*css*/ `
sn-skeleton {
  display: block;
  box-sizing: border-box;
  background: var(--sn-skeleton-bg, var(--sn-sys-outline-subtle));
  border-radius: var(--sn-skeleton-radius, 4px);
  width: var(--sn-skeleton-width, 100%);
  height: var(--sn-skeleton-height, 1em);
  position: relative;
  overflow: hidden;
}

sn-skeleton[hidden] {
  display: none !important;
}

sn-skeleton[variant="circle"] {
  border-radius: 50%;
  width: var(--sn-skeleton-size, 32px);
  height: var(--sn-skeleton-size, 32px);
}

sn-skeleton[variant="text"] {
  height: 0.75em;
  margin-top: var(--sn-space-xs, 0.125em);
  margin-bottom: var(--sn-space-xs, 0.125em);
  width: 85%;
}

/* Animations */
sn-skeleton[animation="pulse"] {
  animation: sn-skeleton-pulse var(--sn-transition-slow, 1.2s) ease-in-out infinite;
}

sn-skeleton[animation="shimmer"]::after {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  transform: translateX(-100%);
  background-image: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in oklch, var(--sn-sys-on-surface) var(--sn-sys-state-hover-mix), transparent) 20%,
    var(--sn-sys-outline) 60%,
    transparent 100%
  );
  animation: sn-skeleton-shimmer var(--sn-transition-slow, 1.2s) infinite;
}

@keyframes sn-skeleton-pulse {
  0% { opacity: 1; }
  50% { opacity: 0.4; }
  100% { opacity: 1; }
}

@keyframes sn-skeleton-shimmer {
  100% { transform: translateX(100%); }
}

@media (prefers-reduced-motion: reduce) {
  sn-skeleton[animation="pulse"],
  sn-skeleton[animation="shimmer"]::after {
    animation: none !important;
  }
}
`;
