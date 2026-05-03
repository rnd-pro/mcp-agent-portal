import { runOpencodeStreaming } from './packages/agent-pool-mcp/src/runner/opencode-runner.js';
async function test() {
  const res = await runOpencodeStreaming({ prompt: "echo 'hello'", model: "opencode/gpt-5-nano", timeout: 10 });
  console.log("STATS:", res.stats);
}
test().catch(console.error);
