import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as rootModule from '../../index.js';
import * as browserModule from '../../browser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgPath = path.resolve(__dirname, '../../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

export const packageExports = Object.entries(pkg.exports || {}).map(([key, target]) => ({
  key,
  target: typeof target === 'string' ? target : JSON.stringify(target)
}));

const rootKeys = Object.keys(rootModule);
const browserKeys = Object.keys(browserModule);
const allKeys = Array.from(new Set([...rootKeys, ...browserKeys])).sort();

export const symbolInventory = allKeys.map(name => {
  const inRoot = rootKeys.includes(name);
  const inBrowser = browserKeys.includes(name);

  let envs = [];
  if (inRoot) envs.push('root');
  if (inBrowser) envs.push('browser');
  const env = envs.join(' & ');

  let val = inRoot ? rootModule[name] : browserModule[name];
  let type = typeof val;
  if (type === 'function') {
    const str = val.toString();
    if (str.startsWith('class ') || (val.prototype && val.prototype.constructor === val && Object.getOwnPropertyNames(val.prototype).length > 1)) {
      type = 'class';
    }
  }

  return {
    name,
    type,
    env
  };
});
