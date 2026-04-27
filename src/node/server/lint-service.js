// @ctx lint-service.ctx
import path from 'node:path';

let eslintInstance = null;
let eslintAvailable = null;

/**
 * Lazy-load ESLint (devDependency — may not be installed in production).
 * @param {string} projectRoot
 * @returns {object|null}
 */
async function getEslint(projectRoot) {
  if (eslintAvailable === false) return null;
  if (eslintInstance) return eslintInstance;

  try {
    let { ESLint } = await import('eslint');
    eslintInstance = new ESLint({
      cwd: projectRoot,
      overrideConfigFile: path.join(projectRoot, 'eslint.config.js'),
    });
    eslintAvailable = true;
    return eslintInstance;
  } catch {
    eslintAvailable = false;
    console.error('🟡 [lint] ESLint not available — install with: npm i -D eslint');
    return null;
  }
}

/**
 * Lint a single file and return structured diagnostics.
 * @param {string} filePath — absolute path to file
 * @returns {Promise<object[]>} array of result objects with messages
 */
export async function lintFile(filePath) {
  let projectRoot = process.cwd();
  let eslint = await getEslint(projectRoot);
  if (!eslint) {
    return [{ filePath, messages: [], errorCount: 0, warningCount: 0, unavailable: true }];
  }

  // Resolve relative paths against project root
  let absPath = path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);

  try {
    let results = await eslint.lintFiles([absPath]);
    return results.map((r) => ({
      filePath: r.filePath,
      messages: r.messages.map((m) => ({
        line: m.line,
        column: m.column,
        endLine: m.endLine,
        endColumn: m.endColumn,
        severity: m.severity, // 1=warn, 2=error
        message: m.message,
        ruleId: m.ruleId,
      })),
      errorCount: r.errorCount,
      warningCount: r.warningCount,
    }));
  } catch (err) {
    console.error(`🟡 [lint] Error linting ${filePath}:`, err.message);
    return [{ filePath: absPath, messages: [], errorCount: 0, warningCount: 0, error: err.message }];
  }
}

export default lintFile;
