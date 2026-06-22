import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

let repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let webRoot = path.join(repoRoot, 'web');
let distRoot = path.join(repoRoot, 'dist', 'web');

// app.js is the dashboard entry. It is content-hashed so it can be served with a
// long-lived immutable Cache-Control; the served index.html is rewritten to point
// at the hashed name. The XR pages are standalone diagnostic entries whose HTML
// references fixed filenames, so they keep stable (unhashed) output names.
let appEntry = 'app.js';
let xrEntryPoints = [
  'xr-diagnostics.js',
  'xr-visual-audit.js',
  'xr-panels-baseline.js',
  'xr-three-panels-baseline.js',
  'xr-htmltexture-minimal.js',
];

let sharedBuildOptions = {
  absWorkingDir: webRoot,
  bundle: true,
  format: 'esm',
  legalComments: 'none',
  logLevel: 'info',
  minify: true,
  outdir: distRoot,
  platform: 'browser',
  sourcemap: false,
  splitting: false,
  target: ['chrome120'],
};

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

function resolveEntryOutput(metafile, entryName) {
  for (let [outputPath, meta] of Object.entries(metafile.outputs)) {
    if (meta.entryPoint === entryName) {
      return path.basename(outputPath);
    }
  }
  throw new Error(`Could not resolve hashed output for entry "${entryName}"`);
}

async function rewriteIndexHtml(hashedAppName) {
  let indexPath = path.join(distRoot, 'index.html');
  let html = await readFile(indexPath, 'utf8');
  let next = html.replace(/src="app\.js(?:\?[^"]*)?"/, `src="${hashedAppName}"`);
  if (next === html) {
    throw new Error('Failed to rewrite app.js script reference in dist index.html');
  }
  await writeFile(indexPath, next);
}

// Precompress text assets at build time so the server can serve brotli/gzip with
// no runtime cost, negotiated via Accept-Encoding.
async function precompressAssets(dir = distRoot) {
  let entries = await readdir(dir, { withFileTypes: true });
  for (let entry of entries) {
    let fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await precompressAssets(fullPath);
      continue;
    }
    if (!entry.name.endsWith('.js') && !entry.name.endsWith('.css')) {
      continue;
    }
    let buffer = await readFile(fullPath);
    await writeFile(`${fullPath}.gz`, gzipSync(buffer, { level: 9 }));
    await writeFile(`${fullPath}.br`, brotliCompressSync(buffer, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
        [zlibConstants.BROTLI_PARAM_SIZE_HINT]: buffer.length,
      },
    }));
  }
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

async function writeBuildManifest({ hashedApp }) {
  let manifest = {
    format: 'agent-portal-web-build-v1',
    target: 'chrome120',
    entryPoints: [appEntry, ...xrEntryPoints],
    hashedApp,
    outputs: await collectFiles(distRoot),
    builtAt: new Date().toISOString(),
  };
  await writeFile(
    path.join(distRoot, 'build-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

await rm(distRoot, { recursive: true, force: true });
await copyStaticFiles();

let appResult = await esbuild.build({
  ...sharedBuildOptions,
  entryNames: '[dir]/[name]-[hash]',
  chunkNames: '[dir]/[name]-[hash]',
  entryPoints: [appEntry],
  metafile: true,
});
let hashedApp = resolveEntryOutput(appResult.metafile, appEntry);

await esbuild.build({
  ...sharedBuildOptions,
  entryNames: '[dir]/[name]',
  entryPoints: xrEntryPoints,
});

await rewriteIndexHtml(hashedApp);
await precompressAssets();
await writeBuildManifest({ hashedApp });
