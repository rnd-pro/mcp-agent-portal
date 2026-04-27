// @ctx adapters-base.ctx
/**
 * @typedef {object} AdapterInstance
 * @property {string} type - adapter type ('gemini', 'claude', etc.)
 * @property {boolean} busy - is currently executing
 * @property {(opts: RunOpts) => Promise<RunResult>} run - execute a prompt
 * @property {() => void} destroy - cleanup resources
 */

/**
 * @typedef {object} RunOpts
 * @property {string} prompt
 * @property {string} [cwd]
 * @property {string} [model]
 * @property {number} [timeout] - seconds
 */

/**
 * @typedef {object} RunResult
 * @property {string} response - assistant reply text
 * @property {number|null} exitCode
 * @property {string[]} errors
 * @property {number} totalEvents
 */
