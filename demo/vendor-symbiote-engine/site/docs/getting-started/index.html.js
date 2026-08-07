import { renderDocsPage } from 'library-pages/shell';
import { docsRoutes, docsSiteConfig } from '../../site.config.js';

const currentRoute = docsRoutes.find((route) => route.path === '/docs/getting-started/');

export default renderDocsPage({
  siteConfig: docsSiteConfig(currentRoute),
  routes: docsRoutes,
  currentRoute,
  contentHtml: /*html*/ `
  <div class="docs-header" id="getting-started">
    <h1>Getting Started</h1>
    <p>
      Symbiote Engine is a pure ESM execution library for Directed Acyclic Graphs (DAGs). This guide walks you through package installation, custom node registration, graph construction, and executing your first pipeline.
    </p>
  </div>

  <section>
    <h2 id="installation">Installation</h2>
    <p>
      Install the package using your preferred package manager. Symbiote Engine requires Node.js version 18 or higher.
    </p>
    <pre><code data-language="bash">npm install symbiote-engine</code></pre>
    <p>
      Since the library is published as a pure ES Module (ESM), ensure your project is configured to support ESM. You can do this by setting <code>"type": "module"</code> in your project's <code>package.json</code> file:
    </p>
    <pre><code data-language="json">{
  "name": "your-project",
  "type": "module"
}</code></pre>
  </section>

  <section>
    <h2 id="first-graph">Your First Graph</h2>
    <p>
      The following executable example shows how to import the required classes, register custom node types, build a simple math pipeline (with nodes that generate and double a value), and execute the graph to yield <code>42</code>.
    </p>

    <pre><code data-language="js">import { Graph, Executor, registerNodeType } from 'symbiote-engine/browser';

registerNodeType({
  type: 'docs/source',
  driver: {
    inputs: [],
    outputs: [{ name: 'value', type: 'number' }],
  },
  process: (_inputs, { value }) => ({ value }),
});

registerNodeType({
  type: 'docs/double',
  driver: {
    inputs: [{ name: 'value', type: 'number' }],
    outputs: [{ name: 'result', type: 'number' }],
  },
  process: ({ value }) => ({ result: value * 2 }),
});

const graph = new Graph();
const source = graph.addNode('docs/source', { value: 21 });
const double = graph.addNode('docs/double');

graph.connect(source, 'value', double, 'value');

const result = await new Executor().run(graph);
console.log(result.outputs[double].result); // 42
</code></pre>

    <div class="node-preview">
      <p class="node-preview-heading">The same graph, rendered as nodes</p>
      <div class="node-preview-stage" data-node-preview>
        <div class="node-preview-fallback">
          Source <span aria-hidden="true">→</span> Double
          <br>
          <small>Interactive node preview loads from Symbiote UI when available.</small>
        </div>
      </div>
      <p class="node-preview-note">The preview is read-only: the graph model remains owned by this documentation page.</p>
    </div>
  </section>

  <section>
    <h2 id="custom-nodes">Node Registration</h2>
    <p>
      Custom node definitions are registered globally via <code>registerNodeType</code>. Node registrations dictate the interface (or driver contract) for custom nodes:
    </p>
    <ul>
      <li><code>type</code>: A unique string identifier representing the node type (e.g., <code>'math/add'</code>).</li>
      <li><code>driver</code>: Specifies the inputs and outputs, along with their names and expected types.</li>
      <li><code>process</code>: The processing function that executes when the node runs. It receives inputs (from connections) and static parameters. If no process function is defined on a generic node definition, the Executor projects static parameters combined with current inputs to the outputs. This generic projection belongs only to node definitions, never to providers, which require executable functions.</li>
    </ul>
  </section>

  <section>
    <h2 id="execution-pipeline">Execution Pipeline</h2>
    <p>
      The <code>Executor</code> runs the DAG sequentially. Here are the key execution steps:
    </p>
    <ul>
      <li><strong>Topological Sorting:</strong> Execution follows Kahn's algorithm, ordering nodes according to their directed connections so that a node's dependencies run before it does.</li>
      <li><strong>Orphan Nodes:</strong> Isolated or orphan nodes with no connections are omitted during execution.</li>
      <li><strong>Socket Matching:</strong> Graph connection validation verifies socket compatibility only when both node definitions and their named sockets exist in the registry. No cyclic checking is performed during connection.</li>
    </ul>
  </section>
`,
});
