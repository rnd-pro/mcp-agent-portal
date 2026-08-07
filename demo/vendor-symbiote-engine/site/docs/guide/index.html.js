import { renderDocsPage } from 'library-pages/shell';
import { docsRoutes, docsSiteConfig } from '../../site.config.js';

const currentRoute = docsRoutes.find((route) => route.path === '/docs/guide/');

export default renderDocsPage({
  siteConfig: docsSiteConfig(currentRoute),
  routes: docsRoutes,
  currentRoute,
  contentHtml: /*html*/ `
  <div class="docs-header" id="guide">
    <h1>Guide</h1>
    <p>
      Dive deeper into the Symbiote Engine architecture: inputs & contracts, sequential execution pipelines, cache management modes, and graph history utilities.
    </p>
  </div>

  <section>
    <h2 id="inputs-contracts">Inputs &amp; Contracts</h2>
    <p>
      Symbiote Engine uses metadata contracts to represent data flowing between nodes. Sockets are declared using structured definitions:
    </p>
    <ul>
      <li><strong>Structured Definitions:</strong> Inputs and outputs are declared on the node's driver (using names and types).</li>
      <li><strong>Normalized Interfaces:</strong> Nodes read from a standardized input dictionary and output a plain JavaScript object.</li>
      <li><strong>Provider Contracts:</strong> Providers encapsulate execution capability. Host applications configure connection parameters, authentication, and execution environments. Executable providers require their own <code>execute</code> function. Generic input/parameter projection belongs only to node definitions without <code>process</code> or <code>lifecycle</code>.</li>
    </ul>
    <div class="callout callout--warning">
      <h4>Boundary &amp; Validation Caveats</h4>
      <ul>
        <li>Registry state is module-global. Parameter constraints are partially checked, and the Executor does not invoke validation automatically.</li>
        <li>Socket mismatch validation is only executed during connection, and only if both node types and both named sockets are registered.</li>
        <li>Cycles are not detected during connection establishment.</li>
      </ul>
    </div>
  </section>

  <section>
    <h2 id="execution-pipeline">Execution &amp; Pipeline</h2>
    <p>
      The <code>Executor</code> runs sequential traversal based on a Kahn topological sort of the graph's connections. Node execution routes through one of two execution paths based on registration:
    </p>

    <h3>1. Process-Only Execution</h3>
    <p>
      If a node type is registered with a <code>process</code> function and no lifecycle, the executor runs the process function directly. If no process function is defined, it projects static parameters and current inputs directly to outputs.
    </p>

    <h3>2. Lifecycle Execution Path</h3>
    <p>
      If a node type registers a <code>lifecycle</code> object, the executor bypasses the standard process function and executes this structured sequence:
    </p>
    <ol>
      <li><strong>Validate:</strong> Runs optional node-level validation. If validation fails or throws an error, it returns a <code>{ _error: message }</code> object, logs the error, and graph execution continues without halting.</li>
      <li><strong>Cache Key:</strong> Generates a cache key for the lifecycle cache lookup.</li>
      <li><strong>Lifecycle Cache Check:</strong> Inspects the executor-local cache using the node ID and computed key. If hit, cached outputs are reused.</li>
      <li><strong>Execute:</strong> Runs the node execution logic.</li>
      <li><strong>Post-Process:</strong> Runs optional synchronous post-processing.</li>
      <li><strong>Store:</strong> Saves execution outputs to the local cache.</li>
    </ol>
  </section>

  <section>
    <h2 id="cache-identity-modes">Cache Identity &amp; Modes</h2>
    <p>
      To prevent redundant computations, Symbiote Engine manages caching at two distinct layers:
    </p>

    <h3>Lifecycle Cache Modes</h3>
    <p>
      The lifecycle cache is executor-local and keys items by node ID and a computed key. It supports three caching modes:
    </p>
    <ul>
      <li><code>auto</code>: Reuses outputs if inputs/parameters match the cached key.</li>
      <li><code>freeze</code>: Returns a lifecycle record only when one exists; otherwise execution proceeds.</li>
      <li><code>force</code>: Bypasses lifecycle lookup only and can still be pre-empted by incremental node-ID reuse.</li>
    </ul>

    <h3>Cache Key Default Behavior</h3>
    <p>
      The default cache key is computed by stringifying the node's current inputs and parameters:
    </p>
    <pre><code data-language="js">// Default cache key generation
JSON.stringify({ i: inputs, p: params })</code></pre>
    <p>
      Note that this default generation is a direct, un-hashed stringification. It is not canonicalized or sorted.
    </p>

    <h3>Incremental Executor Cache</h3>
    <p>
      Separate from the lifecycle cache, the executor supports an incremental cache when <code>cache: true</code> is set.
    </p>
    <ul>
      <li>If a node ID has prior cached outputs and is not explicitly marked dirty, the executor immediately reuses the outputs without comparing inputs.</li>
      <li>This incremental check is performed before the lifecycle cache checks, meaning it takes priority over <code>force</code> mode. Setting <code>cache: false</code> disables incremental reuse but does not disable the lifecycle cache or make orphan/branch-skipped nodes execute.</li>
      <li>Call <code>clearCache()</code> to clear both the incremental and lifecycle cache stores.</li>
    </ul>
  </section>

  <section>
    <h2 id="storage-history">Storage &amp; History</h2>
    <p>
      Workflow state, caching, and editing history are transient and host-driven:
    </p>

    <h3>State Caching &amp; Persistence</h3>
    <p>There are three separate systems for state and persistence:</p>
    <ul>
      <li><strong>Serialization:</strong> <code>serialize()</code> and <code>deserialize()</code> operate on graph topologies. They exclude computed outputs (<code>_output</code>) by default and do not preserve execution cache, log, or dirtiness states.</li>
      <li><strong>Host Persistence Adapters:</strong> Host-supplied persistence adapters handle storage, including the transient memory adapter.</li>
      <li><strong>Node file helpers:</strong> Provided by <code>Persistence.js</code>, which is not the memory adapter. Its dormant dynamic Node imports remain in the browser module graph.</li>
    </ul>

    <h3>GraphHistory Utility</h3>
    <p>
      The <code>GraphHistory</code> utility manages workflow revision history (up to 50 snapshots) for undo/redo actions:
    </p>
    <pre><code data-language="js">import { Graph, GraphHistory } from 'symbiote-engine/browser';

const graph = new Graph();
const history = new GraphHistory();

// Push an initial snapshot of the graph to history
history.push([...graph.nodes.values()], graph.connections);

// Make a graph change
graph.addNode('docs/source', { value: 1 });

// Push a second snapshot
history.push([...graph.nodes.values()], graph.connections);

// Undo the change
const previousSnapshot = history.undo();</code></pre>
    <p>
      <strong>Crucial note:</strong> One snapshot alone makes <code>undo()</code> return <code>null</code>. The <code>undo()</code> and <code>redo()</code> methods return state snapshots containing only nodes and connections. Snapshots do not mutate the active <code>Graph</code> instance in-place. The caller must manually apply these snapshots back to their graph representation.
    </p>
  </section>
`,
});
