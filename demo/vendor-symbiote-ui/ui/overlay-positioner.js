export function positionOverlay(anchor, overlay, placement = 'bottom-start', options = {}) {
  if (!anchor || !overlay || typeof window === 'undefined') return;
  const offset = options.offset ?? 4;
  const flip = options.flip ?? true;

  overlay.style.position = 'fixed';
  overlay.style.top = '0px';
  overlay.style.left = '0px';

  const anchorRect = anchor.getBoundingClientRect();
  const overlayRect = overlay.getBoundingClientRect();

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let computedPlacement = placement;

  if (flip) {
    if (placement.startsWith('bottom') && anchorRect.bottom + overlayRect.height + offset > viewportHeight) {
      if (anchorRect.top - overlayRect.height - offset >= 0) {
        computedPlacement = placement.replace('bottom', 'top');
      }
    } else if (placement.startsWith('top') && anchorRect.top - overlayRect.height - offset < 0) {
      if (anchorRect.bottom + overlayRect.height + offset <= viewportHeight) {
        computedPlacement = placement.replace('top', 'bottom');
      }
    }
  }

  let top = 0;
  let left = 0;

  switch (computedPlacement) {
    case 'bottom':
      top = anchorRect.bottom + offset;
      left = anchorRect.left + (anchorRect.width - overlayRect.width) / 2;
      break;
    case 'bottom-start':
      top = anchorRect.bottom + offset;
      left = anchorRect.left;
      break;
    case 'bottom-end':
      top = anchorRect.bottom + offset;
      left = anchorRect.right - overlayRect.width;
      break;
    case 'top':
      top = anchorRect.top - overlayRect.height - offset;
      left = anchorRect.left + (anchorRect.width - overlayRect.width) / 2;
      break;
    case 'top-start':
      top = anchorRect.top - overlayRect.height - offset;
      left = anchorRect.left;
      break;
    case 'top-end':
      top = anchorRect.top - overlayRect.height - offset;
      left = anchorRect.right - overlayRect.width;
      break;
    case 'right':
      top = anchorRect.top + (anchorRect.height - overlayRect.height) / 2;
      left = anchorRect.right + offset;
      break;
    case 'left':
      top = anchorRect.top + (anchorRect.height - overlayRect.height) / 2;
      left = anchorRect.left - overlayRect.width - offset;
      break;
    default:
      top = anchorRect.bottom + offset;
      left = anchorRect.left;
  }

  left = Math.max(0, Math.min(left, viewportWidth - overlayRect.width));
  top = Math.max(0, Math.min(top, viewportHeight - overlayRect.height));

  overlay.style.top = `${top}px`;
  overlay.style.left = `${left}px`;
}
