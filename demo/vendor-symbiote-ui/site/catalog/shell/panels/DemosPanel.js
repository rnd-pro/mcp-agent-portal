const DEMOS = [
  {
    title: 'Showcase Demo',
    href: 'demo/cascade-theme-lab.html',
    icon: 'space_dashboard',
    desc: 'Project tree, source editor, markdown viewer, graph, chat, voice, runtime, spatial, and cascade theme — the full layout system in one shell.',
  },
  {
    title: 'Kanban Board Workflow',
    href: 'demo/cascade-theme-lab.html#automation/kanban-board',
    icon: 'view_kanban',
    desc: 'Host-owned workflow columns, cards, actions, selection, and move intents rendered by sn-kanban-board.',
  },
  {
    title: 'Product Context Inspector',
    href: 'demo/cascade-theme-lab.html#automation/product-context',
    icon: 'frame_inspect',
    desc: 'Agent-readable product identity, views, entities, component refs, WebMCP actions, and live event state.',
  },
  {
    title: 'Video Studio',
    href: 'demo/cascade-theme-lab.html#video-editor/studio',
    icon: 'movie',
    desc: 'Timeline editor, canvas viewport, composition preview, and effects integrated into the layout system.',
  },
  {
    title: 'Canvas Graph Gravity Lab',
    href: 'demo/canvas-graph-gravity-lab.html',
    icon: 'scatter_plot',
    desc: 'Standalone graph force controls with fit, focus, appearance animation, and one-node zoom diagnostics.',
  },
  {
    title: 'Native Panels WebGL Lab',
    href: 'demo/native-panels-webgl-lab.html',
    icon: 'deployed_code',
    desc: 'Experimental native 3D panels: pure layout compiler, Three adapter, layer explode, raycast interaction, live cascade theme.',
  },
  {
    title: 'PCB Router Stress',
    href: 'demo/pcb-router-stress.html',
    icon: 'developer_board',
    desc: 'Animated route diagnostics with orbit metrics, keyframes, and agent-readable samples.',
  },
];

function getRepositoryBase() {
  const path = window.location.pathname;
  const index = path.indexOf('/catalog/');
  if (index !== -1) {
    return path.slice(0, index + 1);
  }
  return '/';
}

export class DemosPanel extends HTMLElement {
  #rendered = false;

  connectedCallback() {
    if (this.#rendered) return;
    this.#rendered = true;
    this.#render();
  }

  #render() {
    const heading = document.createElement('h2');
    heading.className = 'category-heading';
    heading.textContent = 'Live demos';

    const intro = document.createElement('p');
    intro.className = 'demos-intro';
    intro.textContent = 'Full-page labs that run the components in a real host context, themed live by the cascade theme.';

    const grid = document.createElement('div');
    grid.className = 'demos-grid';

    for (const demo of DEMOS) {
      const card = document.createElement('a');
      card.className = 'demo-card';
      card.href = getRepositoryBase() + demo.href;

      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined demo-card-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = demo.icon;

      const body = document.createElement('div');
      body.className = 'demo-card-body';
      const title = document.createElement('strong');
      title.className = 'demo-card-title';
      title.textContent = demo.title;
      const desc = document.createElement('span');
      desc.className = 'demo-card-desc';
      desc.textContent = demo.desc;
      body.append(title, desc);

      const arrow = document.createElement('span');
      arrow.className = 'material-symbols-outlined demo-card-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = 'arrow_forward';

      card.append(icon, body, arrow);
      grid.appendChild(card);
    }

    this.append(heading, intro, grid);
  }
}

export function registerDemosPanel() {
  if (!customElements.get('catalog-demos-panel')) {
    customElements.define('catalog-demos-panel', DemosPanel);
  }
}

registerDemosPanel();
