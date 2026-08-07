import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const MIME_EXTENSIONS = Object.freeze({
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'application/json': 'json',
});

function cleanString(value, fallback = '') {
  let text = String(value ?? fallback ?? '').replace(/\s+/g, ' ').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : String(fallback || '').trim();
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function extensionForMime(mimeType) {
  return MIME_EXTENSIONS[mimeType] || 'bin';
}

function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function refFromHash(hash) {
  return `sha256:${hash}`;
}

function hashFromRef(artifactId) {
  let id = cleanString(artifactId, '');
  if (!id.startsWith('sha256:')) throw new Error('artifactId must start with "sha256:"');
  let hash = id.slice('sha256:'.length);
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('artifactId must include a sha256 hex digest');
  return hash;
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
}

export function createFileArtifactStore(options = {}) {
  let root = cleanString(options.root, '');
  if (!root) throw new Error('artifact store root is required');

  async function getArtifact(artifactId) {
    let hash = hashFromRef(artifactId);
    let metadataPath = join(root, `${hash}.meta.json`);
    let metadata = await readJsonIfExists(metadataPath);
    if (!metadata) {
      let legacyMetadataPath = join(root, `${hash}.json`);
      metadata = await readJsonIfExists(legacyMetadataPath);
      if (metadata) metadataPath = legacyMetadataPath;
    }
    if (!metadata) return null;
    let mimeType = cleanString(metadata.mimeType, 'application/octet-stream');
    return {
      artifactId: refFromHash(hash),
      path: join(root, `${hash}.${extensionForMime(mimeType)}`),
      metadataPath,
      mimeType,
      metadata,
    };
  }

  return {
    async put(content, metadata = {}) {
      let bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
      let hash = hashBytes(bytes);
      let artifactId = refFromHash(hash);
      let mimeType = cleanString(metadata.mimeType, 'application/octet-stream');
      let ext = extensionForMime(mimeType);
      let path = join(root, `${hash}.${ext}`);
      let metadataPath = join(root, `${hash}.meta.json`);

      await mkdir(root, { recursive: true });
      await writeFile(path, bytes);

      let existing = await readJsonIfExists(metadataPath);
      let sidecar = existing || {
        ...cloneJson(metadata),
        artifactId,
        mimeType,
        bytes: bytes.length,
      };
      if (!existing) {
        await writeFile(metadataPath, `${JSON.stringify(sidecar, null, 2)}\n`);
      }

      return {
        artifactId,
        path,
        metadataPath,
        mimeType,
        bytes: bytes.length,
        metadata: sidecar,
      };
    },
    async get(artifactId) {
      return getArtifact(artifactId);
    },
    async read(artifactId) {
      let artifact = await getArtifact(artifactId);
      if (!artifact) return null;
      return {
        ...artifact,
        content: await readFile(artifact.path),
      };
    },
  };
}
