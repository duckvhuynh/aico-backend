import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';

export const AICO_004_BUILDKIT_IMAGE =
  'moby/buildkit:v0.27.0@sha256:054d632d0d7e94b11cdc6048674773499a5170cf7d8ce0c326daaff6be43c8e0';
export const AICO_004_SOURCE_DATE_EPOCH = '0';

const runDocker = (args, options = {}) =>
  execFileSync('docker', args, {
    cwd: options.cwd,
    env: { ...process.env, SOURCE_DATE_EPOCH: AICO_004_SOURCE_DATE_EPOCH },
    stdio: options.stdio ?? 'inherit',
  });

const readTarJson = (archivePath, member) => {
  const result = spawnSync('tar', ['-xOf', archivePath, member], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Unable to read ${member} from dependency-image OCI archive`);
  }
  return JSON.parse(result.stdout);
};

const ociBlobPath = (digest) => {
  const match = /^sha256:([a-f0-9]{64})$/u.exec(digest ?? '');
  if (!match) throw new Error(`Invalid OCI digest: ${digest}`);
  return `blobs/sha256/${match[1]}`;
};

export const buildPinnedDependencyImage = ({
  artifactRoot,
  outputPath,
  metadataPath,
  label = 'build',
}) => {
  const safeLabel = label
    .toLowerCase()
    .replace(/[^a-z0-9-]/gu, '-')
    .slice(0, 20);
  const builderName = `aico004-${safeLabel}-${process.pid}-${randomUUID().slice(0, 8)}`;
  let builderCreated = false;

  try {
    runDocker([
      'buildx',
      'create',
      '--name',
      builderName,
      '--driver',
      'docker-container',
      '--driver-opt',
      `image=${AICO_004_BUILDKIT_IMAGE}`,
    ]);
    builderCreated = true;
    runDocker(['buildx', 'inspect', builderName, '--bootstrap']);
    runDocker(
      [
        'buildx',
        'build',
        '--builder',
        builderName,
        '--provenance=false',
        '--build-arg',
        `SOURCE_DATE_EPOCH=${AICO_004_SOURCE_DATE_EPOCH}`,
        '--file',
        'dependency-image/Dockerfile',
        '--output',
        `type=oci,dest=${outputPath},rewrite-timestamp=true`,
        '--metadata-file',
        metadataPath,
        '.',
      ],
      { cwd: artifactRoot },
    );

    if (!existsSync(outputPath) || statSync(outputPath).size === 0) {
      throw new Error('Dependency-image OCI exporter produced no archive');
    }

    const rawMetadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    const descriptor = rawMetadata['containerimage.descriptor'];
    if (descriptor?.mediaType !== 'application/vnd.oci.image.manifest.v1+json') {
      throw new Error('Dependency-image output is not an OCI image manifest');
    }

    const index = readTarJson(outputPath, 'index.json');
    const manifestDescriptor = index.manifests?.[0];
    if (manifestDescriptor?.digest !== descriptor.digest) {
      throw new Error('OCI index and BuildKit metadata disagree on the image manifest digest');
    }
    const manifest = readTarJson(outputPath, ociBlobPath(manifestDescriptor.digest));
    const config = readTarJson(outputPath, ociBlobPath(manifest.config?.digest));
    const rootfsDiffIds = config.rootfs?.diff_ids;
    if (!Array.isArray(rootfsDiffIds) || rootfsDiffIds.length === 0) {
      throw new Error('Dependency-image OCI config has no rootfs diff IDs');
    }

    return {
      rawMetadata,
      descriptor,
      configDigest: manifest.config.digest,
      rootfsDiffIds,
      builderImage: AICO_004_BUILDKIT_IMAGE,
    };
  } finally {
    if (builderCreated) {
      try {
        runDocker(['buildx', 'rm', builderName], { stdio: 'ignore' });
      } catch {
        console.warn(`Unable to remove disposable BuildKit builder ${builderName}`);
      }
    }
  }
};
