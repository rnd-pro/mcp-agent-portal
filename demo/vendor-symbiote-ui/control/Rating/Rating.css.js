export default /*css*/ `
sn-rating {
  display: inline-block;
  box-sizing: border-box;
  font-family: var(--sn-font);
  color: var(--sn-sys-on-surface);
  outline: none;
}

.sn-rating-container {
  display: inline-flex;
  align-items: center;
  gap: var(--sn-rating-gap, 4px);
  cursor: pointer;
}

.sn-rating-star {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--sn-rating-size, 20px);
  block-size: var(--sn-rating-size, 20px);
  color: var(--sn-rating-star-empty-color, color-mix(in oklab, var(--sn-sys-on-surface) 20%, transparent));
  transition: transform var(--sn-transition-fast, 100ms) ease, color var(--sn-transition-fast, 100ms) ease;
}

.sn-rating-star svg {
  inline-size: 100%;
  block-size: 100%;
  fill: currentColor;
}

.sn-rating-star[data-active] {
  color: var(--sn-rating-star-active-color, var(--sn-sys-accent));
}

sn-rating:not([disabled]):not([readonly]) .sn-rating-star:hover {
  transform: scale(1.15);
}

sn-rating:focus-visible .sn-rating-container {
  outline: var(--sn-rating-focus-ring, 2px solid var(--sn-sys-focus-ring, currentColor));
  outline-offset: 4px;
  border-radius: var(--sn-radius-xs);
}

sn-rating[disabled] {
  opacity: var(--sn-rating-disabled-opacity, 0.5);
}

sn-rating[disabled] .sn-rating-container {
  cursor: not-allowed;
}

sn-rating[readonly] .sn-rating-container {
  cursor: default;
}
`;
