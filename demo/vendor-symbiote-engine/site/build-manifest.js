import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const siteDir = path.resolve('_site');

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory()) {
      walk(path.join(dir, file), fileList);
    } else {
      fileList.push(path.join(dir, file));
    }
  }
  return fileList;
}

const allFiles = walk(siteDir);
const manifest = {};

for (const file of allFiles) {
  const relPath = path.relative(siteDir, file).replace(/\\/g, '/');
  if (relPath === 'manifest.json') continue;

  const content = fs.readFileSync(file);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const size = content.length;

  manifest[relPath] = { size, sha256: hash };
}

const sortedKeys = Object.keys(manifest).sort();
const sortedManifest = {};
for (const key of sortedKeys) {
  sortedManifest[key] = manifest[key];
}

fs.writeFileSync(
  path.join(siteDir, 'manifest.json'),
  JSON.stringify(sortedManifest, null, 2)
);
