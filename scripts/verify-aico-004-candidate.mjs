import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPinnedDependencyImage } from './aico-004-image-builder.mjs';

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
  const actualDigests = [];
  for (const buildNumber of [1, 2]) {
    const outputPath = join(buildRoot, `dependency-image-${buildNumber}.oci.tar`);
    const metadataPath = join(buildRoot, `build-metadata-${buildNumber}.json`);
    const result = buildPinnedDependencyImage({
      artifactRoot,
      outputPath,
      metadataPath,
      label: `verify-${buildNumber}`,
    });
    actualDigests.push(result.descriptor.digest);
  }
  if (new Set(actualDigests).size !== 1) {
    throw new Error(`Independent dependency-image builds drifted: ${actualDigests.join(', ')}`);
  }
  if (actualDigests[0] !== expectedDigest) {
    throw new Error(
      `Dependency-image digest drift: expected ${expectedDigest}, got ${actualDigests[0]}`,
    );
  }
  console.log(
    `AICO-004 candidate verified: template checks=5; independent builds=2; OCI digest=${expectedDigest}.`,
  );
} finally {
  rmSync(buildRoot, { recursive: true, force: true });
}
