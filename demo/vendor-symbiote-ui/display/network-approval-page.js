import { createTranslator, getLocalization } from '../locale/index.js';
import { createCellBgStandaloneScript } from '../effects/CellBg/cell-bg-theme.js';

const TEXT_KEYS = {
  title: 'networkApproval.title',
  heading: 'networkApproval.heading',
  message: 'networkApproval.message',
  requestLabel: 'networkApproval.requestLabel',
  addressLabel: 'networkApproval.addressLabel',
  waitingStatus: 'networkApproval.waitingStatus',
  approvedStatus: 'networkApproval.approvedStatus',
  rejectedStatus: 'networkApproval.rejectedStatus',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function serializeText(text = {}, options = {}) {
  let locale = options.locale ?? getLocalization().locale;
  let t = createTranslator({ locale, messages: options.messages });
  let defaults = Object.fromEntries(
    Object.entries(TEXT_KEYS).map(([name, key]) => [name, t(key)])
  );
  return { ...defaults, ...text };
}

function scriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function createNetworkApprovalPageStyles() {
  return `
    :root {
      --sn-theme-hue: 218;
      --sn-theme-chroma: 89%;
      --sn-theme-bg-lightness: 10%;
      --sn-theme-surface-lightness: 13%;
      --sn-theme-text-lightness: 94%;
      --sn-theme-radius-scale: 1;
      --sn-theme-motion-scale: 1;
      --sn-theme-elevation-scale: 1;
      --sn-hue-base: 0;
      --sn-hue-accent: var(--sn-theme-hue);
      --sn-sat-vivid: var(--sn-theme-chroma);
      --sn-sat-muted: 0%;
      --sn-lit-bg: var(--sn-theme-bg-lightness);
      --sn-lit-surface: var(--sn-theme-surface-lightness);
      --sn-lit-text: var(--sn-theme-text-lightness);
      --sn-lit-text-dim: 60%;
      --sn-lit-accent: 63%;
      --sn-sys-surface: hsl(0 0% var(--sn-lit-bg));
      --sn-sys-surface-panel: hsl(0 0% var(--sn-lit-surface));
      --sn-sys-outline: hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text) / 0.1);
      --sn-sys-accent: hsl(var(--sn-hue-accent) var(--sn-sat-vivid) var(--sn-lit-accent));
      --sn-node-radius: calc(6px * var(--sn-theme-radius-scale));
      --sn-node-shadow: 0 2px calc(8px * var(--sn-theme-elevation-scale)) hsl(var(--sn-hue-base) var(--sn-sat-muted) 0% / 0.4);
      --sn-sys-on-surface: hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text));
      --sn-sys-on-surface-dim: hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text-dim));
      --sn-font: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      --sn-font-mono: 'JetBrains Mono', 'Fira Code', monospace;
      --sn-cell-bg: var(--sn-sys-surface);
      --sn-cell-dot: hsl(var(--sn-hue-base) var(--sn-sat-muted) 31%);
      --sn-cell-base-alpha: 0.06;
      --sn-cell-alpha-span: 0.18;
      --sn-cell-size: 14px;
      --sn-cell-min-radius: 2px;
      --sn-cell-max-radius: 5px;
      --sn-cell-step-ms: 75ms;
      --sn-cell-fade-rate: 0.04;
      --sn-cell-glare: hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text) / 0.02);
      --sn-cell-vignette-mid: hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-bg) / 0.7);
      --sn-cell-vignette-edge: var(--sn-sys-surface);
      --sn-cell-noise: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.5' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      overflow: hidden;
      background: var(--sn-cell-bg);
      color: var(--sn-sys-on-surface);
      font: 14px var(--sn-font);
    }

    .sn-network-approval-cell-bg,
    .sn-network-approval-cell-bg canvas,
    .sn-network-approval-cell-bg::after,
    body::after {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
    }

    .sn-network-approval-cell-bg {
      overflow: hidden;
      z-index: 0;
    }

    .sn-network-approval-cell-bg canvas {
      width: 100%;
      height: 100%;
      display: block;
      background: var(--sn-cell-bg);
    }

    .sn-network-approval-cell-bg::after {
      background:
        radial-gradient(circle at 50% -10%, var(--sn-cell-glare) 0%, transparent 100%),
        radial-gradient(circle at 50% 50%, transparent 20%, var(--sn-cell-vignette-mid) 70%, var(--sn-cell-vignette-edge) 100%),
        var(--sn-cell-noise);
    }

    body::after {
      background:
        linear-gradient(to bottom, var(--sn-sys-surface) 0%, transparent 18%),
        linear-gradient(to top, var(--sn-sys-surface) 0%, transparent 18%),
        linear-gradient(to right, var(--sn-sys-surface) 0%, transparent 18%),
        linear-gradient(to left, var(--sn-sys-surface) 0%, transparent 18%);
      z-index: 1;
    }

    main {
      position: relative;
      width: min(520px, calc(100vw - 32px));
      padding: 22px;
      border: 1px solid var(--sn-sys-outline);
      border-radius: var(--sn-node-radius);
      background: color-mix(in oklab, var(--sn-sys-surface-panel) 92%, transparent);
      box-shadow: var(--sn-node-shadow), 0 18px 60px hsl(var(--sn-hue-base) var(--sn-sat-muted) 0% / 0.32);
      backdrop-filter: blur(18px);
      z-index: 2;
    }

    h1 {
      margin: 0 0 10px;
      font-size: 18px;
      line-height: 1.2;
      letter-spacing: 0;
    }

    p {
      margin: 10px 0 0;
      color: var(--sn-sys-on-surface-dim);
      line-height: 1.45;
    }

    code {
      color: var(--sn-sys-accent);
      font-family: var(--sn-font-mono);
      font-size: 12px;
    }

    #status {
      color: var(--sn-sys-on-surface);
    }

    @media (prefers-reduced-motion: reduce) {
      .sn-network-approval-cell-bg canvas {
        opacity: 0.55;
      }
    }
  `;
}

export function createNetworkApprovalCellBgScript() {
  return createCellBgStandaloneScript({
    canvasId: 'sn-network-approval-canvas',
  });
}

export function renderNetworkApprovalPage(options = {}) {
  let text = serializeText(options.text, options);
  let requestId = String(options.requestId ?? '');
  let address = String(options.address ?? '');
  let waitEndpoint = String(options.waitEndpoint || '/api/network-auth/wait');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(text.title)}</title>
  <style>${createNetworkApprovalPageStyles()}</style>
</head>
<body>
  <div class="sn-network-approval-cell-bg" aria-hidden="true">
    <canvas id="sn-network-approval-canvas"></canvas>
  </div>
  <main>
    <h1>${escapeHtml(text.heading)}</h1>
    <p>${escapeHtml(text.message)}</p>
    <p>${escapeHtml(text.requestLabel)}: <code>${escapeHtml(requestId)}</code><br>${escapeHtml(text.addressLabel)}: <code>${escapeHtml(address)}</code></p>
    <p id="status">${escapeHtml(text.waitingStatus)}</p>
  </main>
  <script>${createNetworkApprovalCellBgScript()}</script>
  <script>
    const requestId = ${scriptJson(requestId)};
    const waitEndpoint = ${scriptJson(waitEndpoint)};
    const approvedStatus = ${scriptJson(text.approvedStatus)};
    const rejectedStatus = ${scriptJson(text.rejectedStatus)};
    async function poll() {
      try {
        const separator = waitEndpoint.includes('?') ? '&' : '?';
        const res = await fetch(waitEndpoint + separator + 'id=' + encodeURIComponent(requestId), { cache: 'no-store' });
        const data = await res.json();
        if (data.ok) {
          document.getElementById('status').textContent = approvedStatus;
          location.reload();
          return;
        }
        if (data.rejected) {
          document.getElementById('status').textContent = rejectedStatus;
          return;
        }
      } catch {}
      setTimeout(poll, 1500);
    }
    poll();
  </script>
</body>
</html>`;
}
