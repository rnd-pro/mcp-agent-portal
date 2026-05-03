async function run() {
  const res = await fetch('http://portal.local/api/mcp-call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serverName: 'agent-pool',
      method: 'tools/call',
      params: {
        name: 'get_task_result',
        arguments: { task_id: '0b3c79b6-a17d-4a5b-953c-2d8235c38c29' }
      }
    })
  }).then(r => r.json());
  console.log("Result:\n", res.content?.[0]?.text);
}
run();
