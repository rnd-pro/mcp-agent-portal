import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Executes a git command in the specified directory.
 * @param {string} cwd - The directory to run the command in.
 * @param {string} command - The git command to execute (e.g. 'git status').
 * @returns {string} The stdout of the command.
 */
function runGit(cwd, command) {
  try {
    return execSync(command, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    throw new Error(`Git command failed: ${command}\\n${err.message}\\n${err.stderr || ''}`);
  }
}

/**
 * Verifies if a directory is a valid git repository.
 * @param {string} repoPath 
 * @returns {boolean}
 */
export function isGitRepo(repoPath) {
  const absPath = resolve(repoPath);
  if (!existsSync(absPath)) return false;
  try {
    runGit(absPath, 'git rev-parse --is-inside-work-tree');
    return true;
  } catch {
    return false;
  }
}

/**
 * Pulls the latest changes from the remote repository.
 * @param {string} repoPath 
 * @returns {object} Status of the pull operation.
 */
export function syncMemory(repoPath) {
  const absPath = resolve(repoPath);
  if (!isGitRepo(absPath)) {
    throw new Error(`Path is not a valid git repository: ${absPath}`);
  }

  try {
    const output = runGit(absPath, 'git pull --rebase');
    return { success: true, message: 'Synced successfully', output };
  } catch (err) {
    return { success: false, message: 'Failed to pull', error: err.message };
  }
}

/**
 * Commits all local changes and pushes them to the remote repository.
 * @param {string} repoPath 
 * @param {string} message - Commit message.
 * @returns {object} Status of the push operation.
 */
export function saveAndPush(repoPath, message) {
  const absPath = resolve(repoPath);
  if (!isGitRepo(absPath)) {
    throw new Error(`Path is not a valid git repository: ${absPath}`);
  }

  try {
    // Check if there are changes
    const status = runGit(absPath, 'git status --porcelain');
    if (!status) {
      return { success: true, message: 'No changes to save', committed: false };
    }

    runGit(absPath, 'git add .');
    runGit(absPath, `git commit -m "${message.replace(/"/g, '\\"')}"`);
    const output = runGit(absPath, 'git push');
    
    return { success: true, message: 'Saved and pushed successfully', committed: true, output };
  } catch (err) {
    return { success: false, message: 'Failed to save or push', error: err.message };
  }
}
