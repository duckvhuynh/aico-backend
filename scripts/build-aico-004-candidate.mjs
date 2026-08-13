import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = join(repoRoot, 'docs', 'architecture', 'artifacts', 'aico-004');
const templateRoot = join(artifactRoot, 'template-v1');
const dependencyImageRoot = join(artifactRoot, 'dependency-image');
const licensesRoot = join(artifactRoot, 'licenses');
const packageLockPath = join(templateRoot, 'package-lock.json');
const imageReference = 'aicompanyos/prototype-dependencies:1.0.0-candidate.1';
const baseImageDigest = 'd45d78e7929b46875bbd4e29bea672d5bc48186c6c3588306521c815e78352d6';
const generatedOn = '2026-08-13';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
};

const stableJson = (value) => `${JSON.stringify(stableValue(value), null, 2)}\n`;

const writeJson = (path, value) => writeFileSync(path, stableJson(value));

const writeUstarText = (header, offset, length, value) => {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length > length) throw new Error(`USTAR field is too long: ${value}`);
  bytes.copy(header, offset);
};

const writeUstarOctal = (header, offset, length, value) => {
  const octal = value.toString(8).padStart(length - 1, '0');
  writeUstarText(header, offset, length, `${octal}\0`);
};

const createCanonicalUstar = (files) => {
  const blocks = [];
  const mtime = Math.floor(Date.parse('2026-08-13T00:00:00.000Z') / 1000);
  for (const file of files) {
    const path = posixPath(relative(templateRoot, file));
    const content = readFileSync(file);
    const header = Buffer.alloc(512);
    writeUstarText(header, 0, 100, path);
    writeUstarOctal(header, 100, 8, 0o644);
    writeUstarOctal(header, 108, 8, 0);
    writeUstarOctal(header, 116, 8, 0);
    writeUstarOctal(header, 124, 12, content.length);
    writeUstarOctal(header, 136, 12, mtime);
    header.fill(0x20, 148, 156);
    header[156] = '0'.charCodeAt(0);
    writeUstarText(header, 257, 6, 'ustar\0');
    writeUstarText(header, 263, 2, '00');
    writeUstarText(header, 265, 32, 'root');
    writeUstarText(header, 297, 32, 'root');
    writeUstarOctal(header, 329, 8, 0);
    writeUstarOctal(header, 337, 8, 0);
    const checksum = header.reduce((total, byte) => total + byte, 0);
    writeUstarText(header, 148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `);
    blocks.push(header, content);
    const remainder = content.length % 512;
    if (remainder !== 0) blocks.push(Buffer.alloc(512 - remainder));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
};

const walk = (root) =>
  readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() ? [path] : [];
  });

const posixPath = (path) => path.split(sep).join('/');

const verifySri = (bytes, sri, label) => {
  const [algorithm, expected] = sri.split('-', 2);
  const actual = createHash(algorithm).update(bytes).digest('base64');
  if (actual !== expected) throw new Error(`${label} failed ${algorithm} SRI`);
};

const tarRead = (archive, member) => {
  const result = spawnSync('tar', ['-xOf', archive, member], {
    encoding: null,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) return null;
  return result.stdout;
};

const tarList = (archive) =>
  execFileSync('tar', ['-tf', archive], { encoding: 'utf8' }).split(/\r?\n/u).filter(Boolean);

const tempRoot = mkdtempSync(join(tmpdir(), 'aico004-candidate-'));
const archiveCache = new Map();

const fetchArchive = async (resolvedUrl, integrity) => {
  if (archiveCache.has(resolvedUrl)) return archiveCache.get(resolvedUrl);
  const response = await fetch(resolvedUrl);
  if (!response.ok) {
    throw new Error(`Unable to fetch ${resolvedUrl}: HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  verifySri(bytes, integrity, resolvedUrl);
  const path = join(tempRoot, `${sha256(resolvedUrl)}.tgz`);
  writeFileSync(path, bytes);
  archiveCache.set(resolvedUrl, path);
  return path;
};

const spdxUrl = 'https://registry.npmjs.org/spdx-license-list/-/spdx-license-list-6.12.0.tgz';
const spdxSri =
  'sha512-+nUYqm3aZMSHbjsthK+i/HHI2okTElCvqwUd4k8QcSk+FTGgjq+fsdFj2wZOaX6XmR2JdWhf/NeflNnvKOjcnQ==';

const spdxTexts = new Map();
const getSpdxText = async (licenseId) => {
  if (spdxTexts.has(licenseId)) return spdxTexts.get(licenseId);
  const archive = await fetchArchive(spdxUrl, spdxSri);
  const raw = tarRead(archive, `package/licenses/${licenseId}.json`);
  if (!raw) throw new Error(`No canonical SPDX text for ${licenseId}`);
  const licenseText = JSON.parse(raw.toString('utf8')).licenseText;
  if (!licenseText) throw new Error(`SPDX ${licenseId} has no licenseText`);
  spdxTexts.set(licenseId, licenseText);
  return licenseText;
};

const packageNameFromPath = (packagePath) => packagePath.split('node_modules/').at(-1);

const findLocalLicense = (packageDirectory) => {
  if (!existsSync(packageDirectory)) return null;
  const candidate = readdirSync(packageDirectory)
    .filter((name) => /^(?:licen[cs]e|copying|notice)(?:\.|$)/iu.test(name))
    .sort()[0];
  return candidate ? readFileSync(join(packageDirectory, candidate)) : null;
};

const readPackageMetadata = async (packagePath, lockEntry) => {
  const localDirectory = join(templateRoot, ...packagePath.split('/'));
  const localPackageJson = join(localDirectory, 'package.json');
  if (existsSync(localPackageJson)) {
    return {
      packageJson: JSON.parse(readFileSync(localPackageJson, 'utf8')),
      licenseBytes: findLocalLicense(localDirectory),
      licenseSource: 'INSTALLED_PACKAGE',
    };
  }

  const archive = await fetchArchive(lockEntry.resolved, lockEntry.integrity);
  const packageJsonRaw = tarRead(archive, 'package/package.json');
  if (!packageJsonRaw) throw new Error(`${packagePath} archive has no package.json`);
  const licenseMember = tarList(archive)
    .filter((member) => /^package\/(?:licen[cs]e|copying|notice)(?:\.|$)/iu.test(member))
    .sort()[0];
  return {
    packageJson: JSON.parse(packageJsonRaw.toString('utf8')),
    licenseBytes: licenseMember ? tarRead(archive, licenseMember) : null,
    licenseSource: 'PACKAGE_ARCHIVE',
  };
};

const targetApplicable = (entry) => {
  const osAllowed = !entry.os || entry.os.includes('linux');
  const cpuAllowed = !entry.cpu || entry.cpu.includes('x64');
  return osAllowed && cpuAllowed;
};

const nativeDeclaration = (name, entry) => {
  if (name === 'fsevents' || name.includes('/binding-') || name.startsWith('lightningcss-')) {
    return {
      kind: 'NAPI_BINARY',
      platforms: [...(entry.os ?? ['ANY_OS']), ...(entry.cpu ?? ['ANY_CPU'])],
    };
  }
  return { kind: 'NONE', platforms: [] };
};

const resolveDependencyPath = (packages, packagePath, dependencyName) => {
  let current = packagePath;
  while (true) {
    const nested = `${current}/node_modules/${dependencyName}`;
    if (packages[nested]) return nested;
    const index = current.lastIndexOf('/node_modules/');
    if (index < 0) break;
    current = current.slice(0, index);
  }
  const root = `node_modules/${dependencyName}`;
  return packages[root] ? root : null;
};

try {
  if (!existsSync(packageLockPath)) {
    throw new Error('Run npm install --ignore-scripts in template-v1 first');
  }

  const packageLockBytes = readFileSync(packageLockPath);
  const lock = JSON.parse(packageLockBytes.toString('utf8'));
  const rootPackage = lock.packages[''];
  const lockEntries = Object.entries(lock.packages)
    .filter(([packagePath]) => packagePath)
    .sort(([left], [right]) => left.localeCompare(right));

  rmSync(licensesRoot, { recursive: true, force: true });
  const { mkdirSync } = await import('node:fs');
  mkdirSync(licensesRoot, { recursive: true });

  const packageFacts = [];
  for (const [packagePath, entry] of lockEntries) {
    const name = packageNameFromPath(packagePath);
    const metadata = await readPackageMetadata(packagePath, entry);
    const scripts = metadata.packageJson.scripts ?? {};
    let licenseBytes = metadata.licenseBytes;
    let licenseSource = metadata.licenseSource;
    if (!licenseBytes) {
      licenseBytes = Buffer.from(await getSpdxText(entry.license), 'utf8');
      licenseSource = 'SPDX_CANONICAL_6.12.0';
    }
    const licenseTextDigest = sha256(licenseBytes);
    const licensePath = join(licensesRoot, `${licenseTextDigest}.txt`);
    if (!existsSync(licensePath)) writeFileSync(licensePath, licenseBytes);

    packageFacts.push({
      package_path: packagePath,
      name,
      version: entry.version,
      integrity: entry.integrity,
      spdx_license: entry.license,
      license_text_digest: licenseTextDigest,
      license_text_path: posixPath(relative(repoRoot, licensePath)),
      license_text_source: licenseSource,
      dependency_class: entry.dev ? 'DEV' : 'RUNTIME',
      optional: Boolean(entry.optional),
      target: {
        platform: 'linux/amd64',
        applicable: targetApplicable(entry),
        declared_os: entry.os ?? [],
        declared_cpu: entry.cpu ?? [],
      },
      lifecycle: {
        preinstall: scripts.preinstall ? [scripts.preinstall] : [],
        install: scripts.install ? [scripts.install] : [],
        postinstall: scripts.postinstall ? [scripts.postinstall] : [],
        denied: true,
      },
      native: nativeDeclaration(name, entry),
    });
  }

  const licenseReport = {
    contract: 'aico.template-license-evidence/v1',
    generated_on: generatedOn,
    acquisition_tool: {
      name: 'spdx-license-list',
      version: '6.12.0',
      integrity: spdxSri,
      use: 'Canonical fallback only when a package archive has no license file',
    },
    target_platform: 'linux/amd64',
    install_policy: 'NPM_CI_IGNORE_SCRIPTS',
    package_count: packageFacts.length,
    packages: packageFacts,
  };
  const licenseReportPath = join(artifactRoot, 'template-v1.licenses.json');
  writeJson(licenseReportPath, licenseReport);

  const bomRefByPath = new Map(
    packageFacts.map((fact) => [
      fact.package_path,
      `npm:${fact.name}@${fact.version}:${sha256(fact.package_path).slice(0, 12)}`,
    ]),
  );
  const components = packageFacts.map((fact) => {
    const integrity = fact.integrity.split('-', 2);
    const component = {
      type: 'library',
      'bom-ref': bomRefByPath.get(fact.package_path),
      name: fact.name,
      version: fact.version,
      purl: fact.name.startsWith('@')
        ? `pkg:npm/${encodeURIComponent(fact.name.split('/')[0])}/${encodeURIComponent(fact.name.split('/')[1])}@${fact.version}`
        : `pkg:npm/${encodeURIComponent(fact.name)}@${fact.version}`,
      hashes: [
        {
          alg: integrity[0].toUpperCase().replace('SHA', 'SHA-'),
          content: Buffer.from(integrity[1], 'base64').toString('hex'),
        },
      ],
      licenses: [{ expression: fact.spdx_license }],
      properties: [
        { name: 'aico:package-path', value: fact.package_path },
        { name: 'aico:dependency-class', value: fact.dependency_class },
        { name: 'aico:optional', value: String(fact.optional) },
        {
          name: 'aico:linux-amd64-applicable',
          value: String(fact.target.applicable),
        },
        { name: 'aico:license-text-sha256', value: fact.license_text_digest },
        { name: 'aico:lifecycle-scripts-denied', value: 'true' },
        { name: 'aico:native-kind', value: fact.native.kind },
      ],
    };
    return component;
  });
  const dependencies = lockEntries.map(([packagePath, entry]) => ({
    ref: bomRefByPath.get(packagePath),
    dependsOn: Object.keys({
      ...(entry.dependencies ?? {}),
      ...(entry.optionalDependencies ?? {}),
    })
      .map((name) => resolveDependencyPath(lock.packages, packagePath, name))
      .filter(Boolean)
      .map((path) => bomRefByPath.get(path))
      .sort(),
  }));
  dependencies.unshift({
    ref: 'pkg:npm/%40aicompanyos/prototype-template-v1@1.0.0-candidate.1',
    dependsOn: Object.keys({
      ...(rootPackage.dependencies ?? {}),
      ...(rootPackage.devDependencies ?? {}),
    })
      .map((name) => bomRefByPath.get(`node_modules/${name}`))
      .filter(Boolean)
      .sort(),
  });

  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: 'urn:uuid:7e01913d-3d0f-4f73-9688-c0ec00a40016',
    version: 1,
    metadata: {
      timestamp: '2026-08-13T00:00:00.000Z',
      tools: {
        components: [
          {
            type: 'application',
            name: 'aico-004-candidate-generator',
            version: '1.0.0',
          },
        ],
      },
      component: {
        type: 'application',
        'bom-ref': 'pkg:npm/%40aicompanyos/prototype-template-v1@1.0.0-candidate.1',
        name: '@aicompanyos/prototype-template-v1',
        version: '1.0.0-candidate.1',
      },
      properties: [
        { name: 'aico:lockfile-version', value: String(lock.lockfileVersion) },
        { name: 'aico:target-platform', value: 'linux/amd64' },
        { name: 'aico:install-policy', value: 'npm ci --ignore-scripts' },
      ],
    },
    components,
    dependencies,
  };
  const sbomPath = join(artifactRoot, 'template-v1.cdx.json');
  writeJson(sbomPath, sbom);

  const excludedDirectories = new Set(['node_modules', 'dist']);
  const templateFiles = walk(templateRoot)
    .filter((path) => {
      const relativePath = posixPath(relative(templateRoot, path));
      return !relativePath.split('/').some((segment) => excludedDirectories.has(segment));
    })
    .sort((left, right) =>
      posixPath(relative(templateRoot, left)).localeCompare(
        posixPath(relative(templateRoot, right)),
      ),
    );
  const fileManifest = {
    contract: 'aico.template-file-manifest/v1',
    generated_on: generatedOn,
    canonicalization:
      'POSIX_USTAR_SORTED_PATHS_MODE_0644_UID_GID_ZERO_MTIME_2026_08_13_GZIP_MTIME_ZERO',
    files: templateFiles.map((path) => ({
      path: posixPath(relative(templateRoot, path)),
      bytes: statSync(path).size,
      sha256: sha256(readFileSync(path)),
    })),
  };
  const fileManifestPath = join(artifactRoot, 'template-v1.files.json');
  writeJson(fileManifestPath, fileManifest);

  const archivePath = join(artifactRoot, 'template-v1.tar.gz');
  writeFileSync(archivePath, gzipSync(createCanonicalUstar(templateFiles), { level: 9 }));

  const dockerInspect = spawnSync('docker', ['image', 'inspect', imageReference], {
    encoding: 'utf8',
  });
  const image = dockerInspect.status === 0 ? JSON.parse(dockerInspect.stdout)[0] : null;
  const buildMetadataPath = join(dependencyImageRoot, 'build-metadata.json');
  const rawBuildMetadata = existsSync(buildMetadataPath)
    ? JSON.parse(readFileSync(buildMetadataPath, 'utf8'))
    : null;
  const descriptor =
    rawBuildMetadata?.['containerimage.descriptor'] ?? rawBuildMetadata?.descriptor ?? null;
  if (descriptor && descriptor.mediaType !== 'application/vnd.oci.image.manifest.v1+json') {
    throw new Error('Dependency build metadata is not an OCI image manifest');
  }
  const imageDigest = descriptor?.digest?.replace(/^sha256:/u, '') ?? null;
  if (imageDigest && !/^[a-f0-9]{64}$/u.test(imageDigest)) {
    throw new Error('Dependency OCI manifest digest is malformed');
  }
  if (rawBuildMetadata) {
    writeJson(buildMetadataPath, {
      contract: 'aico.dependency-image-build-metadata/v1',
      source_date_epoch: 0,
      platform: descriptor.platform,
      descriptor,
      config_digest:
        rawBuildMetadata['containerimage.config.digest'] ?? rawBuildMetadata.config_digest,
      materials:
        rawBuildMetadata['buildx.build.provenance']?.materials ?? rawBuildMetadata.materials ?? [],
      invocation:
        rawBuildMetadata['buildx.build.provenance']?.invocation?.parameters ??
        rawBuildMetadata.invocation ??
        {},
    });
  }
  const dockerfilePath = join(dependencyImageRoot, 'Dockerfile');
  const archiveDigest = sha256(readFileSync(archivePath));
  const lockDigest = sha256(packageLockBytes);
  const sbomDigest = sha256(readFileSync(sbomPath));
  const licenseReportDigest = sha256(readFileSync(licenseReportPath));

  const provenance = {
    schemaVersion: 'aico.dependency-image-provenance/v1',
    status: imageDigest ? 'MATERIALIZED_CANDIDATE' : 'CANDIDATE_PENDING_BUILD',
    platform: 'linux/amd64',
    baseImage: {
      reference: 'docker.io/library/node:24.18.0-bookworm-slim',
      indexDigest: 'sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d',
      platformDigest: `sha256:${baseImageDigest}`,
    },
    buildRecipe: 'Dockerfile',
    buildRecipeDigest: sha256(readFileSync(dockerfilePath)),
    dependencyInstall: 'npm ci --ignore-scripts --no-audit --no-fund',
    generatedRuntimeInstallAllowed: false,
    networkAtGeneratedRuntime: 'NONE',
    candidateImageReference: imageReference,
    candidateImageDigest: imageDigest ? `sha256:${imageDigest}` : null,
    candidateImageMediaType: descriptor?.mediaType ?? null,
    builtAt: descriptor?.annotations?.['org.opencontainers.image.created'] ?? null,
    builder: imageDigest ? 'Docker BuildKit 29.2.0 OCI exporter' : null,
    rootfsDiffIds: image?.RootFS?.Layers ?? [],
    inputs: {
      templateArchiveDigest: archiveDigest,
      packageLockDigest: lockDigest,
      sbomDigest,
      licenseReportDigest,
    },
  };
  const provenancePath = join(dependencyImageRoot, 'provenance.json');
  writeJson(provenancePath, provenance);

  const artifact = ({ key, kind, ref, mediaType, digest, immutableRef }) => ({
    artifact_key: key,
    artifact_kind: kind,
    canonical_ref: `aico-artifact:aico-004/${key}/1.0.0-candidate.1`,
    materialization_owner: 'AICO-004',
    productization_owner: 'AICO-047',
    materialization_status: digest ? 'MATERIALIZED_CANDIDATE' : 'PENDING_AICO_004_MATERIALIZATION',
    expected_media_type: mediaType,
    ...(immutableRef ? { immutable_ref: immutableRef } : {}),
    ...(digest ? { digest } : {}),
  });
  const canonicalArtifacts = {
    template_archive: artifact({
      key: 'template-archive',
      kind: 'TEMPLATE_ARCHIVE',
      ref: 'template-v1.tar.gz',
      mediaType: 'application/gzip',
      digest: archiveDigest,
      immutableRef: 'docs/architecture/artifacts/aico-004/template-v1.tar.gz',
    }),
    package_lock: artifact({
      key: 'package-lock',
      kind: 'PACKAGE_LOCK',
      mediaType: 'application/json',
      digest: lockDigest,
      immutableRef: 'docs/architecture/artifacts/aico-004/template-v1/package-lock.json',
    }),
    sbom: artifact({
      key: 'sbom',
      kind: 'CYCLONEDX_SBOM',
      mediaType: 'application/vnd.cyclonedx+json',
      digest: sbomDigest,
      immutableRef: 'docs/architecture/artifacts/aico-004/template-v1.cdx.json',
    }),
    license_report: artifact({
      key: 'license-report',
      kind: 'LICENSE_REPORT',
      mediaType: 'application/json',
      digest: licenseReportDigest,
      immutableRef: 'docs/architecture/artifacts/aico-004/template-v1.licenses.json',
    }),
    base_image: artifact({
      key: 'base-image',
      kind: 'BASE_OCI_IMAGE',
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      digest: baseImageDigest,
      immutableRef: `docker.io/library/node@sha256:${baseImageDigest}`,
    }),
    dependency_bundle_image: artifact({
      key: 'dependency-bundle-image',
      kind: 'DEPENDENCY_BUNDLE_OCI_IMAGE',
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      digest: imageDigest,
      immutableRef: imageDigest ? `aicompanyos/prototype-dependencies@sha256:${imageDigest}` : null,
    }),
  };
  const routes = [
    ['start', 'Start', 'Introduce the bounded prototype and limitation warning.'],
    ['input', 'Input', 'Capture one local-only selection without persistence.'],
    ['options', 'Options', 'Compare deterministic typed fixture options.'],
    ['summary', 'Summary', 'Review the local prototype selection and limitations.'],
    ['complete', 'Complete', 'Show the non-production completion and restart action.'],
  ];
  const screens = routes.map(([id, label, purpose]) => ({
    screen_id: `${id}-screen`,
    route_id: id,
    title: label,
    purpose,
    region_ids: ['prototype-warning', 'progress-navigation', 'main-content', 'actions'],
  }));
  const states = routes.flatMap(([id]) =>
    ['LOADING', 'EMPTY', 'ERROR', 'SUCCESS'].map((kind) => ({
      state_id: `${id}-${kind.toLowerCase()}`,
      screen_id: `${id}-screen`,
      state_kind: kind,
      intent:
        kind === 'SUCCESS'
          ? 'Present the deterministic local screen content and bounded actions.'
          : `Present the deterministic ${kind.toLowerCase()} variant without network access.`,
      visible_region_ids:
        kind === 'SUCCESS'
          ? ['prototype-warning', 'progress-navigation', 'main-content', 'actions']
          : ['prototype-warning', 'main-content', 'actions'],
      interaction_ids:
        kind === 'SUCCESS'
          ? [`${id}-continue`]
          : kind === 'ERROR'
            ? [`${id}-retry`]
            : kind === 'EMPTY'
              ? [`${id}-restore`]
              : [],
    })),
  );
  const interactions = routes.flatMap(([id, label], index) => {
    const nextId = routes[(index + 1) % routes.length][0];
    return [
      {
        interaction_id: `${id}-continue`,
        screen_id: `${id}-screen`,
        control_role: 'BUTTON',
        accessible_name: index === routes.length - 1 ? 'Restart prototype' : 'Continue',
        trigger: 'ACTIVATE',
        from_state_id: `${id}-success`,
        to_state_id: `${nextId}-success`,
        keyboard_operation: 'Tab to the button and activate with Enter or Space.',
        feedback: `${label} advances within the one local primary flow.`,
      },
      {
        interaction_id: `${id}-retry`,
        screen_id: `${id}-screen`,
        control_role: 'BUTTON',
        accessible_name: 'Retry locally',
        trigger: 'ACTIVATE',
        from_state_id: `${id}-error`,
        to_state_id: `${id}-success`,
        keyboard_operation: 'Tab to the button and activate with Enter or Space.',
        feedback: 'The screen restores deterministic local success without network access.',
      },
      {
        interaction_id: `${id}-restore`,
        screen_id: `${id}-screen`,
        control_role: 'BUTTON',
        accessible_name: 'Restore fixture',
        trigger: 'ACTIVATE',
        from_state_id: `${id}-empty`,
        to_state_id: `${id}-success`,
        keyboard_operation: 'Tab to the button and activate with Enter or Space.',
        feedback: 'The empty screen restores the deterministic local fixture.',
      },
    ];
  });
  const designManifest = {
    contract: 'aico.sandbox-design-decision-manifest',
    schema_version: '1.0',
    manifest_id: 'aico-fixed-react-ts-design',
    manifest_version: '1.0.0-candidate.1',
    decision_status: 'PROPOSED',
    decision_child: 'duckvhuynh/aico-backend#16',
    productization_owner: 'AICO-047',
    owner_decisions: {
      engineering_design: { status: 'PENDING' },
      architecture_security_platform: { status: 'PENDING' },
    },
    inventory: {
      routes: routes.map(([id, label], index) => ({
        route_id: id,
        path: `/${id}`,
        screen_id: `${id}-screen`,
        navigation_label: label,
        inventory_ordinal: index + 1,
      })),
      screens,
      states,
    },
    primary_flow: {
      flow_id: 'prototype-primary-flow',
      name: 'Five-screen local prototype flow',
      steps: routes.map(([id], index) => {
        const nextId = routes[(index + 1) % routes.length][0];
        return {
          ordinal: index + 1,
          route_id: id,
          screen_id: `${id}-screen`,
          entry_state_id: `${id}-success`,
          interaction_id: `${id}-continue`,
          outcome_state_id: `${nextId}-success`,
          expected_outcome:
            index === routes.length - 1
              ? 'Restart returns to the local start screen with no remote effect.'
              : `Advance to the local ${nextId} screen with no remote effect.`,
        };
      }),
    },
    responsive: {
      compact: {
        maximum_width_px: 767,
        navigation_pattern: 'TOP_BAR_WRAP',
        columns: 1,
      },
      expanded: {
        minimum_width_px: 768,
        navigation_pattern: 'TOP_BAR',
        columns: 1,
      },
      layout: {
        content_maximum_width_px: 960,
        region_order: ['prototype-warning', 'progress-navigation', 'main-content', 'actions'],
        gutter_token: 'space.layout-gutter',
      },
    },
    tokens: {
      color: {
        background: '#f4f1ea',
        surface: '#fffdf8',
        text_primary: '#1c2522',
        text_muted: '#62706b',
        action: '#155f4a',
        danger: '#a23232',
        border: '#ccd4cf',
        focus: '#5aa58e',
      },
      typography: {
        font_family: 'Inter, ui-sans-serif, system-ui, sans-serif',
        base_size_px: 16,
        line_height_ratio: 1.5,
        regular_weight: 400,
        strong_weight: 700,
      },
      spacing: { unit_px: 4, layout_gutter_units: 4, section_gap_units: 6 },
      shape: { control_radius_px: 8, surface_radius_px: 16, focus_width_px: 3 },
      motion: {
        standard_duration_ms: 160,
        reduced_motion_behavior: 'DISABLE_NON_ESSENTIAL',
      },
    },
    interactions,
    accessibility: {
      target: 'WCAG_2_2_AA',
      verification_claim: 'BASIC_AUTOMATED_SMOKE_ONLY_NO_CONFORMANCE_CLAIM',
      semantic_html: true,
      keyboard_operable: true,
      visible_focus: true,
      programmatic_labels: true,
      minimum_text_contrast: 4.5,
      minimum_large_text_contrast: 3,
      reduced_motion: 'PREFERS_REDUCED_MOTION',
    },
    prototype_warning: {
      text: 'Prototype only - not a live production system.',
      placement: 'PERSISTENT_GLOBAL',
      dismissible: false,
      visible_in_all_states: true,
      semantic_role: 'NOTE',
    },
    canonical_artifacts: canonicalArtifacts,
    canonical_artifact_set_digest: sha256(stableJson(canonicalArtifacts)),
    manifest_digest: '',
  };
  designManifest.manifest_digest = sha256(
    stableJson(
      Object.fromEntries(
        Object.entries(designManifest).filter(([key]) => key !== 'manifest_digest'),
      ),
    ),
  );
  const designManifestPath = join(artifactRoot, 'sandbox-design-decision-v1.json');
  writeJson(designManifestPath, designManifest);

  console.log(
    JSON.stringify(
      {
        packageCount: packageFacts.length,
        targetApplicableCount: packageFacts.filter((fact) => fact.target.applicable).length,
        templateFileCount: fileManifest.files.length,
        archiveDigest,
        lockDigest,
        sbomDigest,
        licenseReportDigest,
        dependencyImageDigest: imageDigest,
        designManifestDigest: designManifest.manifest_digest,
        dependencyImageReady: Boolean(imageDigest),
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
