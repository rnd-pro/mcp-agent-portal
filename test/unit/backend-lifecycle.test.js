import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('backend lifecycle', () => {
  it('writes the installed package version to backend port files', async () => {
    let tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-backend-home-'));
    let tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-backend-project-'));
    let originalHome = process.env.HOME;
    process.env.HOME = tmpHome;

    try {
      let mod = await import(`../../src/node/server/backend-lifecycle.js?test=${Date.now()}`);
      mod.writePortFile(tmpProject, 12345);

      let hash = createHash('md5').update(path.resolve(tmpProject)).digest('hex').slice(0, 8);
      let portFile = path.join(tmpHome, '.local-gateway', 'backends', `portal-${hash}.json`);
      let data = JSON.parse(fs.readFileSync(portFile, 'utf8'));
      let pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
      let projectName = path.basename(tmpProject);

      assert.equal(data.version, pkg.version);
      assert.notEqual(data.version, '0.0.0');
      assert.equal(data.name, projectName);
      assert.equal(data.projectName, projectName);
      mod.removePortFile(tmpProject);
    } finally {
      process.env.HOME = originalHome;
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });
});
