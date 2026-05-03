async function run() {
  const delegated = await fetch('http://portal.local/api/mcp-call', {
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
  
  const taskId = delegated.content[0].text.match(/`([0-9a-f-]{36})/)[1];
  console.log("Delegated task:", taskId);

  // Poll
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const res = await fetch('http://portal.local/api/mcp-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverName: 'agent-pool',
        method: 'tools/call',
        params: { name: 'get_task_result', arguments: { task_id: taskId } }
      })
    }).then(r => r.json());
    console.log(`Poll ${i}:\n`, res.content?.[0]?.text?.substring(0, 200));
    if (res.content?.[0]?.text?.includes('## Stats')) {
      console.log("FULL RES:", res.content?.[0]?.text);
      break;
    }
  }
}
run();
