/**
 * GraphText — bidirectional text ↔ graph serialization
 *
 * Converts NodeEditor state to human-readable text and back.
 * Useful for debugging, LLM-based generation, and quick iteration.
 *
 * Text format:
 *   NODES:
 *   [○ trigger] Job Event: RU (queue/job-event) shape=circle
 *   [◇ switch_status] Status? (flow/switch) shape=diamond
 *
 *   CONNECTIONS:
 *   trigger.exec --> switch_status.exec
 *   switch_status.created --> fmt_created.exec
 *
 *   FRAMES:
 *   [Formatters] color=#5cd87a x=490 y=-10 w=260 h=520
 *
 * @module symbiote-ui/core/GraphText
 */

const SHAPE_ICONS = {
  circle: '○',
  diamond: '◇',
  pill: '⊃',
  rect: '□',
  comment: '✎',
};

const ICON_SHAPES = Object.fromEntries(Object.entries(SHAPE_ICONS).map(([k, v]) => [v, k]));

/**
 * Convert a NodeEditor to human-readable text
 *
 * @param {import('./Editor.js').NodeEditor} editor
 * @param {Object<string, number[]>} [positions] - {nodeId: [x, y]}
 * @returns {string}
 */
export function editorToText(editor, positions = {}) {
  let lines = [];


  lines.push('NODES:');
  for (const node of editor.getNodes()) {
    let icon = SHAPE_ICONS[node.shape] || '□';
    let ins = Object.keys(node.inputs);
    let outs = Object.keys(node.outputs);
    let line = `[${icon} ${node.id}] ${node.label} (${node.type})`;
    if (node.shape !== 'rect') line += ` shape=${node.shape}`;
    if (node.category !== 'default') line += ` cat=${node.category}`;
    if (ins.length) line += ` in=[${ins.join(',')}]`;
    if (outs.length) line += ` out=[${outs.join(',')}]`;
    let pos = positions[node.id];
    if (pos) line += ` @${pos[0]},${pos[1]}`;
    lines.push('  ' + line);
  }


  lines.push('');
  lines.push('CONNECTIONS:');
  for (const conn of editor.getConnections()) {
    lines.push(`  ${conn.from}.${conn.out} --> ${conn.to}.${conn.in}`);
  }


  let frames = editor.getFrames();
  if (frames.length) {
    lines.push('');
    lines.push('FRAMES:');
    for (const frame of frames) {
      lines.push(
        `  [${frame.label}] color=${frame.color} x=${frame.x} y=${frame.y} w=${frame.width} h=${frame.height}`
      );
    }
  }

  return lines.join('\n');
}

/**
 * Parse text representation back into graph data structure.
 * Returns plain objects suitable for building a NodeEditor.
 *
 * @param {string} text
 * @returns {{ nodes: Array, connections: Array, frames: Array, positions: Object }}
 */
export function textToGraph(text) {
  let nodes = [];
  let connections = [];
  let frames = [];
  let positions = {};

  let section = '';
  for (const raw of text.split('\n')) {
    let line = raw.trim();
    if (!line) continue;

    if (line === 'NODES:') {
      section = 'nodes';
      continue;
    }
    if (line === 'CONNECTIONS:') {
      section = 'connections';
      continue;
    }
    if (line === 'FRAMES:') {
      section = 'frames';
      continue;
    }

    if (section === 'nodes') {

      let m = line.match(/^\[(.)\s+(\S+)\]\s+(.+?)\s+\(([^)]+)\)(.*)$/);
      if (!m) continue;

      let [, shapeIcon, id, name, type, rest] = m;
      let shape = ICON_SHAPES[shapeIcon] || 'rect';
      let category = rest.match(/cat=(\S+)/)?.[1] || 'default';
      let posMatch = rest.match(/@(-?\d+),(-?\d+)/);

      nodes.push({ id, name, type, shape, category });
      if (posMatch) {
        positions[id] = [parseInt(posMatch[1]), parseInt(posMatch[2])];
      }
    }

    if (section === 'connections') {

      let m = line.match(/^(\S+)\.(\S+)\s+-->\s+(\S+)\.(\S+)$/);
      if (!m) continue;
      let [, from, out, to, inp] = m;
      connections.push({ from, out, to, in: inp });
    }

    if (section === 'frames') {

      let m = line.match(/^\[([^\]]+)\]\s+(.*)$/);
      if (!m) continue;
      let [, label, rest] = m;
      let color = rest.match(/color=(\S+)/)?.[1] || '#4a9eff';
      let x = parseInt(rest.match(/x=(-?\d+)/)?.[1] || '0');
      let y = parseInt(rest.match(/y=(-?\d+)/)?.[1] || '0');
      let w = parseInt(rest.match(/w=(\d+)/)?.[1] || '400');
      let h = parseInt(rest.match(/h=(\d+)/)?.[1] || '300');
      frames.push({ label, color, x, y, width: w, height: h });
    }
  }

  return { nodes, connections, frames, positions };
}

/**
 * Build a NodeEditor from text representation
 *
 * @param {string} text
 * @param {import('./Editor.js').NodeEditor} editor
 * @param {{ Socket: Function, Node: Function, Input: Function, Output: Function, Connection: Function, Frame: Function }} classes
 * @returns {{ editor: import('./Editor.js').NodeEditor, positions: Object }}
 */
export function textToEditor(text, editor, classes) {
  let { Node, Connection, Socket, Input, Output, Frame } = classes;
  let { nodes, connections, frames, positions } = textToGraph(text);

  let execSocket = new Socket('exec', { color: '#ffffff' });
  let dataSocket = new Socket('data', { color: '#5cb8ff' });
  let nodeMap = new Map();


  let inPorts = {};
  let outPorts = {};
  for (const conn of connections) {
    if (!inPorts[conn.to]) inPorts[conn.to] = new Set();
    inPorts[conn.to].add(conn.in);
    if (!outPorts[conn.from]) outPorts[conn.from] = new Set();
    outPorts[conn.from].add(conn.out);
  }

  for (const n of nodes) {
    let node = new Node(n.name, {
      id: n.id,
      type: n.type,
      category: n.category,
      shape: n.shape,
    });

    let ins = inPorts[n.id] || new Set();
    let outs = outPorts[n.id] || new Set();

    for (const port of ins) {
      let isExec = port === 'exec' || port === 'trigger';
      node.addInput(port, new Input(isExec ? execSocket : dataSocket, port === 'exec' ? '' : port));
    }
    for (const port of outs) {
      let isExec = port === 'exec' || port === 'trigger';
      node.addOutput(
        port,
        new Output(isExec ? execSocket : dataSocket, port === 'exec' ? '' : port)
      );
    }

    editor.addNode(node);
    nodeMap.set(n.id, node);
  }

  for (const conn of connections) {
    let fromNode = nodeMap.get(conn.from);
    let toNode = nodeMap.get(conn.to);
    if (fromNode && toNode) {
      editor.addConnection(new Connection(fromNode, conn.out, toNode, conn.in));
    }
  }

  for (const f of frames) {
    editor.addFrame(
      new Frame(f.label, {
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        color: f.color,
      })
    );
  }

  return { editor, positions };
}

export { editorToText as default };
