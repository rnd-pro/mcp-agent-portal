import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseAgent } from '../../src/node/agents/agent-parser.js';

const TEST_CWD = path.join(os.tmpdir(), `portal-agent-parser-${Date.now()}`);

describe('portal agent parser', () => {
  after(() => {
    fs.rmSync(TEST_CWD, { recursive: true, force: true });
  });

  it('uses shared frontmatter parsing for multiline arrays and scalar casts', () => {
    const agentsDir = path.join(TEST_CWD, '.agent-portal', 'agents');
    const skillsDir = path.join(TEST_CWD, '.agent-portal', 'skills');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.mkdirSync(skillsDir, { recursive: true });

    const agentPath = path.join(agentsDir, 'reviewer.md');
    fs.writeFileSync(agentPath, `---
name: reviewer
role: orchestrator
resource_group: deepseek-pro-audit
models:
  - deepseek/deepseek-v4-pro
visibleAgents:
  - backend-engineer
  - code-reviewer
---
Agent body`);

    const agent = parseAgent(agentPath, skillsDir);

    assert.equal(agent.slug, 'reviewer');
    assert.equal(agent.resourceGroup, 'deepseek-pro-audit');
    assert.deepStrictEqual(agent.models, ['deepseek/deepseek-v4-pro']);
    assert.deepStrictEqual(agent.visibleAgents, ['backend-engineer', 'code-reviewer']);
    assert.equal('maxConcurrent' in agent, false);
    assert.equal('timeout' in agent, false);
    assert.equal('approvalMode' in agent, false);
    assert.equal('policy' in agent, false);
  });
});
