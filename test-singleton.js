import { spawn } from 'child_process';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

let HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
let LOCAL_GATEWAY_DIR = join(HOME, '.local-gateway', 'backends');

console.log('1. Spawning Portal (IDE Simulation)...');

let p = spawn('node', ['index.js'], { stdio: ['pipe', 'pipe', 'inherit'] });

let initReady = false;

p.stdout.on('data', (d) => {
  let str = d.toString();
  if (str.includes('notifications/tools/list_changed') && !initReady) {
    console.log('Received list_changed. Waiting 3s for servers to fully load tools...');
    initReady = true;
    setTimeout(() => {
      console.log('\n2. Testing tools/list...');
      p.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list'
      }) + '\n');
    }, 3000);
  } else if (initReady) {
    try {
      let msg = JSON.parse(str);
      if (msg.id === 1 && msg.result && msg.result.tools) {
        console.log(`✅ Success: Received ${msg.result.tools.length} tools!`);
        console.log('Sample tools:', msg.result.tools.slice(0, 5).map(t => t.name));
        
        console.log('\n3. Checking local-gateway port files...');
        let files = readdirSync(LOCAL_GATEWAY_DIR);
        console.log('Registry files:', files);
        
        console.log('\n4. Exiting IDE simulation...');
        p.kill();
        process.exit(0);
      }
    } catch(e) {}
  }
});

setTimeout(() => {
  console.log('Timeout!');
  p.kill();
  process.exit(1);
}, 10000);
