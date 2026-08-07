import { renderDocsPage } from 'library-pages/shell';
import { docsRoutes, docsSiteConfig } from '../../site.config.js';

const currentRoute = docsRoutes.find((route) => route.path === '/docs/safety/');

export default renderDocsPage({
  siteConfig: docsSiteConfig(currentRoute),
  routes: docsRoutes,
  currentRoute,
  contentHtml: /*html*/ `
  <div class="docs-header" id="overview">
    <h1>Safety & Security</h1>
    <p>
      Symbiote Engine prioritizes portability and minimal dependencies. Because the graph runtime acts as an execution coordinator rather than a security manager, hosts must establish appropriate isolation boundaries, credential management systems, and network controls.
    </p>
  </div>

  <section>
    <h2 id="driver-execution">Custom Driver Execution</h2>
    <p>
      Custom node drivers can be registered dynamically at runtime. When dynamic node definitions are compiled, the registry evaluates their implementation via standard JavaScript mechanisms:
    </p>
    <ul>
      <li>
        <strong>Dynamic Compilation:</strong> The runtime compiles graph-supplied string processes using the <code>new Function</code> constructor via <code>registerCustomDrivers</code>. Graph-supplied string processes compile in the current JavaScript realm, not a guaranteed main or "host" thread. Ordinary registered drivers and handler modules are not all dynamically compiled.
      </li>
      <li>
        <strong>No Sandbox Isolation:</strong> The engine does not provide a VM boundary, worker sandbox, or secure execution container. Custom drivers, lifecycle hooks, and handlers run in the current JavaScript realm with the ambient authority available there.
      </li>
      <li>
        <strong>Ambient Authority:</strong> Graph custom drivers run with the ambient capabilities of the current realm. Handlers are ordinary trusted imports. They do not have arbitrary lexical host-variable access.
      </li>
    </ul>

    <div class="callout callout--warning">
      <h4>Warning: Only run trusted graph configurations</h4>
      <p>
        Hosts must ensure that only verified graph structures and trusted node driver types are loaded into the registry. If your system runs user-submitted workflows, you must execute the engine inside an external sandboxed environment (such as a secure VM or container) managed at the system level.
      </p>
    </div>
  </section>

  <section>
    <h2 id="security-boundaries">Security Boundaries & Credentials</h2>
    <p>
      Protecting sensitive API keys, tokens, and data fields is the responsibility of the host application:
    </p>
    <ul>
      <li>
        <strong>No Native Credential Protection:</strong> The runtime does not automatically scrub, encrypt, or hide credentials that are written directly into a graph's JSON representation. Storing raw credentials in graph parameters makes them serializable and visible.
      </li>
      <li>
        <strong>External Key Management:</strong> Keep authentication credentials outside serialized graph data. Graph parameters may contain arbitrary values; when a node needs a credential, store a non-secret reference identifier and let host-owned handlers or providers resolve it outside graph data.
      </li>
    </ul>

    <h3>Authority Boundary</h3>
    <table class="reference-table">
      <thead>
        <tr><th>Entity</th><th>Responsibility</th></tr>
      </thead>
      <tbody>
        <tr><td><strong>Graph Data</strong></td><td>Can contain arbitrary parameters; credential fields should contain non-secret references.</td></tr>
        <tr><td><strong>Engine Execution</strong></td><td>Coordinates nodes but has no credential awareness.</td></tr>
        <tr><td><strong>Host Policy</strong></td><td>Resolves secrets and manages execution policies.</td></tr>
        <tr><td><strong>External Service</strong></td><td>Authorizes requests using host-resolved credentials.</td></tr>
      </tbody>
    </table>

    <pre><code data-language="js">// Store a non-secret reference
const referenceParams = {
  voice: 'en-male-1',
  credentialRef: 'voice-provider/primary'
};</code></pre>
    <p>Engine neither validates nor resolves this reference; a host-owned resolver does so under host policy.</p>
  </section>

  <section>
    <h2 id="network-safety">Network Boundaries & GraphServer</h2>
    <p>
      The library includes a development server for synchronization sessions, which can be imported via:
    </p>
    <pre><code data-language="js">import { createServer } from 'symbiote-engine/GraphServer.js';</code></pre>

    <p>
      When utilizing this server primitive, hosts must be aware of the following security limitations:
    </p>
    <ul>
      <li>
        <strong>Wildcard Origin Policy:</strong> The development server operates with unrestricted wildcard CORS (<code>Access-Control-Allow-Origin: *</code>) and any-origin WebSocket connections.
      </li>
      <li>
        <strong>No Authentication:</strong> The server lacks built-in authentication, authorization, rate limiting, request validation, or TLS encryption.
      </li>
      <li>
        <strong>Remote Mutate/Execute Capability:</strong> Because the server exposes endpoints that allow remote connections to edit and execute graphs, exposing it directly to public networks is dangerous.
      </li>
    </ul>

    <div class="callout">
      <h4>Production Deployments</h4>
      <p>
        For production environments, do not expose <code>GraphServer.js</code> directly. Instead, wrap the synchronization endpoints in a secure server architecture that enforces authentication, rate limiting, transport encryption (HTTPS/WSS), and tenant boundaries.
      </p>
    </div>
  </section>
`,
});
