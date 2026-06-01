import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

let repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let webRoot = path.join(repoRoot, 'web');
let distRoot = path.join(repoRoot, 'dist', 'web');

let entryPoints = [
  'app.js',
  'xr-diagnostics.js',
  'xr-visual-audit.js',
  'xr-panels-baseline.js',
  'xr-three-panels-baseline.js',
  'xr-htmltexture-minimal.js',
];

async function copyStaticFiles(sourceDir = webRoot, targetDir = distRoot) {
  await mkdir(targetDir, { recursive: true });
  let entries = await readdir(sourceDir, { withFileTypes: true });
  for (let entry of entries) {
    let sourcePath = path.join(sourceDir, entry.name);
    let targetPath = path.join(targetDir, entry.name);
    if (entry.name.startsWith('.')) {
      continue;
    }
    if (entry.isDirectory()) {
      await copyStaticFiles(sourcePath, targetPath);
      continue;
    }
    if (entry.name.endsWith('.js') || entry.name.endsWith('.ctx') || entry.name.endsWith('.ctx.md')) {
      continue;
    }
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, await readFile(sourcePath));
  }
}

async function writeBuildManifest(result) {
  let outputs = result.outputFiles ? [] : await collectFiles(distRoot);
  let manifest = {
    format: 'agent-portal-web-build-v1',
    target: 'chrome120',
    entryPoints,
    outputs,
    builtAt: new Date().toISOString(),
  };
  await writeFile(
    path.join(distRoot, 'build-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

async function collectFiles(dir, base = dir) {
  let files = [];
  let entries = await readdir(dir, { withFileTypes: true });
  for (let entry of entries) {
    let fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath, base));
      continue;
    }
    let fileStat = await stat(fullPath);
    files.push({
      path: path.relative(base, fullPath).replaceAll(path.sep, '/'),
      bytes: fileStat.size,
    });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

await rm(distRoot, { recursive: true, force: true });
await copyStaticFiles();

let result = await esbuild.build({
  absWorkingDir: webRoot,
  bundle: true,
  entryNames: '[dir]/[name]',
  entryPoints,
  format: 'esm',
  legalComments: 'none',
  logLevel: 'info',
  minify: true,
  outdir: distRoot,
  platform: 'browser',
  sourcemap: false,
  splitting: false,
  target: ['chrome120'],
});

await writeBuildManifest(result);
