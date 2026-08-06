import { renderPage } from 'library-pages/shell';
import { buildSearchIndex } from 'library-pages/search';
import { composeSiteConfig, docsRoutes, resolvePath } from '../site.config.js';

const DEMOS = [
  {
    href: '/demo/pcb-router-stress.html',
    title: 'PCB Router Stress',
    description: 'Animated route diagnostics with orbit metrics, keyframes, and agent-readable samples.',
  },
  {
    href: '/demo/cascade-theme-lab.html',
    title: 'Showcase Demo',
    description: 'Project tree, source editor, markdown viewer, graph, chat, voice, runtime, spatial, and cascade theme showcase.',
  },
  {
    href: '/demo/cascade-theme-lab.html#automation/kanban-board',
    title: 'Kanban Board Workflow',
    description: 'Host-owned workflow columns, cards, actions, selection, and move intents rendered by sn-kanban-board.',
  },
  {
    href: '/demo/cascade-theme-lab.html#automation/product-context',
    title: 'Product Context Inspector',
    description: 'Agent-readable product identity, views, entities, component refs, WebMCP actions, and live event state.',
  },
  {
    href: '/demo/canvas-graph-gravity-lab.html',
    title: 'Canvas Graph Gravity Lab',
    description: 'Standalone graph force controls with fit, focus, appearance animation, and one-node zoom diagnostics.',
  },
  {
    href: '/demo/native-panels-webgl-lab.html',
    title: 'Native Panels WebGL Lab',
    description: 'Deterministic spatial layout compilation, measured snapshots, parity diagnostics, and native Three/WebGL panel rendering.',
  },
  {
    href: '/demo/cascade-theme-lab.html#video-editor/studio',
    title: 'Video Studio',
    description: 'Timeline editor, canvas viewport, composition preview, and effects, integrated into the layout system.',
  },
  {
    href: '/demo/animation.html',
    title: 'Native Web Animation',
    description: 'The original animated provider narrative with playback, phase seeking, and reduced-motion behavior.',
  },
];

const cards = DEMOS.map(demo => /*html*/ `
  <a class="lp-card" href="${resolvePath(demo.href)}">
    <h2 class="lp-card-title">${demo.title}</h2>
    <p class="lp-card-desc">${demo.description}</p>
  </a>`).join('\n');

const contentHtml = /*html*/ `
<section aria-labelledby="demos-title">
  <div class="lp-section-intro">
    <span class="lp-eyebrow">Demos</span>
    <h1 id="demos-title" class="lp-section-title">Live component demos</h1>
    <p class="lp-section-lead">Every demo runs the published browser components against real layouts, themes, and runtime data. Open one and inspect it like an agent would.</p>
  </div>
  <div class="lp-card-grid">
  ${cards}
  </div>
</section>
`;

export default renderPage({
  siteConfig: composeSiteConfig({
    description: 'Live demos of Symbiote UI components, layouts, themes, and runtime surfaces.',
  }),
  pageTitle: 'Demos',
  contentHtml,
  currentPath: '/demo/',
  searchIndex: buildSearchIndex(docsRoutes),
});
