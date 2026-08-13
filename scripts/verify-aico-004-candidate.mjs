import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = join(repoRoot, 'docs', 'architecture', 'artifacts', 'aico-004');
const templateRoot = join(artifactRoot, 'template-v1');
const expectedMetadata = JSON.parse(
  readFileSync(join(artifactRoot, 'dependency-image', 'build-metadata.json'), 'utf8'),
);
const expectedDigest = expectedMetadata.descriptor?.digest;
if (!/^sha256:[a-f0-9]{64}$/u.test(expectedDigest ?? '')) {
  throw new Error('Canonical dependency-image OCI digest is unavailable');
}

const run = (executable, args, cwd) => {
  if (process.platform === 'win32' && executable === 'npm') {
    return execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm', ...args], {
      cwd,
      stdio: 'inherit',
    });
  }
  return execFileSync(executable, args, { cwd, stdio: 'inherit' });
};

run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], templateRoot);
for (const script of ['format:check', 'lint', 'typecheck', 'test', 'build']) {
  run('npm', ['run', script], templateRoot);
}

const buildRoot = mkdtempSync(join(tmpdir(), 'aico004-verify-'));
try {
  const outputPath = join(buildRoot, 'dependency-image.oci.tar');
  const metadataPath = join(buildRoot, 'build-metadata.json');
  run(
    'docker',
    [
      'buildx',
      'build',
      '--provenance=false',
      '--build-arg',
      'SOURCE_DATE_EPOCH=0',
      '--file',
      'dependency-image/Dockerfile',
      '--output',
      `type=oci,dest=${outputPath}`,
      '--metadata-file',
      metadataPath,
      '.',
    ],
    artifactRoot,
  );
  if (!existsSync(outputPath) || statSync(outputPath).size === 0) {
    throw new Error('Dependency-image OCI exporter produced no archive');
  }
  const actualMetadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  const descriptor = actualMetadata['containerimage.descriptor'];
  if (descriptor?.mediaType !== 'application/vnd.oci.image.manifest.v1+json') {
    throw new Error('Dependency-image output is not an OCI image manifest');
  }
  if (descriptor.digest !== expectedDigest) {
    throw new Error(
      `Dependency-image digest drift: expected ${expectedDigest}, got ${descriptor.digest}`,
    );
  }
  console.log(`AICO-004 candidate verified: template checks=5; OCI digest=${expectedDigest}.`);
} finally {
  rmSync(buildRoot, { recursive: true, force: true });
}
