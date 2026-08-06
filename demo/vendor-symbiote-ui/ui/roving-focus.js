export function setupRovingFocus(container, itemSelector, options = {}) {
  const getItems = () => Array.from(container.querySelectorAll(itemSelector)).filter(el => !el.disabled && !el.hasAttribute('disabled'));

  const handleKeyDown = (event) => {
    const items = getItems();
    if (items.length === 0) return;

    let active = document.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }

    let index = items.indexOf(active);
    let nextIndex = index;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        nextIndex = index + 1 >= items.length ? 0 : index + 1;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        nextIndex = index - 1 < 0 ? items.length - 1 : index - 1;
        break;
      case 'Home':
        event.preventDefault();
        nextIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        nextIndex = items.length - 1;
        break;
      default:
        return;
    }

    if (nextIndex !== index && nextIndex >= 0 && nextIndex < items.length) {
      items.forEach((item, idx) => {
        if (idx === nextIndex) {
          item.setAttribute('tabindex', '0');
          item.focus();
          options.onFocusChange?.(item, nextIndex);
        } else {
          item.setAttribute('tabindex', '-1');
        }
      });
    }
  };

  const handleFocusIn = (event) => {
    const items = getItems();
    if (items.length === 0) return;
    if (items.includes(event.target)) {
      items.forEach(item => {
        if (item === event.target) {
          item.setAttribute('tabindex', '0');
        } else {
          item.setAttribute('tabindex', '-1');
        }
      });
    }
  };

  container.addEventListener('keydown', handleKeyDown);
  container.addEventListener('focusin', handleFocusIn);

  const items = getItems();
  if (items.length > 0) {
    items.forEach((item, idx) => {
      item.setAttribute('tabindex', idx === 0 ? '0' : '-1');
    });
  }

  return () => {
    container.removeEventListener('keydown', handleKeyDown);
    container.removeEventListener('focusin', handleFocusIn);
  };
}
