import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NodeEditor } from '../core/Editor.js';
import { Node } from '../core/Node.js';
import { Connection } from '../core/Connection.js';
import { Socket, Output, Input } from '../core/Socket.js';
import { createForceLayoutAdapter } from '../xr/force-layout-adapter.js';

test('createForceLayoutAdapter initializes simulation and syncs positions to editor nodes', () => {
  const editor = new NodeEditor();
  const socket = new Socket('test');

  const n1 = new Node('Source', { id: 'n1' });
  const n2 = new Node('Target', { id: 'n2' });

  n1.addOutput('out', new Output(socket, 'out'));
  n2.addInput('in', new Input(socket, 'in'));

  editor.addNode(n1);
  editor.addNode(n2);

  const conn = new Connection(n1, 'out', n2, 'in');
  editor.addConnection(conn);

  const adapter = createForceLayoutAdapter(editor, { distance: 2 });
  assert.equal(adapter.getNodes().length, 2);
  assert.equal(adapter.getLinks().length, 1);

  // Tick the layout
  adapter.tick();

  // Coordinates should be synced to editor Nodes
  assert.ok(typeof n1.x === 'number');
  assert.ok(typeof n2.x === 'number');
  assert.ok(typeof n1.y === 'number');
  assert.ok(typeof n2.z === 'number');
});
