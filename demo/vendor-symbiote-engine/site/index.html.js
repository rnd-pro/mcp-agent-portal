import { renderPage } from 'library-pages/shell';
import { buildSearchIndex } from 'library-pages/search';
import { composeSiteConfig, docsRoutes, resolvePath } from './site.config.js';

const landingStyles = /*css*/ `
  .lp-page-container {
    max-width: 1200px;
  }

  .landing-shell {
    width: 100%;
    margin: 0 auto;
    padding: 0;
    box-sizing: border-box;
    max-width: 1152px;
  }

  @media (min-width: 901px) and (max-width: 1151px) {
    .landing-shell {
      padding: 0 24px;
    }
  }

  .hero {
    position: relative;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }

  @media (min-width: 901px) {
    .hero {
      height: 628px;
      padding: 0;
    }

    .hero .lp-hero-title {
      position: absolute;
      top: 80px;
      left: 0;
      margin: 0;
      max-width: 576px;
    }

    .hero .lp-hero-lead {
      position: absolute;
      top: 336px;
      left: 0;
      margin: 0;
    }

    .hero .lp-hero-actions {
      position: absolute;
      top: 524px;
      left: 0;
      margin: 0;
    }
  }

  .story-eyebrow-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  .lp-story-row {
    height: 280px;
  }

  .lp-story-text {
    width: 505px;
    flex: 0 1 auto;
  }

  .lp-story-visual {
    width: 559px;
    flex: 0 1 auto;
  }

  .diagram-surface {
    width: 100%;
    max-width: 559px;
    height: auto;
    aspect-ratio: 559 / 240;
    box-sizing: border-box;
    overflow: hidden;
    position: relative;
    background: transparent;
    padding: 0;
  }

  .diagram-svg {
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
    shape-rendering: geometricPrecision;
  }

  .diagram-svg path,
  .diagram-svg line,
  .diagram-svg circle {
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .diagram-svg text {
    letter-spacing: -0.01em;
  }

  .mobile-only {
    display: none;
  }

  .is-enhanced .reveal-on-scroll {
    opacity: 0;
    transform: translateY(12px);
    transition: opacity 450ms cubic-bezier(0.25, 1, 0.5, 1), transform 450ms cubic-bezier(0.25, 1, 0.5, 1);
  }

  .is-enhanced .reveal-on-scroll.is-revealed {
    opacity: 1;
    transform: translateY(0);
  }

  .is-enhanced [data-motion-accent="reveal"] {
    opacity: 0;
    transition: opacity 600ms ease 300ms;
  }

  .is-enhanced [data-motion-accent="slide-right"],
  .is-enhanced [data-motion-accent="slide-left"] {
    transition: transform 600ms ease 300ms;
  }

  .is-enhanced [data-route="reuse"] {
    opacity: 0.45;
  }

  @media (prefers-reduced-motion: no-preference) {
    .is-enhanced .chapter-row.is-revealed [data-motion-accent="reveal"] {
      opacity: 1;
    }

    .is-enhanced .chapter-row.is-revealed [data-motion-accent="slide-right"] {
      transform: translateX(6px);
    }

    .is-enhanced .chapter-row.is-revealed [data-motion-accent="slide-left"] {
      transform: translateX(-6px);
    }

    .is-enhanced .chapter-row.is-revealed [data-motion-accent="dash"],
    .is-enhanced .chapter-row.is-revealed [data-route="reuse"],
    .is-enhanced .chapter-row.is-revealed [data-route="execute"] {
      animation: lp-dash-flow 1.6s linear infinite;
    }
  }

  .closing-cta {
    text-align: center;
    padding: 80px 0 100px 0;
    border-top: 1px solid var(--line);
    margin-top: 80px;
  }

  .cta-title {
    font-size: 32px;
    font-weight: 700;
    margin: 0 0 24px 0;
    color: var(--ink);
  }

  .cta-actions {
    display: flex;
    justify-content: center;
    gap: 16px;
    margin-bottom: 24px;
  }

  .cta-quiet {
    margin-top: 16px;
  }

  .cta-quiet a {
    color: var(--muted);
    font-size: 14px;
    text-decoration: none;
    transition: color 150ms ease;
  }

  .cta-quiet a:hover {
    color: var(--ink);
    text-decoration: underline;
  }

  @media (max-width: 900px) {
    .diagram-surface {
      width: 100%;
      max-width: none;
      height: auto;
      aspect-ratio: 270 / 220;
    }

    .landing-shell {
      padding: 0 24px;
    }

    .hero {
      width: 100%;
      height: auto;
      padding-top: 48px;
      padding-bottom: 48px;
    }

    .hero .lp-hero-title {
      font-size: 32px;
      line-height: 40px;
      max-width: 100%;
      margin-bottom: 16px;
    }

    .hero .lp-hero-lead {
      max-width: 100%;
      margin-bottom: 24px;
    }

    .hero .lp-hero-actions {
      flex-direction: column;
      gap: 12px;
      width: 100%;
    }

    .lp-cta {
      width: 100%;
    }

    .lp-section-intro {
      padding-top: 32px;
      margin-bottom: 32px;
      width: 100%;
    }

    .lp-story-row {
      height: auto;
    }

    .lp-story-text,
    .lp-story-visual {
      width: 100%;
    }

    .desktop-only {
      display: none;
    }

    .mobile-only {
      display: block;
    }

    .closing-cta {
      padding: 48px 0 64px 0;
      margin-top: 48px;
    }

    .cta-title {
      font-size: 24px;
      margin-bottom: 20px;
    }

    .cta-actions {
      flex-direction: column;
      align-items: center;
      gap: 12px;
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .is-enhanced .reveal-on-scroll {
      opacity: 1;
      transform: none;
      transition: none;
    }

    .is-enhanced [data-motion-accent="reveal"],
    .is-enhanced [data-route="reuse"],
    .is-enhanced [data-route="execute"] {
      opacity: 1;
      transition: none;
    }
  }
`;

