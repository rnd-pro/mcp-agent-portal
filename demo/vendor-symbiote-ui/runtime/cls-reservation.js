/**
 * CLS Reservation Protocol
 *
 * Provides utilities to reserve layout footprint, show loading skeletons, and smoothly
 * swap in dynamically registered components without causing Cumulative Layout Shift.
 *
 * @module symbiote-ui/runtime/cls-reservation
 */

function appendNode(parent, child) {
  if (typeof parent.append === 'function') {
    parent.append(child);
  } else {
    parent.appendChild?.(child);
  }
}

function removeNode(node) {
  if (typeof node.remove === 'function') {
    node.remove();
  } else if (node.parentNode?.removeChild) {
    node.parentNode.removeChild(node);
  }
}

/**
 * Reserve a layout space with a skeleton loader, then swap the component once ready.
 * @param {HTMLElement} [parent] - Optional container to mount the placeholder.
 * @param {object} [options]
 * @param {string|number} [options.width='100%']
 * @param {string|number} [options.height='100px']
 * @param {number|string} [options.aspectRatio]
 * @param {boolean} [options.skeleton=true]
 * @param {boolean} [options.animation=true]
 * @param {Document} [options.document]
 * @returns {object} reservation control interface
 */
export function reserveLayoutFootprint(parent, options = {}) {
  const doc = options.document || (typeof globalThis !== 'undefined' ? globalThis.document : null);
  if (!doc) {
    throw new Error('reserveLayoutFootprint requires a valid DOM document.');
  }

  const {
    width = '100%',
    height = '100px',
    aspectRatio,
    skeleton = true,
    animation = true,
  } = options;

  const placeholder = doc.createElement('div');
  placeholder.className = 'sym-layout-placeholder';
  placeholder.setAttribute('data-placeholder-state', 'reserved');

  // Apply layout footprint styles
  placeholder.style.boxSizing = 'border-box';
  placeholder.style.width = typeof width === 'number' ? `${width}px` : width;
  placeholder.style.height = typeof height === 'number' ? `${height}px` : height;
  placeholder.style.minWidth = typeof width === 'number' ? `${width}px` : '0';
  placeholder.style.minHeight = typeof height === 'number' ? `${height}px` : '0';
  if (aspectRatio) {
    placeholder.style.aspectRatio = String(aspectRatio);
  }

  if (skeleton) {
    const inner = doc.createElement('div');
    inner.className = 'sym-placeholder-skeleton';
    inner.style.width = '100%';
    inner.style.height = '100%';
    inner.style.boxSizing = 'border-box';
    inner.style.borderRadius = 'var(--sn-node-radius, 8px)';
    inner.style.border = '1px dashed var(--sn-outline-color, rgba(255,255,255,0.15))';
    inner.style.background = 'linear-gradient(90deg, var(--sn-sys-surface-panel) 25%, var(--sn-sys-surface) 50%, var(--sn-sys-surface-panel) 75%)';
    inner.style.backgroundSize = '200% 100%';
    if (animation) {
      inner.style.animation = 'sym-skeleton-glow 1.5s infinite linear';
    }
    appendNode(placeholder, inner);

    // Inject animation CSS rule if running in browser
    if (typeof window !== 'undefined' && doc.head && !doc.getElementById('sym-skeleton-style')) {
      const style = doc.createElement('style');
      style.id = 'sym-skeleton-style';
      style.textContent = `
        @keyframes sym-skeleton-glow {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `;
      appendNode(doc.head, style);
    }
  }

  if (parent) {
    appendNode(parent, placeholder);
  }

  let resizeObserver = null;
  let activeWidget = null;

  const reservation = {
    element: placeholder,
    state: 'reserved',

    replace(widgetElement, replaceOptions = {}) {
      if (reservation.state === 'destroyed') return;
      let completePayload = null;

      try {
        reservation.state = 'mounting';
        placeholder.setAttribute('data-placeholder-state', 'mounting');

        if (widgetElement.style) {
          widgetElement.style.boxSizing = 'border-box';
        }

        if (typeof placeholder.replaceChildren === 'function') {
          placeholder.replaceChildren(widgetElement);
        } else {
          while (placeholder.firstChild && typeof placeholder.removeChild === 'function') {
            placeholder.removeChild(placeholder.firstChild);
          }
          appendNode(placeholder, widgetElement);
        }
        activeWidget = widgetElement;

        const rect = typeof widgetElement.getBoundingClientRect === 'function'
          ? widgetElement.getBoundingClientRect()
          : { width: 0, height: 0 };
        if (rect.width && rect.height) {
          placeholder.style.width = `${rect.width}px`;
          placeholder.style.height = `${rect.height}px`;
        }

        if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
          if (resizeObserver) {
            resizeObserver.disconnect();
          }
          resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
              const { width: newW, height: newH } = entry.contentRect;
              if (newW && newH) {
                placeholder.style.width = `${newW}px`;
                placeholder.style.height = `${newH}px`;
              }
            }
          });
          resizeObserver.observe(widgetElement);
        }

        reservation.state = 'ready';
        placeholder.setAttribute('data-placeholder-state', 'ready');
        completePayload = { width: rect.width, height: rect.height };
      } catch (err) {
        reservation.destroy();
        throw err;
      }

      if (replaceOptions.onComplete) {
        replaceOptions.onComplete(completePayload);
      }
    },

    measure() {
      if (activeWidget) {
        const rect = typeof activeWidget.getBoundingClientRect === 'function'
          ? activeWidget.getBoundingClientRect()
          : { width: 0, height: 0 };
        placeholder.style.width = `${rect.width}px`;
        placeholder.style.height = `${rect.height}px`;
        return { width: rect.width, height: rect.height };
      }
      return null;
    },

    destroy() {
      if (reservation.state === 'destroyed') return;
      reservation.state = 'destroyed';
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      removeNode(placeholder);
    }
  };

  return reservation;
}
