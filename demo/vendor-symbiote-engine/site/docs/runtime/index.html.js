import { renderDocsPage } from 'library-pages/shell';
import { docsRoutes, docsSiteConfig } from '../../site.config.js';

const currentRoute = docsRoutes.find((route) => route.path === '/docs/runtime/');

export default renderDocsPage({
  siteConfig: docsSiteConfig(currentRoute),
  routes: docsRoutes,
  currentRoute,
  contentHtml: /*html*/ `
  <div class="docs-header" id="overview">
    <h1>Runtime & CLI</h1>
    <p>
      Symbiote Engine divides execution utilities between browser-compatible APIs and server-side runtimes. It ships with a command-line interface (CLI) for validation and local execution, along with a lightweight synchronization server for development.
    </p>
  </div>

  <section>
    <h2 id="packages">Package Entrypoints</h2>
    <p>
      The library provides two primary entry points to organize browser-safe logic separately from Node.js-only operations:
    </p>
    <ul>
      <li>
        <strong><code>symbiote-engine/browser</code>:</strong> Exposes core data models (<code>Graph</code>, <code>Executor</code>, and registry utilities) that can build, connect, and execute graphs inside a browser. To prevent browser bundle crashes, this module excludes exported file helpers, server, implementation queues, and local providers.
      </li>
      <li>
        <strong><code>symbiote-engine</code> (Node entrypoint):</strong> Adds server-side capabilities, including persistence wrappers, in-memory task queues, local audio providers, and media rendering wrappers.
      </li>
    </ul>

    <div class="callout callout--warning">
      <h4>Browser Caveats & Bundler Compatibility</h4>
      <p>
        Note these limitations. Do not assume every browser consumer or bundler is supported:
      </p>
      <ul>
        <li>The <code>downloadGraph</code> API requires <code>Blob</code>, <code>URL</code>, and <code>document</code>.</li>
        <li>The <code>FocusController</code> uses location and events at call time.</li>
        <li><code>Persistence.js</code> contains dormant dynamic Node file imports.</li>
      </ul>
    </div>
  </section>

  <section>
    <h2 id="cli-commands">CLI Commands</h2>
    <p>
      The package installs the <code>symbiote-engine</code> command-line executable. It allows developers to run workflows, validate graph definitions, list registered nodes, and inspect workflow structures.
    </p>

    <h3>Usage & Syntax</h3>
    <pre><code data-language="bash"># Execute a workflow graph using local handlers
symbiote-engine run &lt;workflow.json&gt; [--pack video] [--handlers ./custom] [--secrets ./secrets.json] [--verbose] [--json]

# Validate graph definitions (does not perform complete schema validation)
symbiote-engine validate &lt;workflow.json&gt; [--pack video] [--handlers ./custom] [--json]

# List all registered node types in the current environment
symbiote-engine list [--pack video] [--handlers ./custom] [--json]

# Inspect a workflow file without running it
symbiote-engine inspect &lt;workflow.json&gt; [--json]

# Launch the WebSocket synchronization server for a workflow
symbiote-engine serve &lt;workflow.json&gt; [--port 3100] [--handlers ./custom] [--verbose]</code></pre>

    <div class="callout">
      <h4>CLI & Parameter Constraints</h4>
      <ul>
        <li>
          <strong>Secrets:</strong> The <code>--secrets</code> argument expects a path. It otherwise attempts <code>./secrets.json</code>, but either loaded object is passed under an Executor option the handlers do not consume. It does not provide automated secrets injection or secure storage.
        </li>
        <li>
          <strong>Packs:</strong> The <code>--pack</code> flag is mapped specifically to the built-in <code>video-pack</code>. Collections like <code>packs/ai</code>, <code>packs/flow</code>, and <code>packs/transform</code> are handler collections, not CLI <code>--pack</code> names. To load other local JS handlers dynamically, use the <code>--handlers &lt;dir&gt;</code> flag instead.
        </li>
        <li>
          <strong>Partial JSON Error Output:</strong> When <code>--json</code> is enabled, syntax errors, missing file errors, or severe runtime exceptions may throw standard process errors, resulting in partial or incomplete JSON outputs in the terminal stream.
        </li>
      </ul>
    </div>
  </section>

  <section>
    <h2 id="graph-server">GraphServer Connection</h2>
    <p>
      The <code>GraphServer</code> subpath provides a factory to synchronize graph modifications between a local workspace and front-end editor components.
    </p>

    <h3>Programmatic Server Initialization</h3>
    <p>
      Because it is not part of the root export, <code>GraphServer</code> must be imported directly from its module path. It requires the <code>ws</code> peer dependency (version 8 or higher) to be resolved in the host environment.
    </p>

    <pre><code data-language="js">import { createServer } from 'symbiote-engine/GraphServer.js';

const serverInstance = await createServer({
  port: 3100,
  workflowFile: './workflows/main.workflow.json',
  handlersDir: './handlers',
  watchFiles: true,
  verbose: true
});

// Close the HTTP/WS server and watchers when done
await serverInstance.close();</code></pre>

    <div class="callout callout--warning">
      <h4>Development Security & Protocol Boundaries</h4>
      <p>
        The <code>GraphServer</code> is a development primitive and does not represent a production-ready application server. Consider these security limits:
      </p>
      <ul>
        <li>
          <strong>No Authentication:</strong> The server contains no credentials verification, TLS encryption, or authorization policies.
        </li>
        <li>
          <strong>Wildcard Permissions:</strong> It serves wildcard CORS headers (<code>*</code>) and permits WebSocket connections from any origin.
        </li>
        <li>
          <strong>Remote Mutation:</strong> Clients connecting to the WebSocket have complete access to modify the graph (adding nodes, removing nodes, connecting sockets) and trigger execution on the host machine.
        </li>
        <li>
          <strong>Watcher Bug:</strong> When file watching is enabled, the server watcher parses the JSON to an object, and then passes that object to a function that calls <code>JSON.parse</code>, which results in a failing reload, not just extra overhead.
        </li>
      </ul>
    </div>
  </section>

  <section>
    <h2 id="handler-packs">Reusable Handler Packs</h2>
    <p>
      Packs allow developers to bundle and share custom node handler definitions.
    </p>
    <ul>
      <li>
        <strong>Video-Pack:</strong> The built-in <code>video-pack</code> automatically registers metadata descriptors for audio-visual operations upon import. However, many descriptors fall back to a generic projection behavior (processing parameters and matching outputs) without executing real media manipulation. Users must register custom media drivers to perform concrete video editing or synthesis tasks.
      </li>
      <li>
        <strong>Custom Handlers:</strong> Reusable JavaScript handlers can be hotloaded from a designated folder at launch. These files must match the <code>*.handler.js</code> suffix and register their operational logic with the engine's node registry.
      </li>
    </ul>
  </section>
`,
});
