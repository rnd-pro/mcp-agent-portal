#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignoredSegments = new Set(['.git', '.context', 'dist', 'node_modules', 'tmp']);
const ignoredRepoPrefixes = ['.agent-portal/'];
const packageSandboxDirs = new Set(['tgz', 'tmp', 'tmp-consumer-test']);

const violations = [];

function toRepoPath(absolutePath) {
  return path.relative(repoRoot, absolutePath).split(path.sep).join('/');
}

function hasIgnoredSegment(repoPath) {
  return repoPath.split('/').some((segment) => ignoredSegments.has(segment));
}

function isIgnoredRepoPath(repoPath) {
  return ignoredRepoPrefixes.some((prefix) => repoPath === prefix.slice(0, -1) || repoPath.startsWith(prefix));
}

function addViolation(rule, repoPath, detail) {
  violations.push({ rule, repoPath, detail });
}

function getGitPaths(args) {
  try {
    const output = execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
    return output.split('\0').filter(Boolean).sort();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`test:audit failed to read git paths: ${message}`);
    process.exit(2);
  }
}

function getGitOutput(args) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  } catch (error) {
    if (error && error.status === 1) return '';
    throw error;
  }
}

function isDebugTestFile(repoPath) {
  const basename = path.posix.basename(repoPath);
  return basename === 'temp_debug.js' || /^check_.*\.js$/.test(basename) || /^test_.*\.mjs$/.test(basename);
}

