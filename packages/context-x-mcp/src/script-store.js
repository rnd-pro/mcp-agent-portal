import { writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPTS_DIR = '.agents/scripts';

function getScriptsDir(cwd) {
  return join(cwd, SCRIPTS_DIR);
}

export function saveScript(cwd, name, code, ext = 'js') {
  const dir = getScriptsDir(cwd);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const fileName = `${name}.${ext.replace(/^\./, '')}`;
  const filePath = join(dir, fileName);

  writeFileSync(filePath, code, 'utf-8');
  return join(SCRIPTS_DIR, fileName);
}

export function listScripts(cwd) {
  const dir = getScriptsDir(cwd);
  if (!existsSync(dir)) {
    return [];
  }

  const files = readdirSync(dir);
  return files.map((file) => {
    const fullPath = join(dir, file);
    let size = 0;
    try {
      size = Buffer.byteLength(readFileSync(fullPath, 'utf-8'));
    } catch {}

    const parts = file.split('.');
    const ext = parts.length > 1 ? parts.pop() : '';
    const scriptName = parts.join('.');

    return {
      name: scriptName,
      ext,
      size,
      path: join(SCRIPTS_DIR, file)
    };
  });
}
