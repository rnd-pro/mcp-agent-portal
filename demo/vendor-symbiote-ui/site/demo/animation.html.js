import {
  getSiteRoute,
  PRIMARY_NAV_ROUTES,
  withSiteBasePath,
} from '../routes.js';
import { COMPONENTS } from '../../manifest/component-registry.js';

const descriptorCount = COMPONENTS.length;

const basePath = process.env.PAGES_BASE_PATH || '/';
const homeHref = withSiteBasePath(basePath, getSiteRoute('home'));
const docsHref = withSiteBasePath(basePath, getSiteRoute('docs'));
const catalogHref = withSiteBasePath(basePath, getSiteRoute('catalog'));
const primaryNavigation = PRIMARY_NAV_ROUTES.map((route) => (
  `<a href="${withSiteBasePath(basePath, route)}">${route.navLabel}</a>`
)).join('\n');

export default /*html*/ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Symbiote UI: Agent-Ready Workspace UI Library. Lightweight Web Components and layouts for dynamic interface composition.">
<title>Symbiote UI — Agent-Ready Workspace UI Library</title>
<style>
:root {
  --bg: #fcfcfc;
  --text: #1a1a1a;
  --text-dim: #555555;
  --surface: #f0f0f0;
  --surface-raised: #ffffff;
  --accent: #2563eb;
  --accent-light: #eff6ff;
  --border: #e2e8f0;
  --font: Inter, system-ui, -apple-system, sans-serif;
  --radius: 8px;
  --max-width: 1100px;
}

[data-theme="dark"] {
  --bg: #0b0f19;
  --text: #f1f5f9;
  --text-dim: #94a3b8;
  --surface: #1e293b;
  --surface-raised: #0f172a;
  --accent: #60a5fa;
  --accent-light: #172554;
  --border: #334155;
}

* {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
  transition: background 0.3s, color 0.3s;
}

.sn-skip-link {
  position: absolute;
  top: -100px;
  left: 10px;
  background: var(--accent);
  color: #ffffff;
  padding: 8px 16px;
  z-index: 10000;
  border-radius: var(--radius);
  text-decoration: none;
  font-weight: bold;
}
.sn-skip-link:focus {
  top: 10px;
}

a:focus-visible, button:focus-visible, input:focus-visible, .scene-visual-area:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}

header {
  border-bottom: 1px solid var(--border);
  background: var(--surface-raised);
}

.header-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 16px 24px;
}

.logo-group {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: bold;
  font-size: 1.2rem;
  color: var(--text);
  text-decoration: none;
}

.logo-icon {
  background: var(--accent);
  color: white;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-weight: 800;
}

nav {
  display: flex;
  align-items: center;
  gap: 20px;
}

nav a {
  color: var(--text-dim);
  text-decoration: none;
  font-size: 0.95rem;
  font-weight: 500;
  transition: color 0.2s;
}

nav a:hover {
  color: var(--accent);
}

.theme-btn {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 6px 12px;
  cursor: pointer;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 6px;
}

.theme-btn:hover {
  background: var(--border);
}

main {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 48px 24px;
}

.hero {
  text-align: center;
  margin-bottom: 64px;
}

.hero h1 {
  font-size: 2.8rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0 0 16px;
  line-height: 1.2;
}

.hero p {
  font-size: 1.25rem;
  color: var(--text-dim);
  max-width: 700px;
  margin: 0 auto 32px;
}

.cta-group {
  display: flex;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
}

.btn {
  display: inline-block;
  padding: 12px 24px;
  border-radius: var(--radius);
  font-weight: 600;
  text-decoration: none;
  font-size: 1rem;
  transition: transform 0.2s, background-color 0.2s;
}

.btn-primary {
  background: var(--accent);
  color: white;
}

.btn-primary:hover {
  background: color-mix(in srgb, var(--accent) 90%, black);
}

.btn-secondary {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
}

.btn-secondary:hover {
  background: var(--border);
}

