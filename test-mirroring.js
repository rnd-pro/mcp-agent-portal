import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

console.log('1. Spawning Portal (IDE Simulation)...');
let p = spawn('node', ['index.js'], { stdio: ['pipe', 'pipe', 'inherit'] });

let initReady = false;
let chatId = null;
let testPassed = false;

p.stdout.on('data', (d) => {
  let str = d.toString();
  if (str.includes('notifications/tools/list_changed') && !initReady) {
    initReady = true;
    setTimeout(() => {
      console.log('\n2. Calling create_chat...');
      p.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'create_chat',
          arguments: { name: 'Auto MCP Chat' }
        }
      }) + '\n');
    }, 2000);
  } else if (initReady) {
    try {
      let msg = JSON.parse(str);
      if (msg.id === 1) {
        let text = msg.result.content[0].text;
        chatId = text.split('ID: ')[1];
        console.log('✅ Chat created with ID:', chatId);
        console.log('\n3. Calling send_chat_message...');
        p.stdin.write(JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'send_chat_message',
            arguments: { chatId, text: 'Hello from MCP client!', role: 'agent' }
          }
        }) + '\n');
      } else if (msg.id === 2) {
        console.log('✅ Message sent:', msg.result.content[0].text);
        testPassed = true;
        setTimeout(() => {
          console.log('\n4. Exiting IDE simulation...');
          p.kill();
          process.exit(0);
        }, 1000);
      }
    } catch(e) {}
  }
});

setTimeout(() => {
  if (!testPassed) {
    console.log('Timeout!');
    p.kill();
    process.exit(1);
  }
}, 10000);
