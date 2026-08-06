let layers = [];

function handleKeyDown(event) {
  if (event.key === 'Escape' && layers.length > 0) {
    // Dismiss the top-most layer that allows escape dismissal
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (layer.dismissOnEscape) {
        event.preventDefault();
        event.stopPropagation();
        layer.onDismiss(event);
        break;
      }
    }
  }
}

function handlePointerDown(event) {
  if (layers.length === 0) return;

  const target = event.target;
  // Dismiss layers starting from the top.
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!layer.dismissOnPointerDownOutside) continue;

    let clickedInside = layer.element.contains(target);
    if (!clickedInside && layer.interactOutsideExclude) {
      for (let exclude of layer.interactOutsideExclude) {
        if (typeof exclude === 'function') exclude = exclude();
        if (exclude && exclude.contains(target)) {
          clickedInside = true;
          break;
        }
      }
    }

    if (!clickedInside) {
      layer.onDismiss(event);
    }
  }
}

let listenersAdded = false;
function addGlobalListeners() {
  if (listenersAdded) return;
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('pointerdown', handlePointerDown, { capture: true });
    listenersAdded = true;
  }
}

function removeGlobalListeners() {
  if (!listenersAdded) return;
  if (typeof document !== 'undefined') {
    document.removeEventListener('keydown', handleKeyDown, { capture: true });
    document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
    listenersAdded = false;
  }
}

export function registerDismissableLayer(layer) {
  const layerRecord = {
    element: layer.element,
    onDismiss: layer.onDismiss,
    interactOutsideExclude: layer.interactOutsideExclude || [],
    dismissOnEscape: layer.dismissOnEscape ?? true,
    dismissOnPointerDownOutside: layer.dismissOnPointerDownOutside ?? true,
  };

  layers.push(layerRecord);
  addGlobalListeners();

  return () => {
    layers = layers.filter(l => l !== layerRecord);
    if (layers.length === 0) {
      removeGlobalListeners();
    }
  };
}
