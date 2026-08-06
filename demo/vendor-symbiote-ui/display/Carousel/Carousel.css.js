import { themedScrollFadeInlineStyles } from '../../themes/scroll-fade-styles.js';

export default /*css*/ `
sn-carousel {
  display: block;
  font-family: var(--sn-font, sans-serif);
  width: 100%;
  box-sizing: border-box;
}

.sn-carousel-container {
  position: relative;
  width: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

.sn-carousel-viewport {
  display: flex;
  overflow-x: auto;
  ${themedScrollFadeInlineStyles}
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  width: 100%;
  height: 100%;
  scrollbar-width: none;
}

.sn-carousel-viewport::-webkit-scrollbar {
  display: none;
}

.sn-carousel-viewport > ::slotted(*) {
  flex: 0 0 100%;
  width: 100%;
  scroll-snap-align: start;
}

.sn-carousel-nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  background-color: var(--sn-sys-surface-panel);
  border: 1px solid var(--sn-sys-outline-subtle);
  color: var(--sn-sys-on-surface);
  border-radius: 50%;
  width: 32px;
  height: 32px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--sn-sys-shadow-raised);
  transition: opacity var(--sn-transition-fast, 120ms);
}

.sn-carousel-nav-btn:hover {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel));
  border-color: var(--sn-sys-accent);
}

.sn-carousel-nav-prev {
  left: var(--sn-step-4);
}

.sn-carousel-nav-next {
  right: var(--sn-step-4);
}

.sn-carousel-pagination {
  display: flex;
  justify-content: center;
  gap: var(--sn-step-3);
  margin-top: var(--sn-step-6);
}

.sn-carousel-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
  padding: 0;
  border: none;
  transition: background-color var(--sn-transition-fast, 120ms);
}

.sn-carousel-dot[data-active] {
  background-color: var(--sn-sys-accent);
}
`;
