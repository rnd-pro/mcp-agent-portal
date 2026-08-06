const SCROLLBAR_COLOR = 'var(--sn-scrollbar-thumb, currentColor) var(--sn-scrollbar-track, transparent)';
const SCROLLBAR_WIDTH = 'var(--sn-scrollbar-width, thin)';
const SCROLLBAR_SIZE = 'var(--sn-scrollbar-size, 10px)';
const SCROLLBAR_THUMB = 'var(--sn-scrollbar-thumb, currentColor)';
const SCROLLBAR_THUMB_HOVER = 'var(--sn-scrollbar-thumb-hover, currentColor)';
const SCROLLBAR_TRACK = 'var(--sn-scrollbar-track, transparent)';
const SCROLLBAR_RADIUS = 'var(--sn-scrollbar-radius, 999px)';
const SCROLLBAR_THUMB_BORDER = 'var(--sn-scrollbar-thumb-border, 3px solid transparent)';
const SCROLLBAR_THUMB_MIN_SIZE = 'var(--sn-scrollbar-thumb-min-size, 36px)';

export let themedScrollbarStyles = `
  scrollbar-color: ${SCROLLBAR_COLOR};
  scrollbar-width: ${SCROLLBAR_WIDTH};

  &::-webkit-scrollbar {
    width: ${SCROLLBAR_SIZE};
    height: ${SCROLLBAR_SIZE};
  }

  &::-webkit-scrollbar-track {
    background: ${SCROLLBAR_TRACK};
  }

  &::-webkit-scrollbar-thumb {
    min-height: ${SCROLLBAR_THUMB_MIN_SIZE};
    border: ${SCROLLBAR_THUMB_BORDER};
    border-radius: ${SCROLLBAR_RADIUS};
    background: ${SCROLLBAR_THUMB};
    background-clip: content-box;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: ${SCROLLBAR_THUMB_HOVER};
    background-clip: content-box;
  }

  &::-webkit-scrollbar-corner {
    background: ${SCROLLBAR_TRACK};
  }
`;

export let themedScrollbarRootStyles = `
  * {
    scrollbar-color: ${SCROLLBAR_COLOR};
    scrollbar-width: ${SCROLLBAR_WIDTH};
  }

  *::-webkit-scrollbar {
    width: ${SCROLLBAR_SIZE};
    height: ${SCROLLBAR_SIZE};
  }

  *::-webkit-scrollbar-track {
    background: ${SCROLLBAR_TRACK};
  }

  *::-webkit-scrollbar-thumb {
    min-height: ${SCROLLBAR_THUMB_MIN_SIZE};
    border: ${SCROLLBAR_THUMB_BORDER};
    border-radius: ${SCROLLBAR_RADIUS};
    background: ${SCROLLBAR_THUMB};
    background-clip: content-box;
  }

  *::-webkit-scrollbar-thumb:hover {
    background: ${SCROLLBAR_THUMB_HOVER};
    background-clip: content-box;
  }

  *::-webkit-scrollbar-corner {
    background: ${SCROLLBAR_TRACK};
  }
`;
