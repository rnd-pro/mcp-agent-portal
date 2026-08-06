export const DEFAULT_NAV_WIDTH = 200;
export const MIN_NAV_WIDTH = 120;
export const MAX_NAV_WIDTH = 420;
export const COLLAPSED_NAV_WIDTH = 31;
export const COLLAPSE_DRAG_THRESHOLD = 72;
export const AUTO_COLLAPSE_WIDTH = 560;
export const AUTO_UNCOLLAPSE_WIDTH = 660;

export function clampChatSidebarWidth(width) {
  return Math.max(MIN_NAV_WIDTH, Math.min(MAX_NAV_WIDTH, Math.round(width)));
}
