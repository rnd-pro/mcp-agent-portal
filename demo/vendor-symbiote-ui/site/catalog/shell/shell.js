import { defineModule } from '../../../ui/index.js';

const SHELL_TAGS = [
  'layout-shell-menu',
  'project-tabs',
  'layout-sidebar',
  'cascade-theme-widget',
];

function scrollToCategory(id) {
  const target = document.getElementById(`cat-${id}`);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const HOME_ID = 'components';
const EXTRA_TABS = [{ id: 'demos', name: 'Demos', icon: 'play_circle', closeable: false }];

export function mountShell({ categories }) {
  for (const tag of SHELL_TAGS) defineModule(tag);

  const shell = document.querySelector('#catalog-shell');
  const sidebarEl = shell.querySelector('layout-sidebar');
  const tabsEl = shell.querySelector('project-tabs');
  const scrollEl = shell.querySelector('#workspace-content');
  const componentsEl = shell.querySelector('#components-view');
  const demosEl = shell.querySelector('#demos-view');

  // Home tab = the component catalog; one extra tab for the live demos.
  if (tabsEl?.$) {
    tabsEl.$.homeLabel = 'Components';
    tabsEl.$.homeIcon = 'widgets';
  }

  function setView(view) {
    const demos = view === 'demos';
    componentsEl.hidden = demos;
    demosEl.hidden = !demos;
    tabsEl?.setTabs(EXTRA_TABS, demos ? 'demos' : HOME_ID, { homeId: HOME_ID });
    scrollEl.scrollTop = 0;
  }

  shell.addEventListener('project-tabs-home', () => setView('components'));
  shell.addEventListener('project-tabs-select', (e) => {
    if (e.detail?.id === 'demos') setView('demos');
  });

  sidebarEl.routerSync = false;
  sidebarEl.setSections(categories.map((c) => ({
    id: c.id,
    icon: c.icon,
    label: `${c.label} (${c.count})`,
  })));

  shell.addEventListener('sidebar-section-select', (e) => {
    e.preventDefault();
    const id = e.detail?.id;
    if (!id) return;
    sidebarEl.setActiveSection(id);
    setView('components');
    scrollToCategory(id);
  });

  setView('components');

  return { componentsEl, demosEl, sidebarEl };
}
