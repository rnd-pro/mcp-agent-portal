const DEFAULT_ICON = 'folder';
const DEFAULT_SIDEBAR_ICON = 'dashboard';
const TAB_ACCENT_COUNT = 6;

function normalizeId(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeBoolean(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (value === 'false') return false;
  if (value === 'true') return true;
  return Boolean(value);
}

function cloneRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value || null;
  return { ...value };
}

export function normalizeLayoutGroup(group, index = 0) {
  let id = normalizeId(group?.id);
  if (!id) return null;

  let name = group.name || group.label || id;
  let icon = group.icon || DEFAULT_ICON;
  let color = group.color || group.accent || `var(--sn-tab-accent-${index % TAB_ACCENT_COUNT})`;

  return {
    id,
    name,
    icon,
    color,
    sidebarLabel: group.sidebarLabel || group.label || name,
    sidebarIcon: group.sidebarIcon || icon || DEFAULT_SIDEBAR_ICON,
    tabsVisible: normalizeBoolean(group.tabsVisible, true),
    sidebarVisible: normalizeBoolean(group.sidebarVisible, true),
    disabled: normalizeBoolean(group.disabled, false),
    closeable: normalizeBoolean(group.closeable, false),
    behavior: cloneRecord(group.behavior),
    host: cloneRecord(group.host || group.metadata),
  };
}

export function normalizeLayoutGroups(groups = []) {
  if (!Array.isArray(groups)) return [];
  return groups
    .map((group, index) => normalizeLayoutGroup(group, index))
    .filter(Boolean);
}

export function getHomeLayoutGroup(groups = []) {
  return (
    groups.find((group) => group.tabsVisible === false && !group.disabled) ||
    groups.find((group) => group.id === 'home' && !group.disabled) ||
    groups.find((group) => group.id === 'overview' && !group.disabled) ||
    groups.find((group) => !group.disabled) ||
    groups[0] ||
    null
  );
}

export function getActiveLayoutGroup(groups = [], activeId = null) {
  let active = groups.find((group) => group.id === activeId);
  if (active && !active.disabled) return active;
  return getHomeLayoutGroup(groups);
}

export function createLayoutGroupTabs(groups = [], activeId = null) {
  let active = getActiveLayoutGroup(groups, activeId);
  let home = getHomeLayoutGroup(groups);
  return groups
    .filter((group) => group.tabsVisible !== false && group.id !== home?.id)
    .map((group) => ({
      ...group,
      closeable: group.closeable,
      disabled: group.disabled,
      isActive: group.id === active?.id,
    }));
}

export function createLayoutGroupSections(groups = []) {
  return groups
    .filter((group) => group.sidebarVisible !== false)
    .map((group) => ({
      id: group.id,
      label: group.sidebarLabel,
      icon: group.sidebarIcon || DEFAULT_SIDEBAR_ICON,
      disabled: group.disabled,
      group,
    }));
}

export function createLayoutGroupModel(groups = [], activeId = null) {
  let normalized = normalizeLayoutGroups(groups);
  let active = getActiveLayoutGroup(normalized, activeId);
  let home = getHomeLayoutGroup(normalized);

  return {
    groups: normalized,
    activeId: active?.id || null,
    activeGroup: active,
    homeGroupId: home?.id || null,
    tabs: createLayoutGroupTabs(normalized, active?.id),
    sidebarSections: createLayoutGroupSections(normalized),
  };
}
