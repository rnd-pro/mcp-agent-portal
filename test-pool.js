async function run() {
  const res = await fetch('http://portal.local/api/mcp-call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serverName: 'agent-pool',
      method: 'tools/call',
      params: {
        name: 'delegate_task',
        arguments: { prompt: "echo 'hello world'", approval_mode: "yolo", timeout: 10 }
      }
    })
  }).then(r => r.json());
  console.log("Delegated:", res);
}
run();