.pipeline-section {
  margin-top: 64px;
  padding: 32px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.pipeline-section h2 {
  text-align: center;
  font-size: 1.75rem;
  margin-top: 0;
  margin-bottom: 12px;
}

.pipeline-section .subtitle {
  text-align: center;
  color: var(--text-dim);
  margin-bottom: 48px;
}

.pipeline-flow {
  display: flex;
  flex-direction: column;
  gap: 24px;
  list-style: none;
  padding: 0;
  margin: 0;
}

@media (min-width: 768px) {
  .pipeline-flow {
    flex-direction: row;
    align-items: stretch;
    justify-content: space-between;
  }
}

.pipeline-step {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
  position: relative;
  transition: border-color 0.3s, box-shadow 0.3s;
}

.step-num {
  font-weight: 800;
  font-size: 1.5rem;
  color: var(--accent);
  margin-bottom: 8px;
}

.step-title {
  font-weight: 700;
  font-size: 1.1rem;
  margin-bottom: 8px;
}

.step-desc {
  font-size: 0.9rem;
  color: var(--text-dim);
  margin: 0;
}

.interactive-only {
  display: none !important;
}
.fallback-only {
  display: flex !important;
}

.js-enhanced .interactive-only {
  display: flex !important;
}
.js-enhanced .fallback-only {
  display: none !important;
}

.scene-wrapper {
  margin-top: 24px;
}

.scene-dashboard {
  display: flex;
  flex-direction: column;
  gap: 24px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
  max-width: 100%;
}

@media (min-width: 900px) {
  .scene-dashboard {
    flex-direction: row;
    align-items: stretch;
  }
  .scene-visual-area {
    flex: 1.2;
    min-width: 0;
  }
  .scene-hud {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 16px;
    min-width: 0;
  }
}

.scene-visual-area {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.scene-svg {
  width: 100%;
  height: auto;
  max-width: 100%;
  display: block;
  border-radius: var(--radius);
}

.scene-hud {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.status-pill-wrapper {
  display: flex;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--accent-light);
  color: var(--accent);
  padding: 6px 12px;
  border-radius: 20px;
  font-weight: 700;
  font-size: 0.85rem;
  flex-wrap: wrap;
  max-width: 100%;
}

.status-dot {
  width: 8px;
  height: 8px;
  background: var(--accent);
  border-radius: 50%;
  display: inline-block;
  animation: pulse-dot 1.5s infinite ease-in-out;
}

@keyframes pulse-dot {
  0% { transform: scale(0.8); opacity: 0.5; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(0.8); opacity: 0.5; }
}

.status-explanation {
  color: var(--text-dim);
  font-weight: normal;
  margin-left: 4px;
}

.kpi-strip {
  display: flex;
  gap: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
}

.kpi-cell {
  flex: 1;
  text-align: center;
}

.kpi-cell-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-dim);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.kpi-cell-value {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--accent);
}

.caption-pill {
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 16px;
  font-size: 0.95rem;
  line-height: 1.4;
  min-height: 60px;
}

.playback-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  flex-wrap: wrap;
}

.playback-btn {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 16px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.playback-btn:hover:not(:disabled) {
  background: var(--border);
}

.playback-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.timeline-seek-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 80px;
}

.timeline-slider {
  flex: 1;
  min-width: 0;
  width: 100%;
  cursor: pointer;
  accent-color: var(--accent);
}

.time-display {
  font-size: 0.85rem;
  font-family: monospace;
  color: var(--text-dim);
  white-space: nowrap;
}

.phase-selector-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.phase-btn {
  flex: 1;
  min-width: 80px;
  background: var(--surface);
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
  text-align: center;
  transition: all 0.2s;
}

.phase-btn:hover {
  background: var(--border);
  color: var(--text);
}

.phase-btn.active {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

[data-theme="dark"] .phase-btn.active {
  color: var(--bg);
}

@media (max-width: 768px) {
  .header-container {
    flex-direction: column;
    gap: 16px;
    padding: 16px;
  }
  nav {
    flex-wrap: wrap;
    justify-content: center;
  }
}

@media (max-width: 600px) {
  .scene-dashboard {
    padding: 12px;
    gap: 12px;
  }
  .scene-visual-area {
    overflow-x: auto;
    justify-content: flex-start;
    padding-bottom: 8px;
    -webkit-overflow-scrolling: touch;
  }
  .scene-svg {
    min-width: 480px;
  }
  .kpi-strip {
    padding: 8px;
    gap: 8px;
  }
  .caption-pill {
    padding: 8px 12px;
    font-size: 0.85rem;
  }
  .playback-controls {
    padding: 8px;
    gap: 8px;
  }
  .playback-btn {
    padding: 6px 12px;
    font-size: 0.8rem;
  }
  .phase-btn {
    padding: 6px 4px;
    font-size: 0.8rem;
    min-width: 60px;
  }
  .timeline-seek-wrapper {
    width: 100%;
    flex: none;
  }
}

@media (max-width: 375px) {
  main {
    padding: 24px 12px;
  }
  .pipeline-section {
    padding: 16px 12px;
  }
  .scene-dashboard {
    padding: 8px;
    gap: 8px;
  }
  .playback-controls {
    padding: 6px;
    gap: 4px;
  }
  .status-pill {
    padding: 4px 8px;
    font-size: 0.8rem;
  }
  .timeline-seek-wrapper {
    width: 100%;
    flex: none;
    min-width: 0;
  }
}

footer {
  margin-top: 64px;
  border-top: 1px solid var(--border);
  padding: 32px 24px;
  text-align: center;
  color: var(--text-dim);
  font-size: 0.9rem;
}

footer a {
  color: var(--accent);
  text-decoration: none;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-delay: 0s !important;
    animation-duration: 0s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0s !important;
    scroll-behavior: auto !important;
  }
  .status-dot {
    animation: none !important;
  }
  .svg-group, .phase-btn, .theme-btn, .btn {
    transition: none !important;
  }
}
</style>
</head>
<body>
<a href="#main-content" class="sn-skip-link">Skip to main content</a>

