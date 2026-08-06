import { renderPage } from 'library-pages/shell';
import { buildSearchIndex } from 'library-pages/search';
import { composeSiteConfig, docsRoutes, resolvePath } from './site.config.js';

const landingStyles = /*css*/ `
.motion-surface {
  min-height: 280px;
  padding: 24px 0;
  background: transparent;
  overflow: hidden;
}
.motion-surface svg { display: block; width: 100%; height: auto; }
.motion-surface .line { fill: none; stroke: var(--line-strong); stroke-width: 2; }
.motion-surface .brand-stroke { fill: none; stroke: var(--brand); stroke-width: 2; }
.motion-surface .mint-stroke { fill: none; stroke: var(--mint); stroke-width: 2; }
.motion-surface .ink-fill { fill: var(--ink); }
.motion-surface .lp-anim-dash { stroke-dasharray: 5 7; }

.lp-story-num b { color: var(--line-strong); }

.closing { padding: 24px 0 96px; text-align: center; }
.closing h2 { margin: 0 0 28px; font-size: clamp(2rem, 4vw, 3rem); letter-spacing: -0.04em; color: var(--ink); }
.closing .lp-hero-actions { justify-content: center; }

@media (max-width: 760px) {
  .motion-surface { min-height: auto; padding: 16px 0; }
}
`;

const contentHtml = /*html*/ `
<section class="lp-hero" aria-labelledby="hero-title">
  <h1 id="hero-title" class="lp-hero-title">
    <span class="lp-hero-accent">Symbiote UI</span>
    <span>Agent-ready interfaces, built for the host.</span>
  </h1>
  <p class="lp-hero-lead">Discoverable Web Components, layouts, themes, manifests, and UI contracts for agents that construct professional workspaces.</p>
  <div class="lp-hero-actions">
    <a class="lp-cta lp-cta-primary" href="${resolvePath('/docs/')}">Start with the guide</a>
    <a class="lp-cta lp-cta-secondary" href="${resolvePath('/catalog/')}">Explore the catalog</a>
  </div>
</section>

<section class="how-it-works" aria-labelledby="story-title">
  <div class="lp-section-intro">
    <span class="lp-eyebrow"><svg class="eyebrow-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" width="14" height="14"><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="8" cy="4" r="1.5" fill="currentColor"/><path d="M5.2 10.4 6.8 5.6m2.4 0 1.6 4.8"/></svg>How it works</span>
    <h2 id="story-title" class="lp-section-title">One provider contract. Every workspace stays coherent.</h2>
    <p class="lp-section-lead">Agents discover capabilities, compose a host-owned layout, and keep the same visual language from the first component to the last runtime update.</p>
  </div>

  <article class="lp-story-row">
    <div class="lp-story-text"><div class="lp-story-num"><b>01</b> / Discover</div><h3 class="lp-story-title">Start with a manifest, not a random component gallery.</h3><p>Provider metadata describes roles, schemas, actions, theme parts, and WebMCP capabilities before the host chooses a surface.</p></div><div class="lp-story-visual motion-surface"><svg viewBox="0 0 560 260" role="img" aria-label="A manifest connects a host to discoverable UI modules"><rect x="44" y="48" width="184" height="150" rx="10" class="line"/><text x="64" y="80" class="ink-fill" font-size="15" font-family="var(--mono)">manifest.json</text><circle cx="94" cy="130" r="18" class="brand-stroke lp-anim-pulse"/><circle cx="166" cy="130" r="18" class="brand-stroke lp-anim-pulse"/><path d="M112 130h36" class="brand-stroke lp-anim-dash"/><path d="M228 123h74" class="mint-stroke lp-anim-dash"/><path d="m296 116 9 7-9 7" class="mint-stroke"/><g class="lp-anim-float"><rect x="316" y="72" width="184" height="116" rx="10" class="line"/><text x="338" y="105" class="ink-fill" font-size="14" font-family="var(--sans)">host workspace</text><rect x="338" y="124" width="52" height="38" rx="6" fill="var(--brand-soft)" stroke="var(--brand)"/><rect x="402" y="124" width="76" height="38" rx="6" fill="var(--surface-soft)" stroke="var(--line-strong)"/></g></svg></div>
  </article>

  <article class="lp-story-row reverse">
    <div class="lp-story-text"><div class="lp-story-num"><b>02</b> / Compose</div><h3 class="lp-story-title">Layouts give an agent a place to put the work.</h3><p>Shells, panels, graphs, boards, editors, chats, and inspector surfaces compose into a workspace while policy remains with the host.</p></div><div class="lp-story-visual motion-surface"><svg viewBox="0 0 560 260" role="img" aria-label="Layout surfaces compose into one workspace"><rect x="42" y="42" width="476" height="176" rx="12" class="line"/><rect x="64" y="66" width="104" height="128" rx="8" fill="var(--surface-soft)" stroke="var(--line-strong)"/><rect x="184" y="66" width="200" height="128" rx="8" fill="var(--page)" stroke="var(--brand)"/><rect x="400" y="66" width="96" height="128" rx="8" fill="var(--surface-soft)" stroke="var(--line-strong)"/><path d="M168 130h16m200 0h16" class="brand-stroke lp-anim-dash"/><circle cx="284" cy="130" r="22" class="brand-stroke lp-anim-pulse"/><path d="M274 130h20m-10-10v20" class="brand-stroke"/></svg></div>
  </article>

  <article class="lp-story-row">
    <div class="lp-story-text"><div class="lp-story-num"><b>03</b> / Keep it coherent</div><h3 class="lp-story-title">The cascade theme travels with the workspace.</h3><p>Tokens, rules, and theme helpers keep generated interfaces legible across components, panels, graphs, and embedded demos.</p></div><div class="lp-story-visual motion-surface"><svg viewBox="0 0 560 260" role="img" aria-label="A theme token flows across multiple UI surfaces"><path d="M86 130h388" class="mint-stroke lp-anim-dash"/><circle cx="104" cy="130" r="24" class="mint-stroke lp-anim-pulse"/><circle cx="280" cy="130" r="24" class="brand-stroke lp-anim-pulse"/><circle cx="456" cy="130" r="24" class="brand-stroke lp-anim-pulse"/><text x="80" y="88" class="ink-fill" font-size="15" font-family="var(--mono)">tokens</text><text x="247" y="88" class="ink-fill" font-size="15" font-family="var(--sans)">shell</text><text x="420" y="88" class="ink-fill" font-size="15" font-family="var(--sans)">demo</text><path d="M104 154v42m176-42v42m176-42v42" class="line"/><rect x="74" y="196" width="60" height="24" rx="12" fill="var(--brand-soft)" stroke="var(--brand)"/><rect x="250" y="196" width="60" height="24" rx="12" fill="var(--brand-soft)" stroke="var(--brand)"/><rect x="426" y="196" width="60" height="24" rx="12" fill="var(--brand-soft)" stroke="var(--brand)"/></svg></div>
  </article>
</section>

<section class="closing" aria-labelledby="closing-title">
  <h2 id="closing-title">Ready to build a workspace?</h2>
  <div class="lp-hero-actions">
    <a class="lp-cta lp-cta-primary" href="${resolvePath('/docs/')}">Read the documentation</a>
    <a class="lp-cta lp-cta-secondary" href="${resolvePath('/demo/')}">Run the showcase demo</a>
  </div>
</section>
`;

export default renderPage({
  siteConfig: composeSiteConfig({ pageStyles: landingStyles, withStack: true }),
  pageTitle: 'Agent-ready UI construction',
  contentHtml,
  currentPath: '/',
  searchIndex: buildSearchIndex(docsRoutes),
});