function auditPublicDiffHygiene() {
  const addedLineRules = [
    { rule: 'local-home-path', pattern: /\/Users\/|\/home\/[^/\s'"]+\// },
    { rule: 'private-key-marker', pattern: /BEGIN (RSA|OPENSSH|PRIVATE) KEY/ },
    { rule: 'github-token-marker', pattern: /\b(ghp_|github_pat_|xox[baprs]-|AKIA)[A-Za-z0-9_-]+/ },
    { rule: 'openai-token-marker', pattern: /\bsk-[A-Za-z0-9]{20,}/ },
  ];
  const diff = getGitOutput([
    'diff',
    '--unified=0',
    '--no-ext-diff',
    '--',
    '.',
    ':!scripts/test-hygiene-audit.js',
  ]);
  let currentPath = null;

  for (const line of diff.split('\n')) {
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (fileMatch) {
      currentPath = fileMatch[1];
      continue;
    }
    if (!currentPath || !line.startsWith('+') || line.startsWith('+++')) continue;
    for (const { rule, pattern } of addedLineRules) {
      if (pattern.test(line)) {
        addViolation(rule, currentPath, 'new diff lines must not introduce local paths or secret-looking values');
      }
    }
  }

  const untrackedPaths = getGitPaths(['ls-files', '--others', '--exclude-standard', '-z']);
  const sourceExts = new Set(['.js', '.mjs', '.cjs', '.json', '.md', '.html', '.css']);
  for (const repoPath of untrackedPaths) {
    if (repoPath === 'scripts/test-hygiene-audit.js' || isIgnoredRepoPath(repoPath) || hasIgnoredSegment(repoPath)) {
      continue;
    }
    if (!sourceExts.has(path.extname(repoPath))) continue;
    const content = readFileSync(path.join(repoRoot, repoPath), 'utf8');
    for (const { rule, pattern } of addedLineRules) {
      if (pattern.test(content)) {
        addViolation(rule, repoPath, 'new untracked files must not introduce local paths or secret-looking values');
      }
    }
  }
}

function auditTrackedPaths() {
  const trackedPaths = getGitPaths(['ls-files', '-z']);

  for (const repoPath of trackedPaths) {
    if (isIgnoredRepoPath(repoPath)) {
      continue;
    }

    if (isDebugTestFile(repoPath) && !hasIgnoredSegment(repoPath)) {
      addViolation('debug-test-file', repoPath, 'debug/check/test helper file is tracked outside allowed scratch dirs');
    }

    if (repoPath === 'tests/tmp-consumer-test' || repoPath.startsWith('tests/tmp-consumer-test/')) {
      addViolation('tracked-tmp-consumer-test', repoPath, 'tests/tmp-consumer-test must not be tracked');
    }
  }
}

function auditUntrackedPermanentTests() {
  const untrackedPaths = getGitPaths(['ls-files', '--others', '--exclude-standard', '-z']);
  for (const repoPath of untrackedPaths) {
    if (/^test\/(unit|integration)\/.+\.test\.js$/.test(repoPath)) {
      addViolation('untracked-permanent-test', repoPath, 'permanent tests must be tracked or moved to ignored tmp');
    }
  }
}

function auditScriptEntrypoints() {
  const packageJsonPath = path.join(repoRoot, 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  } catch (error) {
    addViolation('package-json-parse', 'package.json', 'package.json must be valid JSON for script audit');
    return;
  }

  const scripts = pkg.scripts || {};
  const scriptPathPattern = /\b(?:node|tsx|ts-node)\s+([^\s;&|]+)/g;
  for (const [scriptName, command] of Object.entries(scripts)) {
    for (const match of command.matchAll(scriptPathPattern)) {
      const scriptPath = match[1].replace(/^['"]|['"]$/g, '');
      if (!scriptPath.startsWith('scripts/')) continue;
      const absolutePath = path.join(repoRoot, scriptPath);
      try {
        readFileSync(absolutePath);
      } catch (error) {
        addViolation('missing-script-entrypoint', 'package.json', `${scriptName} points to missing ${scriptPath}`);
        continue;
      }

      const tracked = getGitPaths(['ls-files', '-z', '--', scriptPath]);
      if (tracked.length === 0) {
        addViolation('untracked-script-entrypoint', scriptPath, `${scriptName} points to an untracked script`);
      }
    }
  }
}

function walk(directory, onEntry) {
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const repoPath = toRepoPath(absolutePath);

    if (isIgnoredRepoPath(repoPath)) {
      continue;
    }

    onEntry(entry, absolutePath, repoPath);

    if (entry.isDirectory() && !ignoredSegments.has(entry.name)) {
      walk(absolutePath, onEntry);
    }
  }
}

function auditWorkingTreeDebugFiles() {
  walk(repoRoot, (entry, _absolutePath, repoPath) => {
    if (entry.isFile() && isDebugTestFile(repoPath) && !hasIgnoredSegment(repoPath)) {
      addViolation('debug-test-file', repoPath, 'debug/check/test helper file exists outside allowed scratch dirs');
    }
  });
}

function auditPackageSandboxes() {
  const packagesRoot = path.join(repoRoot, 'packages');
  let packageEntries;

  try {
    packageEntries = readdirSync(packagesRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  for (const packageEntry of packageEntries) {
    if (!packageEntry.isDirectory()) {
      continue;
    }

    const packagePath = path.join(packagesRoot, packageEntry.name);

    walk(packagePath, (entry, _absolutePath, repoPath) => {
      if (entry.isDirectory() && packageSandboxDirs.has(entry.name)) {
        addViolation('package-sandbox-dir', repoPath, 'package sandbox directories named tgz/tmp/tmp-consumer-test must not exist');
      }

      if (entry.isFile() && repoPath.endsWith('.tgz')) {
        addViolation('package-tgz-artifact', repoPath, 'package tarball artifacts must not exist in package directories');
      }
    });
  }
}

function auditSymbioteConsumerImports() {
  const scanRoots = ['web', 'src', 'demo', 'scripts', 'test']
    .map((root) => path.join(repoRoot, root));
  const sourceExts = new Set(['.js', '.mjs', '.cjs']);
  const forbiddenRelativeImport = /(?:\.\.\/)+packages\/symbiote-node\//;

  for (const root of scanRoots) {
    try {
      readdirSync(root);
    } catch (error) {
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }

    walk(root, (entry, absolutePath, repoPath) => {
      if (!entry.isFile() || !sourceExts.has(path.extname(entry.name))) return;
      let content = readFileSync(absolutePath, 'utf8');
      if (forbiddenRelativeImport.test(content)) {
        addViolation(
          'symbiote-relative-import',
          repoPath,
          'consumer code must import symbiote-node through public package subpaths, not relative packages/symbiote-node paths',
        );
      }
    });
  }
}

function auditSymbioteImportMaps() {
	  const requiredImportMapEntries = [
	    '"symbiote-node":',
	    '"symbiote-node/core":',
	    '"symbiote-node/core/base-path.js":',
	    '"symbiote-node/ui":',
	    '"symbiote-node/graph":',
	    '"symbiote-node/layout":',
	    '"symbiote-node/chat/chat-context.js":',
	    '"symbiote-node/display/highlight":',
	    '"symbiote-node/display/markdown-formatter":',
	    '"symbiote-node/display/format-utils":',
	    '"symbiote-node/display/icons":',
	    '"symbiote-node/display/event-feed-adapter":',
	  ];

  const importMapFiles = [
    'web/index.html',
    'demo/index.html',
    'demo/build.js',
  ];

  for (const repoPath of importMapFiles) {
    const absolutePath = path.join(repoRoot, repoPath);
    let content;
    try {
      content = readFileSync(absolutePath, 'utf8');
    } catch (error) {
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }

	    for (const entry of requiredImportMapEntries) {
	      if (!content.includes(entry)) {
	        addViolation(
	          'symbiote-importmap-entry',
	          repoPath,
	          `browser import maps must include exact package-export-shaped ${entry} mapping`,
	        );
	      }
	    }
	    if (content.includes('"symbiote-node/":')) {
	      addViolation(
	        'symbiote-importmap-prefix',
	        repoPath,
	        'browser import maps must not include a broad symbiote-node/ prefix fallback',
	      );
	    }
	  }
	}

auditTrackedPaths();
auditUntrackedPermanentTests();
auditScriptEntrypoints();
auditWorkingTreeDebugFiles();
auditPackageSandboxes();
auditSymbioteConsumerImports();
auditSymbioteImportMaps();
auditPublicDiffHygiene();

const uniqueViolations = [...new Map(
  violations.map((violation) => [`${violation.rule}:${violation.repoPath}`, violation]),
).values()].sort((a, b) => {
  const pathOrder = a.repoPath.localeCompare(b.repoPath);
  return pathOrder || a.rule.localeCompare(b.rule);
});

if (uniqueViolations.length === 0) {
  console.log('test:audit passed: no tracked/temp test hygiene violations found.');
  process.exit(0);
}

console.error(`test:audit failed: found ${uniqueViolations.length} test hygiene violation(s).`);
for (const violation of uniqueViolations) {
  console.error(`- ${violation.repoPath} [${violation.rule}] ${violation.detail}`);
}
process.exit(1);