<header>
  <div class="header-container">
    <a href="${homeHref}" class="logo-group">
      <div class="logo-icon">S</div>
      <span>Symbiote UI</span>
    </a>
    <nav aria-label="Primary Navigation">
      ${primaryNavigation}
      <button id="theme-toggle" class="theme-btn" aria-label="Switch to dark theme">
        <span class="theme-icon" aria-hidden="true">☾</span>
        <span class="theme-label">Dark Theme</span>
      </button>
    </nav>
  </div>
</header>

<main id="main-content">
  <section class="hero">
    <h1>Custom Workspaces Built by Agents</h1>
    <p>Symbiote UI is a lightweight library of Web Components and layouts specifically engineered for AI agents to discover, compose, and style interfaces dynamically.</p>
    <div class="cta-group">
      <a href="${docsHref}" class="btn btn-primary">Read Guides</a>
      <a href="${catalogHref}" class="btn btn-secondary">Explore Components</a>
    </div>
  </section>

  <section class="pipeline-section" aria-labelledby="pipeline-heading">
    <h2 id="pipeline-heading">The Agent Construction Narrative</h2>
    <p class="subtitle">How agents dynamically compose fully functional interfaces at runtime</p>

    <ol class="fallback-only pipeline-flow">
      <li class="pipeline-step">
        <div class="step-num">01</div>
        <h3 class="step-title">Provider Metadata</h3>
        <p class="step-desc">Provider metadata, schemas, tokens, rules, and component descriptors are available.</p>
      </li>

      <li class="pipeline-step">
        <div class="step-num">02</div>
        <h3 class="step-title">Manifest Discovery</h3>
        <p class="step-desc">The manifest/discover contract makes capabilities inspectable.</p>
      </li>

      <li class="pipeline-step">
        <div class="step-num">03</div>
        <h3 class="step-title">Primitive Selection</h3>
        <p class="step-desc">An agent or host selects appropriate registered primitives.</p>
      </li>

      <li class="pipeline-step">
        <div class="step-num">04</div>
        <h3 class="step-title">UI Hydration</h3>
        <p class="step-desc">Browser Web Components hydrate through the browser-safe entry point while Node-safe boundaries remain intact.</p>
      </li>

      <li class="pipeline-step">
        <div class="step-num">05</div>
        <h3 class="step-title">Ready Composition</h3>
        <p class="step-desc">The host receives an agent-ready UI composition, while persistence, execution, permissions, and workflow policy remain host concerns.</p>
      </li>
    </ol>

    <div id="scene-container" class="interactive-only scene-wrapper">
      <div class="scene-dashboard">
        <div class="scene-visual-area" tabindex="0" aria-label="Interactive construction scene graphics viewport">
          <svg id="animation-svg" class="scene-svg" viewBox="0 0 800 450" role="img" aria-labelledby="svg-title svg-desc">
            <title id="svg-title">Agent Construction Animation</title>
            <desc id="svg-desc">An interactive flow showing metadata parsing, discovery, primitive selection, hydration, and final composition.</desc>

            <rect width="800" height="450" fill="var(--bg)" rx="12" stroke="var(--border)" stroke-width="2"></rect>
            <g class="svg-connections" stroke="var(--border)" stroke-width="2" stroke-dasharray="4 4" fill="none">
              <path d="M 180 140 L 400 225"></path>
              <path d="M 620 140 L 400 225"></path>
              <path d="M 680 260 L 400 225"></path>
              <path d="M 480 370 L 400 225"></path>
              <path d="M 220 330 L 400 225"></path>
            </g>

            <g class="svg-core" transform="translate(0, 0)">
              <circle cx="400" cy="225" r="55" fill="var(--surface-raised)" stroke="var(--accent)" stroke-width="3"></circle>
              <circle class="svg-core-ring" cx="400" cy="225" r="65" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="10 15"></circle>
              <text x="400" y="220" text-anchor="middle" font-size="11" font-weight="bold" fill="var(--text)">SYMBIOTE</text>
              <text x="400" y="235" text-anchor="middle" font-size="11" font-weight="bold" fill="var(--text)">ENGINE</text>
            </g>

            <g id="group-metadata" class="svg-group" transition="opacity 0.3s">
              <rect x="100" y="50" width="160" height="90" rx="8" fill="var(--surface-raised)" stroke="var(--border)" stroke-width="2"></rect>
              <rect x="110" y="60" width="140" height="20" rx="4" fill="var(--accent-light)"></rect>
              <text x="180" y="74" text-anchor="middle" font-size="11" font-weight="bold" fill="var(--accent)">METADATA</text>
              <text x="120" y="105" font-size="10" fill="var(--text-dim)">custom-elements.json</text>
              <text x="120" y="125" font-size="10" fill="var(--text-dim)">tokens.json / rules</text>
            </g>

            <g id="group-discover" class="svg-group" transition="opacity 0.3s">
              <rect x="540" y="50" width="160" height="90" rx="8" fill="var(--surface-raised)" stroke="var(--border)" stroke-width="2"></rect>
              <rect x="550" y="60" width="140" height="20" rx="4" fill="var(--accent-light)"></rect>
              <text x="620" y="74" text-anchor="middle" font-size="11" font-weight="bold" fill="var(--accent)">DISCOVER</text>
              <circle id="discovery-ray" cx="620" cy="110" r="15" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="3 3"></circle>
              <text x="620" y="125" text-anchor="middle" font-size="10" fill="var(--text-dim)">Manifest API Query</text>
            </g>

            <g id="group-select" class="svg-group" transition="opacity 0.3s">
              <rect x="600" y="215" width="160" height="90" rx="8" fill="var(--surface-raised)" stroke="var(--border)" stroke-width="2"></rect>
              <rect x="610" y="225" width="140" height="20" rx="4" fill="var(--accent-light)"></rect>
              <text x="680" y="239" text-anchor="middle" font-size="11" font-weight="bold" fill="var(--accent)">SELECT</text>
              <rect x="615" y="260" width="60" height="15" rx="3" fill="var(--accent)" opacity="0.8"></rect>
              <text x="645" y="271" text-anchor="middle" font-size="9" fill="white">&lt;sn-card&gt;</text>
              <rect x="685" y="260" width="60" height="15" rx="3" fill="var(--surface)" stroke="var(--border)"></rect>
              <text x="715" y="271" text-anchor="middle" font-size="9" fill="var(--text-dim)">&lt;sn-metric&gt;</text>
              <text x="680" y="295" text-anchor="middle" font-size="9" fill="var(--text-dim)">Agent Primitives</text>
            </g>

            <g id="group-hydrate" class="svg-group" transition="opacity 0.3s">
              <rect x="400" y="325" width="160" height="90" rx="8" fill="var(--surface-raised)" stroke="var(--border)" stroke-width="2"></rect>
              <rect x="410" y="335" width="140" height="20" rx="4" fill="var(--accent-light)"></rect>
              <text x="480" y="349" text-anchor="middle" font-size="11" font-weight="bold" fill="var(--accent)">HYDRATE</text>
              <rect x="420" y="370" width="120" height="10" rx="5" fill="var(--surface)" stroke="var(--border)"></rect>
              <rect id="hydration-bar-fill" x="420" y="370" width="0" height="10" rx="5" fill="var(--accent)"></rect>
              <text x="480" y="400" text-anchor="middle" font-size="9" fill="var(--text-dim)">DOM Hydration</text>
            </g>

            <g id="group-ready" class="svg-group" transition="opacity 0.3s">
              <rect x="140" y="285" width="160" height="90" rx="8" fill="var(--surface-raised)" stroke="var(--border)" stroke-width="2"></rect>
              <rect x="150" y="295" width="140" height="20" rx="4" fill="var(--accent-light)"></rect>
              <text x="220" y="309" text-anchor="middle" font-size="11" font-weight="bold" fill="var(--accent)">READY</text>
              <rect x="160" y="325" width="40" height="35" rx="3" fill="none" stroke="var(--accent)" stroke-width="1.5"></rect>
              <rect x="210" y="325" width="70" height="15" rx="3" fill="none" stroke="var(--border)" stroke-width="1.5"></rect>
              <rect x="210" y="345" width="70" height="15" rx="3" fill="none" stroke="var(--border)" stroke-width="1.5"></rect>
              <circle cx="270" cy="305" r="5" fill="#10b981"></circle>
            </g>
          </svg>
        </div>

        <div class="scene-hud">
          <div class="status-pill-wrapper">
            <div class="status-pill">
              <span class="status-dot" aria-hidden="true"></span>
              <span class="status-label" id="status-label">PROVIDER METADATA</span>
              <span class="status-explanation" id="status-explanation">schemas, tokens, and descriptors loaded</span>
            </div>
          </div>

          <div class="kpi-strip" aria-label="Key performance indicators">
            <div class="kpi-cell">
              <div class="kpi-cell-label">STAGE STATUS</div>
              <div class="kpi-cell-value" id="val-kpi-status">Loading Schemas</div>
            </div>
            <div class="kpi-cell">
              <div class="kpi-cell-label">ACTIVE METRIC</div>
              <div class="kpi-cell-value" id="val-kpi-metric">${descriptorCount} Descriptors</div>
            </div>
          </div>

          <div class="caption-pill" id="caption-pill">
            Symbiote UI makes provider metadata, tokens, schemas, and descriptors available to the host.
          </div>
          <div id="polite-announcer" class="sr-only" role="status" aria-live="polite"></div>
          <div class="playback-controls" role="group" aria-label="Animation playback controls">
            <button id="btn-play-pause" class="playback-btn" type="button" aria-label="Pause animation">
              <svg class="control-icon" aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path id="play-pause-icon" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path>
              </svg>
              <span id="txt-play-pause" class="sr-only">Pause</span>
            </button>

            <button id="btn-replay" class="playback-btn" type="button" aria-label="Replay animation">
              <svg class="control-icon" aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"></path>
              </svg>
              <span>Replay</span>
            </button>

            <div class="timeline-seek-wrapper">
              <label for="timeline-seek" class="sr-only">Timeline seek</label>
              <input
                id="timeline-seek"
                class="timeline-slider"
                type="range"
                min="0"
                max="10000"
                value="0"
                step="1"
                aria-valuetext="0.00 seconds"
              >
              <span id="time-display" class="time-display">0.00s / 10.00s</span>
            </div>
          </div>

          <div class="phase-selector-row" role="group" aria-label="Jump to phase">
            <button class="phase-btn active" type="button" data-phase="metadata" data-seek-time="0" aria-label="Phase 1: Metadata">Metadata</button>
            <button class="phase-btn" type="button" data-phase="discover" data-seek-time="2000" aria-label="Phase 2: Discover">Discover</button>
            <button class="phase-btn" type="button" data-phase="select" data-seek-time="4000" aria-label="Phase 3: Select">Select</button>
            <button class="phase-btn" type="button" data-phase="hydrate" data-seek-time="6000" aria-label="Phase 4: Hydrate">Hydrate</button>
            <button class="phase-btn" type="button" data-phase="ready" data-seek-time="8000" aria-label="Phase 5: Ready">Ready</button>
          </div>
        </div>

      </div>
    </div>
    <script type="module" src="${withSiteBasePath(basePath, 'animation.js')}"></script>
  </section>
