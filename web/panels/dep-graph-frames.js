export const DIR_COLORS = [
  'rgba(200, 117, 51, 0.25)',  // copper
  'rgba(212, 160, 74, 0.20)',  // gold
  'rgba(100, 180, 120, 0.20)', // solder mask green
  'rgba(80, 150, 200, 0.20)',  // blue layer
  'rgba(160, 100, 200, 0.20)', // purple trace
  'rgba(200, 80, 80, 0.20)',   // power layer red
  'rgba(120, 200, 200, 0.20)', // teal
  'rgba(200, 180, 80, 0.20)',  // yellow
];

export function addDirectoryFrames({ editor, fileMap, dirFiles, positions, FrameClass, colors = DIR_COLORS }) {
  if (!dirFiles || dirFiles.size < 2) return;

  const padding = 30;
  const nodeWidth = 120;
  const nodeHeight = 80;
  let colorIdx = 0;

  for (const [dir, files] of dirFiles) {
    if (files.length < 2) continue;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hasPositions = false;

    for (const file of files) {
      const nodeId = fileMap.get(file);
      if (!nodeId) continue;
      const pos = positions[nodeId];
      if (!pos) continue;
      hasPositions = true;

      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.x + nodeWidth > maxX) maxX = pos.x + nodeWidth;
      if (pos.y + nodeHeight > maxY) maxY = pos.y + nodeHeight;
    }

    if (!hasPositions) continue;

    const dirLabel = dir.replace(/\/$/, '').split('/').pop() || 'root';
    const color = colors[colorIdx % colors.length];
    colorIdx++;

    try {
      const frame = new FrameClass(dirLabel, {
        x: minX - padding,
        y: minY - padding,
        width: (maxX - minX) + padding * 2,
        height: (maxY - minY) + padding * 2,
        color,
      });
      editor.addFrame(frame);
    } catch {
      // Skip invalid frame geometry or editor-specific frame failures.
    }
  }
}

export function setGraphLayerVisible(canvas, layer, visible) {
  if (!canvas) return;

  if (layer === 'zones') {
    const frames = canvas.querySelectorAll('graph-frame');
    for (const frame of frames) {
      frame.style.display = visible ? '' : 'none';
    }
  } else if (layer === 'vias') {
    if (visible) {
      canvas.removeAttribute('data-hide-vias');
    } else {
      canvas.setAttribute('data-hide-vias', '');
    }
  }
}

export function toggleLayerButtonState(button) {
  const isActive = button.hasAttribute('data-active');
  if (isActive) {
    button.removeAttribute('data-active');
    button.setAttribute('data-hidden', '');
  } else {
    button.setAttribute('data-active', '');
    button.removeAttribute('data-hidden');
  }
  return !isActive;
}
