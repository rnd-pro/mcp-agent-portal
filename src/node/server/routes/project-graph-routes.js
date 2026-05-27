import { promises as fs } from 'node:fs';
import path from 'node:path';
import { validateProjectGraphMetadata } from 'symbiote-node/graph';
import { json, parseBody } from './http.js';

function getProjectGraphMetadataPath(root) {
  return path.join(path.resolve(root), '.portal', 'project-graph.json');
}

function resolveProjectGraphMetadataRoot(projectRoot, requestedRoot) {
  let baseRoot = path.resolve(projectRoot);
  let root = !requestedRoot || requestedRoot === '.' ? baseRoot : path.resolve(requestedRoot);
  if (root !== baseRoot) {
    throw new Error('Invalid project graph metadata path: projectPath must match the portal project root');
  }
  return baseRoot;
}

async function writeJsonAtomic(filePath, data) {
  let dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  let tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

/**
 * @param {{ projectRoot: string }} ctx
 * @returns {Record<string, (req: any, res: any) => Promise<void>>}
 */
export function createProjectGraphRoutes(ctx) {
  let { projectRoot } = ctx;

  return {
    'GET /api/project-graph-metadata': async (req, res) => {
      try {
        let url = new URL(req.url, 'http://localhost');
        let requestedRoot = resolveProjectGraphMetadataRoot(
          projectRoot,
          url.searchParams.get('projectPath') || url.searchParams.get('path'),
        );
        let sidecarPath = getProjectGraphMetadataPath(requestedRoot);
        let text;
        try {
          text = await fs.readFile(sidecarPath, 'utf8');
        } catch (err) {
          if (err.code === 'ENOENT') {
            json(res, { ok: true, found: false, path: sidecarPath, metadata: { version: 1 } });
            return;
          }
          throw err;
        }
        let metadata = validateProjectGraphMetadata(JSON.parse(text));
        json(res, { ok: true, found: true, path: sidecarPath, metadata });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/project-graph-metadata': async (req, res) => {
      try {
        let body = await parseBody(req, 2 * 1024 * 1024);
        let requestedRoot = resolveProjectGraphMetadataRoot(projectRoot, body.projectPath || body.path);
        let metadata = validateProjectGraphMetadata(body.metadata || body);
        let sidecarPath = getProjectGraphMetadataPath(requestedRoot);
        await writeJsonAtomic(sidecarPath, metadata);
        json(res, { ok: true, path: sidecarPath, metadata });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },
  };
}
