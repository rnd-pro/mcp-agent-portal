import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const FLYWHEEL_PATH = process.env.PORTAL_FLYWHEEL_PATH || path.join(os.homedir(), '.agent-portal', 'flywheel-dataset.jsonl');

/**
 * Appends a tool execution record to the MLOps Data Flywheel dataset.
 * 
 * @param {string} serverName The MCP server that executed the tool
 * @param {string} method The MCP method (e.g. 'tools/call')
 * @param {object} params The request parameters (e.g. { name, arguments })
 * @param {any} result The successful result object
 * @param {number} durationMs Execution duration in milliseconds
 */
export function logTrajectory(serverName, method, params, result, durationMs) {
  // Only log tools/call for the flywheel dataset to train models on tool usage
  if (method !== 'tools/call') return;
  // Ignore agent-pool's own delegation wrappers, focus on actual work tools
  if (serverName === 'agent-pool') return;
  // Ignore purely conversational / chat sends if they leak into tools
  if (params?.name === 'send_message') return;

  try {
    const dir = path.dirname(FLYWHEEL_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const entry = {
      timestamp: new Date().toISOString(),
      server: serverName,
      tool: params?.name || 'unknown',
      args: params?.arguments || {},
      result_summary: extractResultText(result),
      duration_ms: durationMs
    };

    // Append atomically to the JSONL file
    fs.appendFile(FLYWHEEL_PATH, JSON.stringify(entry) + '\n', (err) => {
      if (err) console.error('[Flywheel] Failed to log trajectory:', err.message);
    });
  } catch (err) {
    console.error('[Flywheel] Error logging trajectory:', err.message);
  }
}

function extractResultText(result) {
  if (result && Array.isArray(result.content)) {
    // Truncate very long texts to avoid gigabyte-sized jsonl files
    const fullText = result.content.map(c => c.text).join('\n');
    if (fullText.length > 5000) {
      return fullText.substring(0, 5000) + '... [TRUNCATED]';
    }
    return fullText;
  }
  return String(result);
}

/**
 * Appends a feedback entry indicating the end of a trajectory and its outcome.
 * 
 * @param {string} outcome 'success', 'partial', or 'failed'
 * @param {string|null} skillCreated Name of the skill created, or null
 */
export function logFeedback(outcome, skillCreated = null) {
  try {
    const dir = path.dirname(FLYWHEEL_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const entry = {
      timestamp: new Date().toISOString(),
      type: 'feedback',
      outcome: outcome,
      skill_created: skillCreated
    };

    fs.appendFile(FLYWHEEL_PATH, JSON.stringify(entry) + '\n', (err) => {
      if (err) console.error('[Flywheel] Failed to log feedback:', err.message);
    });
  } catch (err) {
    console.error('[Flywheel] Error logging feedback:', err.message);
  }
}

/**
 * Returns basic telemetry stats from the dataset.
 */
export function getFlywheelStats() {
  let stats = {
    total_calls: 0,
    feedbacks: 0,
    successes: 0,
    failures: 0,
    skills_created: 0,
    avg_duration_ms: 0,
    last_updated: null
  };
  
  if (!fs.existsSync(FLYWHEEL_PATH)) return stats;
  
  try {
    const lines = fs.readFileSync(FLYWHEEL_PATH, 'utf8').split('\n').filter(Boolean);
    let totalDuration = 0;
    let callCount = 0;
    
    for (let line of lines) {
      try {
        let entry = JSON.parse(line);
        if (entry.type === 'feedback') {
          stats.feedbacks++;
          if (entry.outcome === 'success') stats.successes++;
          if (entry.outcome === 'failed') stats.failures++;
          if (entry.skill_created) stats.skills_created++;
        } else {
          stats.total_calls++;
          callCount++;
          if (entry.duration_ms) totalDuration += entry.duration_ms;
        }
        stats.last_updated = entry.timestamp;
      } catch (e) {
        console.warn('[Flywheel] Skipped malformed JSON line in dataset.');
      }
    }
    
    if (callCount > 0) {
      stats.avg_duration_ms = Math.round(totalDuration / callCount);
    }
    
  } catch (err) {
    console.error('[Flywheel] Error reading stats:', err.message);
  }
  
  return stats;
}