</main>

<footer>
  <p>&copy; 2026 RND-PRO. Released under the MIT License.</p>
  <p>View the <a href="https://github.com/RND-PRO/symbiote-ui">source code on GitHub</a>.</p>
</footer>

<script>
const themeToggle = document.getElementById('theme-toggle');
const root = document.documentElement;
const themeIcon = themeToggle.querySelector('.theme-icon');
const themeLabel = themeToggle.querySelector('.theme-label');

function setTheme(dark) {
  if (dark) {
    root.setAttribute('data-theme', 'dark');
    root.style.colorScheme = 'dark';
    localStorage.setItem('theme', 'dark');
    themeToggle.setAttribute('aria-label', 'Switch to light theme');
    themeIcon.textContent = '☀';
    themeLabel.textContent = 'Light Theme';
  } else {
    root.setAttribute('data-theme', 'light');
    root.style.colorScheme = 'light';
    localStorage.setItem('theme', 'light');
    themeToggle.setAttribute('aria-label', 'Switch to dark theme');
    themeIcon.textContent = '☾';
    themeLabel.textContent = 'Dark Theme';
  }
}

const storedTheme = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
setTheme(storedTheme === 'dark' || (!storedTheme && prefersDark));

themeToggle.addEventListener('click', () => {
  const isDark = root.getAttribute('data-theme') === 'dark';
  setTheme(!isDark);
});


</script>
</body>
</html>`;
