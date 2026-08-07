import { Graph, Executor, registerNodeType } from '../../browser.js';

let processDelayMs = 0;
const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

// Register custom node types using array-shaped driver inputs and outputs
registerNodeType({
  type: 'demo/math_add',
  driver: {
    description: 'Add two numbers together',
    inputs: [
      { name: 'a', type: 'number', required: true },
      { name: 'b', type: 'number', required: true }
    ],
    outputs: [
      { name: 'result', type: 'number' }
    ]
  },
  process: async (inputs, params) => {
    if (processDelayMs > 0) await wait(processDelayMs);
    const a = inputs.a !== undefined ? inputs.a : (params.a || 0);
    const b = inputs.b !== undefined ? inputs.b : (params.b || 0);
    return { result: a + b };
  }
});

registerNodeType({
  type: 'demo/text_fmt',
  driver: {
    description: 'Format a value into a message string',
    inputs: [
      { name: 'val', type: 'any', required: true }
    ],
    outputs: [
      { name: 'result', type: 'string' }
    ]
  },
  process: async (inputs, params) => {
    if (processDelayMs > 0) await wait(processDelayMs);
    const prefix = params.prefix || 'Result is: ';
    return { result: `${prefix}${inputs.val}` };
  }
});

const executor = new Executor();

// Bind elements
const btnRun = document.getElementById('btn-run-dag');
const btnClear = document.getElementById('btn-clear-cache');
const outConsole = document.getElementById('demo-output');
const chkCache = document.getElementById('param-cache');
const chkDelay = document.getElementById('param-delay');
const chkForce = document.getElementById('param-force');

const nodeMath1 = document.getElementById('node-math1');
const nodeMath2 = document.getElementById('node-math2');
const nodeFmt1 = document.getElementById('node-fmt1');

function logTerminal(message, type = 'info') {
  const line = document.createElement('div');
  line.className = `terminal-line terminal-${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  outConsole.appendChild(line);
  outConsole.scrollTop = outConsole.scrollHeight;
}

function clearVisualStates() {
  [nodeMath1, nodeMath2, nodeFmt1].forEach(node => {
    node.className = 'dag-node';
  });
}

async function runDemo() {
  btnRun.disabled = true;
  clearVisualStates();
  outConsole.innerHTML = '';

  logTerminal('Initializing Graph Model...', 'info');
  const graph = new Graph();
  graph.name = 'Interactive Walkthrough Workflow';

  // Construct DAG nodes
  const n1 = graph.addNode('demo/math_add', { a: 10, b: 20 }, { id: 'math1' });
  const n2 = graph.addNode('demo/math_add', { b: 12 }, { id: 'math2' });
  const n3 = graph.addNode('demo/text_fmt', {}, { id: 'fmt1' });

  graph.nodes.get(n3).params = { prefix: 'Computed final value: ' };

  logTerminal(`Connecting sockets dynamically...`, 'info');
  // Node A Output 'result' -> Node B Input 'a'
  graph.connect(n1, 'result', n2, 'a');
  // Node B Output 'result' -> Node C Input 'val'
  graph.connect(n2, 'result', n3, 'val');

  logTerminal(`Graph structure created successfully: ${graph.nodes.size} nodes and ${graph.connections.length} connections.`, 'success');
  logTerminal(`Starting execution using Kahn's topological sorting pipeline...`, 'info');

  const forceRun = chkForce.checked;
  const useIncremental = chkCache.checked && !forceRun;
  processDelayMs = chkDelay.checked ? 300 : 0;

  logTerminal(useIncremental ? 'Incremental cache is enabled for this run.' : 'This run will execute every node.', forceRun ? 'warn' : 'info');

  try {
    const res = await executor.run(graph, {
      cache: useIncremental,
      onNodeStart: (id, node) => {
        logTerminal(`[LIFECYCLE START] Node: ${id} (${node.type})`, 'info');

        // Highlight active node in DOM
        const domEl = document.getElementById(`node-${id}`);
        if (domEl) domEl.className = 'dag-node active';

      },
      onNodeComplete: (id, output, timeMs) => {
        logTerminal(`[LIFECYCLE COMPLETE] Node: ${id} -> Output: ${JSON.stringify(output)}`, 'success');

        // Update DOM node to green
        const domEl = document.getElementById(`node-${id}`);
        if (domEl) {
          domEl.className = 'dag-node done';
        }
      },
      onNodeSkipped: (id) => {
        logTerminal(`[CACHE HIT] Node: ${id} -> Bypassed execution (State unchanged)`, 'warn');

        // Mark as finished immediately since it was skipped due to unchanged state
        const domEl = document.getElementById(`node-${id}`);
        if (domEl) {
          domEl.className = 'dag-node done';
        }
      }
    });

    logTerminal(`Workflow completed successfully! Execution Order: ${res.executionOrder.join(' -> ')}`, 'success');
    logTerminal(`Final system output: ${JSON.stringify(res.outputs.fmt1)}`, 'success');

  } catch (err) {
    logTerminal(`Execution Failed: ${err.message}`, 'error');
  } finally {
    processDelayMs = 0;
    btnRun.disabled = false;
  }
}

// Bind Button Events
btnRun.addEventListener('click', runDemo);

btnClear.addEventListener('click', () => {
  executor.clearCache();

  clearVisualStates();
  logTerminal('Executor cache cleared. Next execution will result in complete cache misses.', 'warn');
});
