const DEFAULT_DIRECTORY_ICON = 'folder';
const DEFAULT_FILE_ICON = 'insert_drive_file';

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => cleanString(item)).filter(Boolean)
    : [];
}

function normalizeActions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((action) => {
      let data = asObject(action);
      let id = cleanString(data.id || data.name || data.action);
      if (!id) return null;
      return {
        ...data,
        id,
        label: cleanString(data.label || data.title || id),
      };
    })
    .filter(Boolean);
}

function normalizeChildren(value) {
  return Array.isArray(value) ? value.map((item) => normalizeResourceTreeItem(item)) : [];
}

export function normalizeResourceTreeItem(rawItem = {}) {
  let data = asObject(rawItem);
  let children = normalizeChildren(data.children);
  let path = cleanString(data.path);
  let id = cleanString(data.id || path || data.label || data.name);
  if (!id) throw new Error('resource tree item id is required');

  let kind = cleanString(data.kind || data.type) || (children.length > 0 ? 'directory' : 'resource');
  let label = cleanString(data.label || data.name || (path ? path.split('/').filter(Boolean).pop() : id)) || id;
  let item = {
    id,
    label,
    kind,
  };

  if (path) item.path = path;
  if (data.icon != null) item.icon = cleanString(data.icon);
  if (data.payload !== undefined) item.payload = data.payload;
  if (data.dragText !== undefined) item.dragText = data.dragText;
  if (data.status != null) item.status = cleanString(data.status);
  if (data.lazy !== undefined) item.lazy = Boolean(data.lazy);
  if (data.draggable !== undefined) item.draggable = Boolean(data.draggable);
  if (data.muted !== undefined) item.muted = Boolean(data.muted);
  if (data.selected !== undefined) item.selected = Boolean(data.selected);
  if (data.expanded !== undefined) item.expanded = Boolean(data.expanded);

  let badges = normalizeStringArray(data.badges);
  if (badges.length > 0) item.badges = badges;

  let tags = normalizeStringArray(data.tags);
  if (tags.length > 0) item.tags = tags;

  let actions = normalizeActions(data.actions);
  if (actions.length > 0) item.actions = actions;

  let metadata = asObject(data.metadata);
  if (Object.keys(metadata).length > 0) item.metadata = metadata;

  if (children.length > 0) item.children = children;
  return item;
}

export function normalizeResourceTree(rawTree = []) {
  let items = Array.isArray(rawTree) ? rawTree : [rawTree];
  return items.map((item) => normalizeResourceTreeItem(item));
}

function createDirectoryNode(path, label, options) {
  return {
    id: path,
    label,
    kind: options.directoryKind,
    path,
    icon: options.directoryIcon,
    draggable: options.draggable,
    payload: `${path}/`,
    children: [],
  };
}

function compareByLabel(a, b) {
  return String(a.label || a.id).localeCompare(String(b.label || b.id));
}

function sortTree(items) {
  items.sort((a, b) => {
    let aDir = Array.isArray(a.children) && a.kind === 'directory';
    let bDir = Array.isArray(b.children) && b.kind === 'directory';
    if (aDir !== bDir) return aDir ? -1 : 1;
    return compareByLabel(a, b);
  });
  for (let item of items) {
    if (Array.isArray(item.children)) sortTree(item.children);
  }
  return items;
}

export function buildResourceTreeFromEntries(entries = [], options = {}) {
  if (!Array.isArray(entries)) throw new Error('resource tree entries must be an array');

  let config = {
    directoryIcon: cleanString(options.directoryIcon) || DEFAULT_DIRECTORY_ICON,
    fileIcon: cleanString(options.fileIcon) || DEFAULT_FILE_ICON,
    directoryKind: cleanString(options.directoryKind) || 'directory',
    fileKind: cleanString(options.fileKind) || 'file',
    draggable: options.draggable === undefined ? true : Boolean(options.draggable),
    sort: options.sort === undefined ? true : Boolean(options.sort),
  };

  let roots = [];
  let directories = new Map();

  function getDirectory(path, label, parentChildren) {
    let directory = directories.get(path);
    if (!directory) {
      directory = createDirectoryNode(path, label, config);
      directories.set(path, directory);
      parentChildren.push(directory);
    }
    return directory;
  }

  for (let entry of entries) {
    let data = asObject(entry);
    let path = cleanString(data.path || data.id);
    if (!path) continue;

    let parts = path.split('/').filter(Boolean);
    if (parts.length === 0) continue;

    let children = roots;
    let parentPath = '';
    for (let index = 0; index < parts.length - 1; index++) {
      parentPath = parentPath ? `${parentPath}/${parts[index]}` : parts[index];
      let directory = getDirectory(parentPath, parts[index], children);
      children = directory.children;
    }

    let label = cleanString(data.label || data.name || parts[parts.length - 1]);
    children.push(normalizeResourceTreeItem({
      ...data,
      id: cleanString(data.id) || path,
      label,
      kind: cleanString(data.kind || data.type) || config.fileKind,
      path,
      icon: data.icon == null ? config.fileIcon : data.icon,
      draggable: data.draggable === undefined ? config.draggable : data.draggable,
      payload: data.payload === undefined ? path : data.payload,
    }));
  }

  return config.sort ? sortTree(roots) : roots;
}
