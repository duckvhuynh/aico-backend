import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const paths = {
  adr: 'docs/architecture/009-sandbox-template-dependency-selection.md',
  contract: 'docs/contracts/SANDBOX_EXECUTION.md',
  schema: 'docs/contracts/schemas/sandbox-execution.v1.schema.json',
  manifest: 'docs/architecture/manifests/template-dependencies-v1.json',
  threat: 'docs/delivery/AICO_004_THREAT_TEST_PLAN.md',
  aeo: 'docs/delivery/AICO_004_AEO_AUDIT.md',
  evidence: 'docs/delivery/AICO_004_EVIDENCE.md',
};

const candidatePaths = {
  archive: 'docs/architecture/artifacts/aico-004/template-v1.tar.gz',
  fileManifest: 'docs/architecture/artifacts/aico-004/template-v1.files.json',
  packageLock: 'docs/architecture/artifacts/aico-004/template-v1/package-lock.json',
  sbom: 'docs/architecture/artifacts/aico-004/template-v1.cdx.json',
  licenses: 'docs/architecture/artifacts/aico-004/template-v1.licenses.json',
  designContract: 'docs/architecture/artifacts/aico-004/template-v1/design-contract.json',
  designDecision: 'docs/architecture/artifacts/aico-004/sandbox-design-decision-v1.json',
  buildMetadata: 'docs/architecture/artifacts/aico-004/dependency-image/build-metadata.json',
  provenance: 'docs/architecture/artifacts/aico-004/dependency-image/provenance.json',
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const sha256File = (path) => `sha256:${sha256(readFileSync(path))}`;
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

const documents = Object.fromEntries(
  Object.entries(paths).map(([name, path]) => [name, readFileSync(path, 'utf8')]),
);
const requireAccepted = process.argv.includes('--require-accepted');
const probeIndex = process.argv.indexOf('--probe-failure');
const probe = probeIndex >= 0 ? process.argv[probeIndex + 1] : undefined;
const errors = [];

const normalize = (value) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const replacements = {
  'adr-status': ['adr', /^\*\*Status:\*\*.+$/gm, '**Status:** REMOVED'],
  'template-digest': [
    'manifest',
    /"base_image_platform_digest":\s*"sha256:[a-f0-9]{64}"/,
    '"base_image_platform_digest": "REMOVED-DIGEST"',
  ],
  'dependency-integrity': ['manifest', /sha512-[A-Za-z0-9+/=]+/, 'REMOVED-INTEGRITY'],
  'workspace-boundary': ['contract', /workspace-root confinement/gi, 'workspace access'],
  'command-allowlist': ['contract', /command IDs only/gi, 'arbitrary command strings'],
  'network-deny': ['contract', /network-none/gi, 'unrestricted network'],
  'credential-deny': ['contract', /credential-free/gi, 'credential-bearing'],
  termination: ['contract', /entire process tree/gi, 'parent process only'],
  'output-integrity': ['contract', /output[ _-]integrity/gi, 'unchecked output'],
  'gate-binding': ['contract', /exact GATE-02/gi, 'latest gate'],
  'threat-registry': ['threat', /A4-T-/g, 'REMOVED-T-'],
  'redaction-cardinality': ['aeo', /low-cardinality/gi, 'unbounded-cardinality'],
};

if (probe !== undefined) {
  const mutation = replacements[probe];
  if (!mutation) throw new Error(`Unknown AICO-004 validation failure probe: ${probe}`);
  const [documentName, pattern, replacement] = mutation;
  documents[documentName] = documents[documentName].replace(pattern, replacement);
}

function requireText(documentName, values) {
  const normalizedDocument = normalize(documents[documentName]);
  for (const value of values) {
    if (!normalizedDocument.includes(normalize(value))) {
      errors.push(`${paths[documentName]} is missing required content: ${value}`);
    }
  }
}

requireText('adr', [
  'AICO-004',
  'TD-003',
  'TD-004',
  'DEC-010',
  'PRD-FR-034',
  'PRD-FR-039',
  'SRS-FR-048',
  'SRS-FR-058',
  'SRS-NFR-011',
  'SRS-NFR-025',
  'SRS-NFR-026',
  'AT-009',
  'SandboxExecutionPort',
  'rootless',
  'gVisor',
  'Ordinary or hardened runc',
  'client-only',
  'five routes',
  'mock/local data',
  'platform-managed dependency acquisition',
  'no runtime dependency installation',
  'unknown outcome',
  'rollback',
  'AICO-047',
  'AICO-083',
]);

requireText('contract', [
  'credential-free',
  'workspace-root confinement',
  'command IDs only',
  'network-none',
  'exact GATE-02',
  'logical idempotency key',
  'entire process tree',
  'output integrity',
  'UNKNOWN',
  'cancellation',
  'event',
  'outbox',
  'tenant',
  'sha256:',
  'bounded',
  'redacted',
  'no silent fallback',
]);

requireText('threat', [
  'proposed adversarial and evidence contract',
  'two-company',
  'paid-service-free',
  'exact clean repository SHA',
  'EMP-DES',
  'GATE-02',
  'EMP-ENG',
  'ToolGateway',
  'SandboxManager',
  'A4-T-BUILD-01',
  'A4-T-HOST-01',
  'A4-T-WORKSPACE-01',
  'A4-T-COMMAND-01',
  'A4-T-EGRESS-DNS-01',
  'A4-T-CREDENTIAL-01',
  'A4-T-CPU-01',
  'A4-T-TIMEOUT-01',
  'A4-T-OUTPUT-INTEGRITY-01',
  'A4-T-REPLAY-01',
  'zero unauthorized effect',
  'hardened OCI/runc isolation',
  'not production isolation',
]);

requireText('aeo', [
  'pre-A4-READY-0',
  'low-cardinality',
  'causal',
  'redaction',
  'exact SHA',
  'STATE_RECONSTRUCTION',
  'OFFLINE_REPRODUCTION',
  'CONTROLLED_REEVALUATION',
  'SIDE_EFFECT_RECONCILIATION',
  'AICO-047',
  'AICO-083',
]);

requireText('evidence', [
  'A4-ADR-01',
  'A4-BOUNDARY-01',
  'A4-TEMPLATE-01',
  'A4-DEPS-01',
  'A4-OUTPUT-01',
  'A4-TERM-01',
  'A4-THREAT-01',
  'A4-ROLLBACK-01',
  'A4-AEO-01-12',
  'A4-TRACE-01',
  'A4-VERIFY-01',
  'A4-ACCEPT-01',
  'proof child #17',
  'AICO-047',
  'AICO-083',
]);

const threatIds = new Set(documents.threat.match(/\bA4-T-[A-Z0-9-]+\b/g) ?? []);
if (threatIds.size < 22) {
  errors.push(`${paths.threat} must define at least 22 unique stable A4-T-* threat cases`);
}
for (let number = 1; number <= 12; number += 1) {
  const id = `A4-M-${String(number).padStart(2, '0')}`;
  if (!documents.threat.includes(id)) errors.push(`${paths.threat} is missing mutation: ${id}`);
}
for (let number = 1; number <= 12; number += 1) {
  const id = `A4-AEO-${String(number).padStart(2, '0')}`;
  if (!documents.aeo.includes(id)) errors.push(`${paths.aeo} is missing AEO gate: ${id}`);
}

let schema;
let manifest;
try {
  schema = JSON.parse(documents.schema);
} catch (error) {
  errors.push(`${paths.schema} is not valid JSON: ${error.message}`);
}
try {
  manifest = JSON.parse(documents.manifest);
} catch (error) {
  errors.push(`${paths.manifest} is not valid JSON: ${error.message}`);
}

const accepted = /^\*\*Status:\*\* Accepted for AICO-004\b/m.test(documents.adr);
const proposed = /^\*\*Status:\*\* Proposed for AICO-004 owner acceptance\b/m.test(documents.adr);
const engineeringDesignEvidence = documents.adr
  .match(/^\*\*Engineering\/Design evidence:\*\* (.+)$/m)?.[1]
  ?.trim();
const securityPlatformEvidence = documents.adr
  .match(/^\*\*Architecture\/Security\/Platform evidence:\*\* (.+)$/m)?.[1]
  ?.trim();
const permanentEvidence =
  /^https:\/\/github\.com\/duckvhuynh\/aico-backend\/pull\/\d+#issuecomment-\d+$/;

function assertClosedObjects(value, location = '#') {
  if (!value || typeof value !== 'object') return;
  if (value.type === 'object' && value.additionalProperties !== false) {
    errors.push(`${paths.schema} object schema ${location} must set additionalProperties=false`);
  }
  for (const [key, child] of Object.entries(value)) {
    assertClosedObjects(child, `${location}/${key}`);
  }
}

if (schema) {
  assertClosedObjects(schema);
  const serialized = JSON.stringify(schema);
  for (const required of [
    'sandboxExecutionRequest',
    'sandboxExecutionReceipt',
    'sandboxTerminationReceipt',
    'logical_idempotency_key',
    'gate02Binding',
    'templateBinding',
    'dependencyBundleBinding',
    'sandboxProfileBinding',
    'commandSequence',
    'resourceLimits',
    'outputManifest',
    'UNKNOWN',
  ]) {
    if (!serialized.includes(required)) {
      errors.push(`${paths.schema} is missing required schema term: ${required}`);
    }
  }
  for (const forbidden of [
    'rawCommand',
    'shellCommand',
    'imageOverride',
    'networkOverride',
    'credential',
    'environmentValues',
  ]) {
    if (serialized.includes(`\"${forbidden}\"`)) {
      errors.push(`${paths.schema} contains forbidden caller-controlled field: ${forbidden}`);
    }
  }
}

if (manifest) {
  const digest = /^sha256:[a-f0-9]{64}$/;
  const integrity = /^sha512-[A-Za-z0-9+/]+={0,2}$/;
  if (
    manifest.manifest_kind !== 'AICO_TEMPLATE_DEPENDENCIES' ||
    manifest.schema_version !== '1.0'
  ) {
    errors.push(
      `${paths.manifest} must use manifest_kind=AICO_TEMPLATE_DEPENDENCIES and schema_version=1.0`,
    );
  }
  if (accepted) {
    if (
      manifest.decision_status !== 'ACCEPTED' ||
      manifest.acceptance?.engineering_design !== 'ACCEPTED' ||
      manifest.acceptance?.architecture_security_platform !== 'ACCEPTED' ||
      !/^[a-f0-9]{40}$/.test(manifest.acceptance?.semantic_sha ?? '')
    ) {
      errors.push(
        `${paths.manifest} accepted candidate must bind both owner decisions to one semantic SHA`,
      );
    }
  } else if (
    manifest.decision_status !== 'PROPOSED' ||
    manifest.acceptance?.engineering_design !== 'PENDING' ||
    manifest.acceptance?.architecture_security_platform !== 'PENDING' ||
    manifest.acceptance?.semantic_sha !== null
  ) {
    errors.push(`${paths.manifest} proposed candidate owner decisions must remain Pending`);
  }
  if (
    manifest.template?.route_limit !== 5 ||
    manifest.template?.flow_limit !== 1 ||
    manifest.template?.framework !== 'VITE_REACT_TYPESCRIPT_CLIENT_ONLY'
  ) {
    errors.push(
      `${paths.manifest} must enforce the fixed client-only one-flow five-route template`,
    );
  }
  if (manifest.template?.data_mode !== 'TYPED_LOCAL_FIXTURES_ONLY') {
    errors.push(`${paths.manifest} data_mode must be TYPED_LOCAL_FIXTURES_ONLY`);
  }
  for (const [name, value] of Object.entries({
    lockfileDigest: manifest.acquisition?.lockfile_digest,
    baseImageIndexDigest: manifest.toolchain?.base_image_index_digest,
    baseImagePlatformDigest: manifest.toolchain?.base_image_platform_digest,
  })) {
    if (!digest.test(value ?? '')) errors.push(`${paths.manifest} ${name} must be sha256:<hex>`);
  }
  const packages = manifest.direct_packages;
  if (!Array.isArray(packages) || packages.length < 5) {
    errors.push(`${paths.manifest} must enumerate the exact candidate package set`);
  } else {
    for (const item of packages) {
      if (!item.name || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(item.version ?? '')) {
        errors.push(`${paths.manifest} package entries require exact name and version`);
      }
      if (!integrity.test(item.integrity ?? '')) {
        errors.push(
          `${paths.manifest} package ${item.name ?? '<unknown>'} requires sha512 integrity`,
        );
      }
      if (!item.license) errors.push(`${paths.manifest} package ${item.name} requires a license`);
    }
  }
  const resolvedPackages = manifest.resolved_packages;
  if (
    !Array.isArray(resolvedPackages) ||
    resolvedPackages.length !== manifest.resolved_package_count ||
    resolvedPackages.some(
      (item) =>
        !Array.isArray(item) ||
        item.length !== 5 ||
        !item[0] ||
        !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(item[1] ?? '') ||
        !integrity.test(item[2] ?? '') ||
        !item[3] ||
        typeof item[4] !== 'boolean',
    )
  ) {
    errors.push(`${paths.manifest} must contain the complete exact resolved dependency inventory`);
  }
  const candidateArtifactFields = {
    templateArchive: manifest.template?.artifact?.archive_digest,
    packageLock: manifest.acquisition?.lockfile?.digest,
    sbom: manifest.acquisition?.sbom?.digest,
    licenseReport: manifest.acquisition?.license_evidence?.digest,
    baseImage: manifest.toolchain?.base_image_platform_digest,
    dependencyBundle: manifest.toolchain?.dependency_bundle_image?.digest,
  };
  for (const [name, value] of Object.entries(candidateArtifactFields)) {
    if (!digest.test(value ?? '')) {
      errors.push(
        `${paths.manifest} decision-grade candidate ${name} must be materialized and digest-pinned`,
      );
    }
  }
  if (!accepted) {
    if (!Array.isArray(manifest.acceptance_blockers) || manifest.acceptance_blockers.length < 2) {
      errors.push(`${paths.manifest} proposed candidate must enumerate its acceptance blockers`);
    }
    if (
      manifest.acceptance_blockers?.some((blocker) =>
        /AICO-004 must (?:materialize|build|bind|rebuild)|PENDING_AICO_004/iu.test(blocker),
      )
    ) {
      errors.push(`${paths.manifest} cannot request owner review with materialization blockers`);
    }
  }
}

const candidateDocuments = {};
for (const [name, path] of Object.entries(candidatePaths)) {
  if (!existsSync(path)) {
    errors.push(`Missing AICO-004 decision artifact: ${path}`);
    continue;
  }
  if (name !== 'archive') {
    try {
      candidateDocuments[name] = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      errors.push(`${path} is not valid JSON: ${error.message}`);
    }
  }
}

const designDecision = candidateDocuments.designDecision;
const packageLock = candidateDocuments.packageLock;
const licenseReport = candidateDocuments.licenses;
const sbom = candidateDocuments.sbom;
const fileManifest = candidateDocuments.fileManifest;
const buildMetadata = candidateDocuments.buildMetadata;
const provenance = candidateDocuments.provenance;
const rawDigestPattern = /^[a-f0-9]{64}$/;
const prefixedDigestPattern = /^sha256:[a-f0-9]{64}$/;

if (designDecision) {
  if (
    designDecision.contract !== 'aico.sandbox-design-decision-manifest' ||
    designDecision.schema_version !== '1.0' ||
    designDecision.decision_child !== 'duckvhuynh/aico-backend#16'
  ) {
    errors.push(`${candidatePaths.designDecision} has the wrong closed contract identity`);
  }
  const manifestWithoutDigest = Object.fromEntries(
    Object.entries(designDecision).filter(([key]) => key !== 'manifest_digest'),
  );
  if (designDecision.manifest_digest !== sha256(stableJson(manifestWithoutDigest))) {
    errors.push(`${candidatePaths.designDecision} manifest_digest does not recompute`);
  }
  if (
    designDecision.canonical_artifact_set_digest !==
    sha256(stableJson(designDecision.canonical_artifacts))
  ) {
    errors.push(
      `${candidatePaths.designDecision} canonical_artifact_set_digest does not recompute`,
    );
  }

  const artifactKeys = [
    'template_archive',
    'package_lock',
    'sbom',
    'license_report',
    'base_image',
    'dependency_bundle_image',
  ];
  if (
    Object.keys(designDecision.canonical_artifacts ?? {})
      .sort()
      .join(',') !== [...artifactKeys].sort().join(',')
  ) {
    errors.push(`${candidatePaths.designDecision} must bind exactly six canonical artifacts`);
  }
  for (const key of artifactKeys) {
    const artifact = designDecision.canonical_artifacts?.[key];
    if (
      !artifact ||
      artifact.materialization_owner !== 'AICO-004' ||
      artifact.productization_owner !== 'AICO-047' ||
      !rawDigestPattern.test(artifact.digest ?? '') ||
      !artifact.immutable_ref
    ) {
      errors.push(`${candidatePaths.designDecision} artifact ${key} is not decision-grade`);
      continue;
    }
    const expectedStatus = accepted ? 'DECISION_FROZEN' : 'MATERIALIZED_CANDIDATE';
    if (artifact.materialization_status !== expectedStatus) {
      errors.push(`${candidatePaths.designDecision} artifact ${key} must be ${expectedStatus}`);
    }
  }
  if (accepted) {
    if (
      designDecision.decision_status !== 'ACCEPTED' ||
      designDecision.semantic_sha !== manifest?.acceptance?.semantic_sha
    ) {
      errors.push(`${candidatePaths.designDecision} must bind the accepted semantic SHA`);
    }
    for (const owner of ['engineering_design', 'architecture_security_platform']) {
      const evidence = designDecision.owner_decisions?.[owner];
      if (
        evidence?.status !== 'ACCEPTED' ||
        evidence.semantic_sha !== designDecision.semantic_sha ||
        !permanentEvidence.test(evidence.evidence_ref ?? '')
      ) {
        errors.push(`${candidatePaths.designDecision} owner ${owner} lacks exact-SHA evidence`);
      }
    }
  } else if (
    designDecision.decision_status !== 'PROPOSED' ||
    designDecision.semantic_sha !== undefined ||
    designDecision.owner_decisions?.engineering_design?.status !== 'PENDING' ||
    designDecision.owner_decisions?.architecture_security_platform?.status !== 'PENDING'
  ) {
    errors.push(`${candidatePaths.designDecision} Proposed owner evidence must remain Pending`);
  }

  const routes = designDecision.inventory?.routes ?? [];
  const screens = designDecision.inventory?.screens ?? [];
  const states = designDecision.inventory?.states ?? [];
  const routeIds = new Set(routes.map((route) => route.route_id));
  const screenIds = new Set(screens.map((screen) => screen.screen_id));
  const stateIds = new Set(states.map((state) => state.state_id));
  if (
    routes.length !== 5 ||
    screens.length !== 5 ||
    states.length !== 20 ||
    routeIds.size !== 5 ||
    screenIds.size !== 5 ||
    stateIds.size !== 20
  ) {
    errors.push(`${candidatePaths.designDecision} must define 5 routes/screens and 4 states each`);
  }
  for (const route of routes) {
    if (!screenIds.has(route.screen_id)) {
      errors.push(`${candidatePaths.designDecision} route ${route.route_id} has no screen`);
    }
    const kinds = new Set(
      states
        .filter((state) => state.screen_id === route.screen_id)
        .map((state) => state.state_kind),
    );
    if ([...['LOADING', 'EMPTY', 'ERROR', 'SUCCESS']].some((kind) => !kinds.has(kind))) {
      errors.push(`${candidatePaths.designDecision} screen ${route.screen_id} lacks four states`);
    }
  }
  const interactions = designDecision.interactions ?? [];
  const interactionIds = new Set(interactions.map((interaction) => interaction.interaction_id));
  for (const state of states) {
    if (!screenIds.has(state.screen_id)) {
      errors.push(`${candidatePaths.designDecision} state ${state.state_id} has no screen`);
    }
    for (const interactionId of state.interaction_ids ?? []) {
      if (!interactionIds.has(interactionId)) {
        errors.push(
          `${candidatePaths.designDecision} state ${state.state_id} has an unknown interaction`,
        );
      }
      const interaction = interactions.find(
        (candidate) => candidate.interaction_id === interactionId,
      );
      if (
        interaction?.screen_id !== state.screen_id ||
        interaction?.from_state_id !== state.state_id
      ) {
        errors.push(
          `${candidatePaths.designDecision} interaction ${interactionId} does not start from its declaring state`,
        );
      }
    }
  }
  const flowSteps = designDecision.primary_flow?.steps ?? [];
  if (
    flowSteps.length !== 5 ||
    flowSteps.some(
      (step, index) =>
        step.ordinal !== index + 1 ||
        !routeIds.has(step.route_id) ||
        !screenIds.has(step.screen_id) ||
        !stateIds.has(step.entry_state_id) ||
        !stateIds.has(step.outcome_state_id) ||
        !interactionIds.has(step.interaction_id),
    )
  ) {
    errors.push(`${candidatePaths.designDecision} primary flow is not contiguous and resolved`);
  }
  if (
    designDecision.responsive?.compact?.maximum_width_px >=
    designDecision.responsive?.expanded?.minimum_width_px
  ) {
    errors.push(`${candidatePaths.designDecision} responsive ranges overlap`);
  }
  if (
    designDecision.prototype_warning?.text !== 'Prototype only - not a live production system.' ||
    designDecision.prototype_warning?.visible_in_all_states !== true
  ) {
    errors.push(`${candidatePaths.designDecision} persistent prototype warning is invalid`);
  }
  if (
    designDecision.accessibility?.target !== 'WCAG_2_2_AA' ||
    designDecision.accessibility?.verification_claim !==
      'BASIC_AUTOMATED_SMOKE_ONLY_NO_CONFORMANCE_CLAIM'
  ) {
    errors.push(
      `${candidatePaths.designDecision} must distinguish the accessibility target from its no-conformance verification claim`,
    );
  }
}

if (packageLock && licenseReport && sbom) {
  const lockEntries = Object.entries(packageLock.packages ?? {}).filter(
    ([packagePath]) => packagePath,
  );
  const packageFacts = licenseReport.packages ?? [];
  const bomComponents = sbom.components ?? [];
  if (
    lockEntries.length !== 182 ||
    packageFacts.length !== lockEntries.length ||
    licenseReport.package_count !== lockEntries.length ||
    bomComponents.length !== lockEntries.length
  ) {
    errors.push(
      'AICO-004 lock, license evidence, and CycloneDX inventories must all contain 182 entries',
    );
  }
  const factsByPath = new Map(packageFacts.map((fact) => [fact.package_path, fact]));
  for (const [packagePath, entry] of lockEntries) {
    const fact = factsByPath.get(packagePath);
    if (
      !fact ||
      fact.version !== entry.version ||
      fact.integrity !== entry.integrity ||
      fact.spdx_license !== entry.license ||
      !rawDigestPattern.test(fact.license_text_digest ?? '') ||
      !['RUNTIME', 'DEV'].includes(fact.dependency_class) ||
      typeof fact.optional !== 'boolean' ||
      fact.lifecycle?.denied !== true ||
      !Array.isArray(fact.lifecycle?.preinstall) ||
      !Array.isArray(fact.lifecycle?.install) ||
      !Array.isArray(fact.lifecycle?.postinstall) ||
      !['NONE', 'NAPI_BINARY', 'PLATFORM_EXECUTABLE'].includes(fact.native?.kind) ||
      !Array.isArray(fact.native?.platforms)
    ) {
      errors.push(`${candidatePaths.licenses} has incomplete facts for ${packagePath}`);
      continue;
    }
    if (
      !existsSync(fact.license_text_path) ||
      sha256(readFileSync(fact.license_text_path)) !== fact.license_text_digest
    ) {
      errors.push(`${candidatePaths.licenses} license text digest fails for ${packagePath}`);
    }
  }
  if (manifest?.resolved_package_count !== lockEntries.length) {
    errors.push(`${paths.manifest} resolved package count must equal package-lock authority`);
  }
}

if (fileManifest) {
  for (const file of fileManifest.files ?? []) {
    const path = `docs/architecture/artifacts/aico-004/template-v1/${file.path}`;
    if (
      !existsSync(path) ||
      sha256(readFileSync(path)) !== file.sha256 ||
      readFileSync(path).length !== file.bytes
    ) {
      errors.push(`${candidatePaths.fileManifest} fails for ${file.path}`);
    }
  }
}

if (buildMetadata && provenance) {
  const descriptor = buildMetadata.descriptor;
  if (
    descriptor?.mediaType !== 'application/vnd.oci.image.manifest.v1+json' ||
    !prefixedDigestPattern.test(descriptor?.digest ?? '') ||
    provenance.candidateImageDigest !== descriptor.digest ||
    provenance.status !== 'MATERIALIZED_CANDIDATE' ||
    provenance.platform !== 'linux/amd64' ||
    provenance.dependencyInstall !== 'npm ci --ignore-scripts --no-audit --no-fund'
  ) {
    errors.push('AICO-004 dependency image metadata/provenance is incomplete or inconsistent');
  }
}

if (designDecision && manifest) {
  const expectedFileDigests = {
    archive: sha256File(candidatePaths.archive),
    packageLock: sha256File(candidatePaths.packageLock),
    sbom: sha256File(candidatePaths.sbom),
    licenses: sha256File(candidatePaths.licenses),
    designContract: sha256File(candidatePaths.designContract),
    designDecision: sha256File(candidatePaths.designDecision),
  };
  const declaredFileDigests = {
    archive: manifest.template?.artifact?.archive_digest,
    packageLock: manifest.acquisition?.lockfile?.digest,
    sbom: manifest.acquisition?.sbom?.digest,
    licenses: manifest.acquisition?.license_evidence?.digest,
    designContract: manifest.template?.design_contract?.digest,
    designDecision: manifest.sandbox_design_decision?.digest,
  };
  for (const name of Object.keys(expectedFileDigests)) {
    if (expectedFileDigests[name] !== declaredFileDigests[name]) {
      errors.push(`${paths.manifest} ${name} digest does not match its canonical file`);
    }
  }
  const dependencyImageDigest = buildMetadata?.descriptor?.digest;
  if (
    manifest.toolchain?.dependency_bundle_image?.digest !== dependencyImageDigest ||
    manifest.toolchain?.dependency_bundle_image_digest !== dependencyImageDigest
  ) {
    errors.push(`${paths.manifest} dependency image digest does not match OCI build metadata`);
  }
  if (
    manifest.sandbox_design_decision?.canonical_artifact_set_digest !==
    `sha256:${designDecision.canonical_artifact_set_digest}`
  ) {
    errors.push(`${paths.manifest} design artifact-set digest does not match authority`);
  }
}

if (!accepted && !proposed) {
  errors.push('ADR-009 status must be Proposed for AICO-004 owner acceptance or Accepted');
}
if (accepted) {
  if (!permanentEvidence.test(engineeringDesignEvidence ?? '')) {
    errors.push('Accepted ADR-009 requires permanent Engineering/Design evidence');
  }
  if (!permanentEvidence.test(securityPlatformEvidence ?? '')) {
    errors.push(
      'Accepted ADR-009 requires separate permanent Architecture/Security/Platform evidence',
    );
  }
} else if (engineeringDesignEvidence !== 'Pending' || securityPlatformEvidence !== 'Pending') {
  errors.push('Proposed ADR-009 must keep both human evidence fields Pending');
}
if (requireAccepted && !accepted) {
  errors.push(
    'AICO-004 Engineering/Design and Architecture/Security/Platform acceptance is pending',
  );
}

if (errors.length > 0) {
  console.error('AICO-004 architecture validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `AICO-004 architecture package complete; status=${accepted ? 'Accepted' : 'Proposed'}; threat_cases=${threatIds.size}; mutations=12.`,
);
if (!requireAccepted) console.log('Use --require-accepted before merging backend issue #16.');
