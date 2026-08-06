const POPOVER_OPEN_EVENT = 'sn-popover-open';

function getDocument(owner) {
  if (owner?.ownerDocument) return owner.ownerDocument;
  return typeof document !== 'undefined' ? document : null;
}

export function broadcastPopoverOpen(owner) {
  let doc = getDocument(owner);
  if (!doc) return;
  doc.dispatchEvent(new CustomEvent(POPOVER_OPEN_EVENT, { detail: { owner } }));
}

export function registerPopoverDismissal({ owner, isInside, onDismiss }) {
  let doc = getDocument(owner);
  if (!doc) return () => {};

  let onOtherOpen = (event) => {
    if (event.detail?.owner === owner) return;
    onDismiss(event);
  };
  let onPointerDown = (event) => {
    if (isInside(event)) return;
    onDismiss(event);
  };

  doc.addEventListener(POPOVER_OPEN_EVENT, onOtherOpen);
  doc.addEventListener('pointerdown', onPointerDown, true);

  return () => {
    doc.removeEventListener(POPOVER_OPEN_EVENT, onOtherOpen);
    doc.removeEventListener('pointerdown', onPointerDown, true);
  };
}
