export default /*css*/ `
sn-toast-region {
  position: fixed;
  bottom: var(--sn-step-10);
  right: var(--sn-step-10);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: var(--sn-step-4);
  max-width: min(calc(100% - 48px), 380px);
  pointer-events: none;
}

.sn-toast-region-container {
  display: flex;
  flex-direction: column;
  gap: var(--sn-step-4);
}

sn-toast {
  display: block;
  pointer-events: auto;
  animation: snToastSlideIn var(--sn-transition-normal, 240ms) cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

sn-toast[data-dismissing] {
  animation: snToastFadeOut var(--sn-transition-normal, 240ms) ease forwards;
}

.sn-toast-card {
  display: flex;
  align-items: flex-start;
  gap: var(--sn-step-6);
  padding: calc(var(--sn-step-6, 12px) * var(--sn-theme-density, 1)) calc(var(--sn-step-8, 16px) * var(--sn-theme-density, 1));
  background-color: var(--sn-sys-surface-overlay);
  border: 1px solid var(--sn-sys-outline-subtle);
  border-radius: var(--sn-panel-radius, 6px);
  box-shadow: var(--sn-sys-shadow-overlay);
  color: var(--sn-sys-on-surface);
  font-family: var(--sn-font, sans-serif);
  font-size: calc(var(--sn-text-md, 13px) * var(--sn-theme-type-scale, 1));
  box-sizing: border-box;
}

.sn-toast-icon {
  flex-shrink: 0;
  margin-top: var(--sn-step-0, 1px);
}

.sn-toast-message {
  flex-grow: 1;
  line-height: 1.4;
  word-break: break-word;
}

.sn-toast-close {
  background: transparent;
  border: none;
  color: var(--sn-sys-on-surface-dim);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--sn-step-1);
  border-radius: var(--sn-radius-sm);
  margin-top: var(--sn-step-0, 1px);
  transition: background-color var(--sn-transition-fast, 120ms), color var(--sn-transition-fast, 120ms);
}

.sn-toast-close:hover {
  background-color: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent);
  color: var(--sn-sys-on-surface);
}

/* Variant Styles */
.sn-toast-card.sn-toast-info .sn-toast-icon {
  color: var(--sn-sys-info);
}

.sn-toast-card.sn-toast-success .sn-toast-icon {
  color: var(--sn-sys-success);
}

.sn-toast-card.sn-toast-warning .sn-toast-icon {
  color: var(--sn-sys-warning);
}

.sn-toast-card.sn-toast-error .sn-toast-icon {
  color: var(--sn-sys-danger);
}

@keyframes snToastSlideIn {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes snToastFadeOut {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.9);
  }
}
`;
