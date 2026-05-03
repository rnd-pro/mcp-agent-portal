import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';

const FLYWHEEL_PATH = process.env.PORTAL_FLYWHEEL_PATH || path.join(os.homedir(), '.agent-portal', 'flywheel-dataset.jsonl');
const COMPRESSED_PATH = path.join(os.homedir(), '.agent-portal', 'compressed-trajectories.jsonl');

/**
 * Compresses a sequence of tool calls.
 * Protects the head (first 2) and tail (last 2) tool calls.
 * Summarizes the middle calls by keeping only the tool name and discarding large result summaries.
 */
function compressTrajectoryBlock(block, outcome, skillCreated) {
  if (block.length === 0) return null;
  
  const headSize = 2;
  const tailSize = 2;
  
  let compressed = [];
  
  if (block.length <= headSize + tailSize) {
    compressed = block;
  } else {
    const head = block.slice(0, headSize);
    const tail = block.slice(block.length - tailSize);
    const middle = block.slice(headSize, block.length - tailSize);
    
    // Summarize middle
    const summarizedMiddle = {
      type: 'summary',
      summarized_steps: middle.length,
      tools_used: middle.map(m => m.tool),
      note: 'Middle steps compressed to save context.'
    };
    
    compressed = [...head, summarizedMiddle, ...tail];
  }

  return {
    trajectory: compressed,
    outcome: outcome || 'unknown',
    skill_created: skillCreated || null,
    total_steps_original: block.length,
    timestamp: block[0].timestamp
  };
}

export async function compressTrajectories() {
  if (!fs.existsSync(FLYWHEEL_PATH)) {
    console.log('[TrajectoryCompressor] No flywheel dataset found.');
    return;
  }

  const fileStream = fs.createReadStream(FLYWHEEL_PATH);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let currentBlock = [];
  const processedTrajectories = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      
      if (entry.type === 'feedback') {
        // End of a trajectory block
        if (currentBlock.length > 0) {
          const compressed = compressTrajectoryBlock(currentBlock, entry.outcome, entry.skill_created);
          if (compressed) processedTrajectories.push(compressed);
          currentBlock = [];
        }
      } else {
        // Normal tool call
        currentBlock.push(entry);
      }
    } catch (e) {
      console.error('[TrajectoryCompressor] Failed to parse line:', e.message);
    }
  }

  // If there's an unfinished block at the end
  if (currentBlock.length > 0) {
    const compressed = compressTrajectoryBlock(currentBlock, 'unknown', null);
    if (compressed) processedTrajectories.push(compressed);
  }

  // Write out the compressed trajectories
  const dir = path.dirname(COMPRESSED_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const outLines = processedTrajectories.map(t => JSON.stringify(t)).join('\n');
  fs.writeFileSync(COMPRESSED_PATH, outLines + '\n', 'utf-8');
  console.log(`[TrajectoryCompressor] Processed ${processedTrajectories.length} trajectories. Saved to ${COMPRESSED_PATH}`);
}

// Allow running directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  compressTrajectories().catch(console.error);
}