const contentHtml = /*html*/ `
    <div class="landing-shell">

      <section class="hero" aria-labelledby="hero-title">
        <h1 id="hero-title" class="lp-hero-title">
          <span class="lp-hero-accent">Symbiote Engine</span>
          <span>Portable graph execution, made observable.</span>
        </h1>
        <p class="lp-hero-lead">Define a portable graph once. At runtime, registered behavior, cache decisions, lifecycle failures, and execution results stay explicit to the host without binding the graph to a product shell.</p>
        <div class="lp-hero-actions">
          <a class="lp-cta lp-cta-primary" href="${resolvePath('/docs/')}">Start with the guide</a>
          <a class="lp-cta lp-cta-secondary" href="${resolvePath('/demo/')}">Run the in-memory demo</a>
          <a class="lp-cta lp-cta-secondary" href="https://github.com/RND-PRO/symbiote-engine">GitHub</a>
        </div>
      </section>

      <section class="how-it-works" aria-labelledby="story-title-main">
        <div class="lp-section-intro">
          <span class="lp-eyebrow"><svg class="story-eyebrow-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="4" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="8" cy="4" r="1.5" fill="currentColor" /><path d="M5.2 10.4l1.6-4.8m2.4 0l1.6 4.8" /></svg>How it works</span>
          <h2 id="story-title-main" class="lp-section-title">One graph. Every branch stays visible.</h2>
          <p class="lp-section-lead">Graph data meets registered behavior at runtime. Engine resolves cache identity, chooses reuse or execution, and returns lifecycle failures as node-scoped output.</p>
        </div>

        <article class="lp-story-row chapter-row chapter-01 reveal-on-scroll" aria-label="Chapter 01 Graph shape">
          <div class="lp-story-text">
            <span class="lp-story-num">01 / Graph shape</span>
            <h3 class="lp-story-title">A graph stays portable until the host supplies behavior.</h3>
            <p class="lp-story-desc">JSON carries node types, parameters, and connections. The registry maps those types to behavior at runtime, so graph data remains independent of a product shell.</p>
          </div>
          <div class="lp-story-visual">
            <div class="diagram-surface">
              <svg viewBox="0 0 559 240" class="diagram-svg desktop-only" role="img" aria-label="Graph shape">
                <path data-visual-object="doc-plane" d="M 50,40 L 350,40 L 390,80 L 390,200 L 50,200 Z M 350,40 L 350,80 L 390,80" fill="none" stroke="var(--line-strong)" stroke-width="2" />

                <path data-visual-object="ports" d="M 120,120 m -20,0 a 20,20 0 1,0 40,0 a 20,20 0 1,0 -40,0 M 220,90 m -20,0 a 20,20 0 1,0 40,0 a 20,20 0 1,0 -40,0 M 320,150 m -20,0 a 20,20 0 1,0 40,0 a 20,20 0 1,0 -40,0" fill="none" stroke="var(--brand)" stroke-width="2" />

                <path data-visual-object="track" d="M 140,120 C 180,120 180,90 200,90 M 240,90 C 280,90 280,150 300,150" fill="none" stroke="var(--brand)" stroke-width="2" />

                <text x="55" y="60" fill="var(--ink)" font-size="14" font-family="var(--sans)">graph.json</text>
                <text x="120" y="160" text-anchor="middle" fill="var(--muted)" font-size="14" font-family="var(--sans)">input</text>
                <text x="220" y="130" text-anchor="middle" fill="var(--muted)" font-size="14" font-family="var(--sans)">transform</text>
                <text x="320" y="110" text-anchor="middle" fill="var(--muted)" font-size="14" font-family="var(--sans)">output</text>

                <path data-visual-object="reg-key" d="M 450,110 A 15 15 0 1 0 450,130 L 490,130 L 490,140 L 500,140 L 500,130 L 510,130 L 510,120 Z" fill="none" stroke="var(--mint)" stroke-width="2" />
                <text x="450" y="90" fill="var(--mint)" font-size="14" font-family="var(--sans)">registry</text>

                <line data-motion-accent="dash" x1="390" y1="120" x2="435" y2="120" stroke="var(--mint)" stroke-width="2" stroke-dasharray="4 4" />
              </svg>
              <svg viewBox="0 0 270 220" class="diagram-svg mobile-only" role="img" aria-label="Graph shape">
                <path data-visual-object="doc-plane" d="M 10,20 L 160,20 L 190,50 L 190,190 L 10,190 Z M 160,20 L 160,50 L 190,50" fill="none" stroke="var(--line-strong)" stroke-width="2" />

                <path data-visual-object="ports" d="M 50,100 m -15,0 a 15,15 0 1,0 30,0 a 15,15 0 1,0 -30,0 M 100,70 m -15,0 a 15,15 0 1,0 30,0 a 15,15 0 1,0 -30,0 M 150,130 m -15,0 a 15,15 0 1,0 30,0 a 15,15 0 1,0 -30,0" fill="none" stroke="var(--brand)" stroke-width="2" />

                <path data-visual-object="track" d="M 65,100 C 80,100 80,70 85,70 M 115,70 C 130,70 130,130 135,130" fill="none" stroke="var(--brand)" stroke-width="2" />

                <text x="15" y="40" fill="var(--ink)" font-size="13" font-family="var(--sans)">graph.json</text>
                <text x="50" y="130" text-anchor="middle" fill="var(--muted)" font-size="13" font-family="var(--sans)">input</text>
                <text x="100" y="100" text-anchor="middle" fill="var(--muted)" font-size="13" font-family="var(--sans)">transform</text>
                <text x="150" y="100" text-anchor="middle" fill="var(--muted)" font-size="13" font-family="var(--sans)">output</text>

                <path data-visual-object="reg-key" d="M 220,95 A 10 10 0 1 0 220,105 L 245,105 L 245,110 L 255,110 L 255,105 L 260,105 L 260,95 Z" fill="none" stroke="var(--mint)" stroke-width="2" />
                <text x="210" y="75" fill="var(--mint)" font-size="13" font-family="var(--sans)">registry</text>

                <line data-motion-accent="dash" x1="190" y1="100" x2="210" y2="100" stroke="var(--mint)" stroke-width="2" stroke-dasharray="4 4" />
              </svg>
            </div>
          </div>
        </article>

        <article class="lp-story-row reverse chapter-row chapter-02 reveal-on-scroll" aria-label="Chapter 02 Cache identity">
          <div class="lp-story-text">
            <span class="lp-story-num">02 / Cache identity</span>
            <h3 class="lp-story-title">Inputs and parameters become one repeatable identity.</h3>
            <p class="lp-story-desc">For lifecycle-enabled nodes, the default cache key is exactly JSON.stringify({ i: inputs, p: params }). Execution context reaches execute, but it is not part of that default key.</p>
          </div>
          <div class="lp-story-visual">
            <div class="diagram-surface">
              <svg viewBox="0 0 559 240" class="diagram-svg desktop-only" role="img" aria-label="Cache identity">
                <g data-motion-accent="slide-right"><circle data-field="inputs" cx="200" cy="120" r="70" fill="var(--line-strong)" fill-opacity="0.1" stroke="var(--line-strong)" stroke-width="2" /></g>
                <g data-motion-accent="slide-left"><circle data-field="params" cx="300" cy="120" r="70" fill="var(--brand)" fill-opacity="0.1" stroke="var(--brand)" stroke-width="2" /></g>

                <path d="M 155,115 A 10 10 0 0 1 155,125" fill="none" stroke="var(--line-strong)" stroke-width="2" />
                <path d="M 345,115 A 10 10 0 0 0 345,125" fill="none" stroke="var(--brand)" stroke-width="2" />

                <path data-visual-object="fingerprint" d="M 235,110 L 235,130 M 242,105 L 242,135 M 249,100 L 249,140 M 256,108 L 256,132 M 263,112 L 263,128" fill="none" stroke="var(--line-strong)" stroke-width="2" />
                <path data-motion-accent="reveal" d="M 235,110 L 235,130 M 242,105 L 242,135 M 249,100 L 249,140 M 256,108 L 256,132 M 263,112 L 263,128" fill="none" stroke="var(--mint)" stroke-width="2" />

                <text x="160" y="125" text-anchor="middle" fill="var(--ink)" font-size="14" font-family="var(--sans)">inputs</text>
                <text x="340" y="125" text-anchor="middle" fill="var(--ink)" font-size="14" font-family="var(--sans)">params</text>

                <text x="250" y="90" text-anchor="middle" fill="var(--mint)" font-size="14" font-family="var(--sans)">{ i, p }</text>
              </svg>
              <svg viewBox="0 0 270 220" class="diagram-svg mobile-only" role="img" aria-label="Cache identity">
                <g data-motion-accent="slide-right"><circle data-field="inputs" cx="95" cy="110" r="50" fill="var(--line-strong)" fill-opacity="0.1" stroke="var(--line-strong)" stroke-width="2" /></g>
                <g data-motion-accent="slide-left"><circle data-field="params" cx="175" cy="110" r="50" fill="var(--brand)" fill-opacity="0.1" stroke="var(--brand)" stroke-width="2" /></g>

                <path d="M 60,105 A 8 8 0 0 1 60,115" fill="none" stroke="var(--line-strong)" stroke-width="2" />
                <path d="M 210,105 A 8 8 0 0 0 210,115" fill="none" stroke="var(--brand)" stroke-width="2" />

                <path data-visual-object="fingerprint" d="M 121,100 L 121,115 M 128,95 L 128,120 M 135,90 L 135,125 M 142,98 L 142,117 M 149,102 L 149,113" fill="none" stroke="var(--line-strong)" stroke-width="2" />
                <path data-motion-accent="reveal" d="M 121,100 L 121,115 M 128,95 L 128,120 M 135,90 L 135,125 M 142,98 L 142,117 M 149,102 L 149,113" fill="none" stroke="var(--mint)" stroke-width="2" />

                <text x="65" y="115" text-anchor="middle" fill="var(--ink)" font-size="13" font-family="var(--sans)">inputs</text>
                <text x="205" y="115" text-anchor="middle" fill="var(--ink)" font-size="13" font-family="var(--sans)">params</text>

                <text x="135" y="85" text-anchor="middle" fill="var(--mint)" font-size="13" font-family="var(--sans)">{ i, p }</text>
              </svg>
            </div>
          </div>
        </article>

        <article class="lp-story-row chapter-row chapter-03 reveal-on-scroll" aria-label="Chapter 03 Cache branch">
          <div class="lp-story-text">
            <span class="lp-story-num">03 / Cache branch</span>
            <h3 class="lp-story-title">Validation comes first; then the cache chooses the path.</h3>
            <p class="lp-story-desc">After validation and key resolution, a matching auto-mode entry returns stored output. A miss executes, may post-process the output, and then stores it under the resolved key.</p>
          </div>
          <div class="lp-story-visual">
            <div class="diagram-surface">
              <svg viewBox="0 0 559 240" class="diagram-svg desktop-only" role="img" aria-label="Cache branch">
                <path data-visual-object="val" d="M 80,120 m -10,0 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0" fill="none" stroke="var(--ink)" stroke-width="2" />
                <text x="80" y="145" text-anchor="middle" fill="var(--ink)" font-size="14" font-family="var(--sans)">validate</text>

                <line data-visual-object="line1" x1="90" y1="120" x2="130" y2="120" stroke="var(--line-strong)" stroke-width="2" />

                <path data-visual-object="gate" d="M 140,120 m -10,0 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0" fill="none" stroke="var(--ink)" stroke-width="2" />

                <path data-route="reuse" data-motion-accent="dash-reuse" d="M 150,120 C 220,80 360,80 430,120" fill="none" stroke="var(--mint)" stroke-width="2" stroke-dasharray="6 6" />
                <text x="290" y="55" text-anchor="middle" fill="var(--mint)" font-size="14" font-family="var(--sans)">reuse</text>

                <path data-route="execute" data-motion-accent="dash-execute" d="M 150,120 C 220,215 360,215 430,120" fill="none" stroke="var(--brand)" stroke-width="2" stroke-dasharray="6 6" />

                <text x="230" y="193" text-anchor="middle" fill="var(--muted)" font-size="13" font-family="var(--sans)">execute</text>
                <text x="290" y="224" text-anchor="middle" fill="var(--muted)" font-size="13" font-family="var(--sans)">postProcess?</text>
                <text x="350" y="193" text-anchor="middle" fill="var(--muted)" font-size="13" font-family="var(--sans)">store</text>

                <circle data-visual-object="result" cx="440" cy="120" r="10" fill="var(--line-strong)" />
              </svg>
              <svg viewBox="0 0 270 220" class="diagram-svg mobile-only" role="img" aria-label="Cache branch">
                <path data-visual-object="val" d="M 30,110 m -8,0 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0" fill="none" stroke="var(--ink)" stroke-width="2" />
                <text x="30" y="130" text-anchor="middle" fill="var(--ink)" font-size="13" font-family="var(--sans)">validate</text>

                <line data-visual-object="line1" x1="38" y1="110" x2="62" y2="110" stroke="var(--line-strong)" stroke-width="2" />

                <path data-visual-object="gate" d="M 70,110 m -8,0 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0" fill="none" stroke="var(--ink)" stroke-width="2" />

                <path data-route="reuse" data-motion-accent="dash-reuse" d="M 78,110 C 110,80 180,80 212,110" fill="none" stroke="var(--mint)" stroke-width="2" stroke-dasharray="6 6" />
                <text x="145" y="60" text-anchor="middle" fill="var(--mint)" font-size="13" font-family="var(--sans)">reuse</text>

                <path data-route="execute" data-motion-accent="dash-execute" d="M 78,110 C 110,185 180,185 212,110" fill="none" stroke="var(--brand)" stroke-width="2" stroke-dasharray="6 6" />

                <text x="110" y="168" text-anchor="middle" fill="var(--muted)" font-size="13" font-family="var(--sans)">execute</text>
                <text x="145" y="207" text-anchor="middle" fill="var(--muted)" font-size="13" font-family="var(--sans)">postProcess?</text>
                <text x="180" y="168" text-anchor="middle" fill="var(--muted)" font-size="13" font-family="var(--sans)">store</text>

                <circle data-visual-object="result" cx="220" cy="110" r="8" fill="var(--line-strong)" />
              </svg>
            </div>
          </div>
        </article>

        <article class="lp-story-row reverse chapter-row chapter-04 reveal-on-scroll" aria-label="Chapter 04 Observable outcome">
          <div class="lp-story-text">
            <span class="lp-story-num">04 / Observable outcome</span>
            <h3 class="lp-story-title">A lifecycle failure becomes output, not a hidden stop.</h3>
            <p class="lp-story-desc">Validation, execution, or post-processing errors become node-scoped { _error } output and a structured execution-log record. The traversal loop continues; later nodes still depend on their resolved inputs.</p>
          </div>
          <div class="lp-story-visual">
            <div class="diagram-surface">
              <svg viewBox="0 0 559 240" class="diagram-svg desktop-only" role="img" aria-label="Observable outcome">
                <path data-visual-object="track" d="M 80,120 C 180,90 380,150 480,120" fill="none" stroke="var(--line-strong)" stroke-width="2" />

                <path data-visual-object="node1" d="M 140,113 m -15,0 a 15,15 0 1,0 30,0 a 15,15 0 1,0 -30,0" fill="none" stroke="var(--brand)" stroke-width="2" />

                <path data-visual-object="node2" d="M 280,120 m -15,0 a 15,15 0 1,0 30,0 a 15,15 0 1,0 -30,0" fill="none" stroke="var(--danger)" stroke-width="4" />
                <text x="280" y="100" text-anchor="middle" fill="var(--danger)" font-size="14" font-family="var(--sans)">{ _error }</text>

                <path data-visual-object="node3" d="M 420,127 m -15,0 a 15,15 0 1,0 30,0 a 15,15 0 1,0 -30,0" fill="none" stroke="var(--brand)" stroke-width="2" />

                <path data-motion-accent="dash" d="M 280,135 L 280,170 L 320,170" fill="none" stroke="var(--danger)" stroke-width="2" stroke-dasharray="4 4" />

                <path data-visual-object="record" d="M 320,160 L 360,160 M 370,160 a 2 2 0 1 0 4 0 a 2 2 0 1 0 -4 0 M 320,170 L 380,170 M 390,170 a 2 2 0 1 0 4 0 a 2 2 0 1 0 -4 0 M 320,180 L 370,180 M 380,180 a 2 2 0 1 0 4 0 a 2 2 0 1 0 -4 0" fill="none" stroke="var(--ink)" stroke-width="2" />
                <text x="320" y="200" fill="var(--ink)" font-size="14" font-family="var(--sans)">execution record</text>
              </svg>
              <svg viewBox="0 0 270 220" class="diagram-svg mobile-only" role="img" aria-label="Observable outcome">
                <path data-visual-object="track" d="M 20,100 C 70,80 190,120 250,100" fill="none" stroke="var(--line-strong)" stroke-width="2" />

                <path data-visual-object="node1" d="M 60,95 m -12,0 a 12,12 0 1,0 24,0 a 12,12 0 1,0 -24,0" fill="none" stroke="var(--brand)" stroke-width="2" />

                <path data-visual-object="node2" d="M 135,100 m -12,0 a 12,12 0 1,0 24,0 a 12,12 0 1,0 -24,0" fill="none" stroke="var(--danger)" stroke-width="4" />
                <text x="135" y="80" text-anchor="middle" fill="var(--danger)" font-size="13" font-family="var(--sans)">{ _error }</text>

                <path data-visual-object="node3" d="M 210,105 m -12,0 a 12,12 0 1,0 24,0 a 12,12 0 1,0 -24,0" fill="none" stroke="var(--brand)" stroke-width="2" />

                <path data-motion-accent="dash" d="M 135,112 L 135,150 L 160,150" fill="none" stroke="var(--danger)" stroke-width="2" stroke-dasharray="4 4" />

                <path data-visual-object="record" d="M 160,140 L 190,140 M 198,140 a 2 2 0 1 0 4 0 a 2 2 0 1 0 -4 0 M 160,150 L 205,150 M 213,150 a 2 2 0 1 0 4 0 a 2 2 0 1 0 -4 0 M 160,160 L 195,160 M 203,160 a 2 2 0 1 0 4 0 a 2 2 0 1 0 -4 0" fill="none" stroke="var(--ink)" stroke-width="2" />
                <text x="160" y="180" fill="var(--ink)" font-size="13" font-family="var(--sans)">execution record</text>
              </svg>
            </div>
          </div>
        </article>
      </section>

      <section class="closing-cta">
        <h2 class="cta-title">Ready to run a graph?</h2>
        <div class="cta-actions">
          <a class="lp-cta lp-cta-primary" href="${resolvePath('/docs/')}">Start with the guide</a>
          <a class="lp-cta lp-cta-secondary" href="${resolvePath('/demo/')}">Run the demo</a>
        </div>
        <p class="cta-quiet">
          <a href="https://github.com/RND-PRO/symbiote-engine">View source on GitHub</a>
        </p>
      </section>

    </div>
    <script type="module" src="./animation/index.js"></script>
`;

export default renderPage({
  siteConfig: composeSiteConfig({
    pageStyles: landingStyles,
    description: 'Resolve declarative workflow graphs through explicit cache, execution and result phases.',
    withStack: true,
  }),
  pageTitle: 'Portable graph execution',
  contentHtml,
  currentPath: '/',
  searchIndex: buildSearchIndex(docsRoutes),
});
