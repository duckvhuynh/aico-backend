import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './process-utils.mjs';

const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const expectedSha = process.env.AICO_PROVIDER_DECISION_EXPECTED_SHA?.trim() || headSha;
const expectedProductTraceSha = '28d2bc0ecd9e5676a4e87f1bf5e81c602a1a0714';
if (!/^[a-f0-9]{40}$/.test(expectedSha) || expectedSha !== headSha) {
  throw new Error('AICO-005 decision evidence must bind the exact 40-hex HEAD SHA.');
}

run('npm', ['run', 'verify:provider-architecture']);

const adr = readFileSync(
  'docs/architecture/011-model-provider-employee-runtime-selection.md',
  'utf8',
);
const evidenceMap = readFileSync('docs/delivery/AICO_005_PROVIDER_EVIDENCE.md', 'utf8');
const accepted = /^\*\*Status:\*\* Accepted for AICO-005\b/m.test(adr);
const reconciled =
  accepted &&
  /^\*\*Accepted-mode verification artifact digest:\*\* sha256:[a-f0-9]{64}$/m.test(evidenceMap);
if (reconciled) {
  run('node', ['scripts/validate-aico-005-architecture.mjs', '--require-reconciled']);
}

const worktreeStatus = execFileSync('git', ['status', '--porcelain'], {
  encoding: 'utf8',
}).trim();
if (worktreeStatus) {
  throw new Error('AICO-005 decision evidence requires a clean worktree after validation.');
}

const examplePaths = readdirSync('docs/contracts/examples')
  .filter((name) => /^model-provider-.*\.json$/.test(name))
  .sort()
  .map((name) => `docs/contracts/examples/${name}`);
const subjectPaths = [
  '.node-version',
  '.npmrc',
  '.nvmrc',
  '.github/workflows/aico-005-provider-runtime-proof.yml',
  '.github/workflows/aico-008-alpha-policy.yml',
  '.github/workflows/ci.yml',
  'Dockerfile',
  'docs/architecture/011-model-provider-employee-runtime-selection.md',
  'docs/contracts/MODEL_PROVIDER_RUNTIME.md',
  'docs/contracts/schemas/model-provider-runtime.v1.schema.json',
  ...examplePaths,
  'docs/delivery/AICO_005_AEO_AUDIT.md',
  'docs/delivery/AICO_005_PROVIDER_EVIDENCE.md',
  'docs/delivery/AICO_005_PRODUCT_TRACE.json',
  'package-lock.json',
  'package.json',
  'scripts/aico-005-decision-evidence.mjs',
  'scripts/node-runtime-contract.mjs',
  'scripts/process-utils.mjs',
  'scripts/prove-aico-005-validation-fail-closed.mjs',
  'scripts/prove-node-runtime-preflight.mjs',
  'scripts/validate-aico-005-architecture.mjs',
  'scripts/validate-node-runtime.mjs',
  'scripts/verification-gates.mjs',
  'scripts/verify-ci-entry.mjs',
  'scripts/verify-ci.mjs',
].sort();

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
};
const canonicalJson = (value) => JSON.stringify(canonicalize(value));
const fileDigests = subjectPaths.map((path) => ({
  path,
  digest: sha256(readFileSync(path)),
}));
const evidenceField = (label) =>
  evidenceMap.match(new RegExp(`^\\*\\*${label}:\\*\\* (.+)$`, 'm'))?.[1]?.trim();
const productTraceSha = evidenceMap.match(/^\*\*Product trace SHA:\*\* `([a-f0-9]{40})`$/m)?.[1];
if (productTraceSha !== expectedProductTraceSha) {
  throw new Error(
    `AICO-005 evidence must bind reviewed Product trace SHA ${expectedProductTraceSha}.`,
  );
}
const repository = process.env.GITHUB_REPOSITORY || 'duckvhuynh/aico-backend';
const productTrace = JSON.parse(readFileSync('docs/delivery/AICO_005_PRODUCT_TRACE.json', 'utf8'));
if (productTrace.commit_sha !== productTraceSha) {
  throw new Error('AICO-005 Product trace manifest and evidence SHA disagree.');
}
if (reconciled) {
  const acceptedMetadataSha =
    evidenceField('Accepted metadata SHA')?.match(/^`?([a-f0-9]{40})`?$/)?.[1];
  const acceptedHostedSha = evidenceField('Accepted-mode hosted verification SHA')?.match(
    /^`?([a-f0-9]{40})`?$/,
  )?.[1];
  const acceptedRunId = evidenceField('Accepted-mode hosted verification')?.match(
    /^https:\/\/github\.com\/duckvhuynh\/aico-backend\/actions\/runs\/(\d+)$/,
  )?.[1];
  const acceptedArtifactDigest = evidenceField('Accepted-mode verification artifact digest');
  if (!acceptedMetadataSha || acceptedHostedSha !== acceptedMetadataSha || !acceptedRunId) {
    throw new Error('AICO-005 reconciled evidence has inconsistent Accepted-run identity.');
  }

  const artifactDirectory = mkdtempSync(join(tmpdir(), 'aico-005-accepted-artifact-'));
  try {
    const acceptedRun = JSON.parse(
      execFileSync(
        'gh',
        [
          'run',
          'view',
          acceptedRunId,
          '--repo',
          repository,
          '--json',
          'conclusion,event,headSha,status,url,workflowName',
        ],
        { encoding: 'utf8' },
      ),
    );
    if (
      acceptedRun.status !== 'completed' ||
      acceptedRun.conclusion !== 'success' ||
      acceptedRun.headSha !== acceptedMetadataSha ||
      acceptedRun.url !== evidenceField('Accepted-mode hosted verification') ||
      acceptedRun.workflowName !== 'Backend CI' ||
      acceptedRun.event !== 'pull_request'
    ) {
      throw new Error('AICO-005 Accepted-mode hosted run is not successful on its metadata SHA.');
    }
    execFileSync(
      'gh',
      [
        'run',
        'download',
        acceptedRunId,
        '--repo',
        repository,
        '--name',
        `aico-005-provider-decision-${acceptedMetadataSha}`,
        '--dir',
        artifactDirectory,
      ],
      { stdio: 'ignore' },
    );
    const acceptedArtifact = JSON.parse(
      readFileSync(join(artifactDirectory, 'aico-005-provider-decision.json'), 'utf8'),
    );
    const { self_digest: priorSelfDigest, ...priorManifest } = acceptedArtifact;
    const recomputedDigest = sha256(Buffer.from(canonicalJson(priorManifest), 'utf8'));
    if (
      priorSelfDigest !== acceptedArtifactDigest ||
      recomputedDigest !== acceptedArtifactDigest ||
      priorManifest.commit_sha !== acceptedMetadataSha ||
      priorManifest.decision_status !== 'ACCEPTED_TRANSITION' ||
      priorManifest.result !== 'PASSED' ||
      priorManifest.repository !== repository ||
      String(priorManifest.hosted_run?.run_id) !== acceptedRunId
    ) {
      throw new Error(
        'AICO-005 retained Accepted-transition artifact failed identity or digest checks.',
      );
    }
    const expectedAcceptedFiles = subjectPaths.map((path) => ({
      path,
      digest: sha256(execFileSync('git', ['show', `${acceptedMetadataSha}:${path}`])),
    }));
    if (
      priorManifest.file_count !== expectedAcceptedFiles.length ||
      canonicalJson(priorManifest.files) !== canonicalJson(expectedAcceptedFiles)
    ) {
      throw new Error(
        'AICO-005 retained Accepted-transition artifact does not bind its commit files.',
      );
    }
  } finally {
    rmSync(artifactDirectory, { recursive: true, force: true });
  }
}
const mutationSource = readFileSync('scripts/prove-aico-005-validation-fail-closed.mjs', 'utf8');
const mutationObject = mutationSource.match(/const probes = \{([\s\S]+?)^\};/m)?.[1] ?? '';
const mutationRegistry = [...mutationObject.matchAll(/^\s{2}'([^']+)':/gm)]
  .map((match) => match[1])
  .sort();
if (mutationRegistry.length !== 37 || new Set(mutationRegistry).size !== mutationRegistry.length) {
  throw new Error('AICO-005 decision evidence requires the exact 37-item mutation registry.');
}
const wireContractRegistry = [
  'aico.model-provider-circuit-decision',
  'aico.model-provider-configuration',
  'aico.model-provider-evidence',
  'aico.model-provider-invocation-request',
  'aico.model-provider-invocation-result',
  'aico.model-provider-repair-request',
  'aico.model-provider-target-decision',
];
const prohibitedPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
];
const prohibitedContentHits = subjectPaths.reduce((count, path) => {
  const value = readFileSync(path, 'utf8');
  return count + prohibitedPatterns.filter((pattern) => pattern.test(value)).length;
}, 0);
if (prohibitedContentHits !== 0) {
  throw new Error('AICO-005 decision evidence found prohibited secret material.');
}
const branch =
  process.env.GITHUB_HEAD_REF?.trim() ||
  process.env.GITHUB_REF_NAME?.trim() ||
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim() ||
  'DETACHED_HEAD';
const commitTimestamp = execFileSync('git', ['show', '-s', '--format=%cI', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const status = reconciled ? 'ACCEPTED_RECONCILED' : accepted ? 'ACCEPTED_TRANSITION' : 'PROPOSED';
const manifest = {
  schema_version: 'aico.a5-decision-evidence/1.0',
  issue: 'duckvhuynh/aico-backend#31',
  parent_issue: 'duckvhuynh/aicompanyos#5',
  change_parent_issue: 'duckvhuynh/aicompanyos#9',
  historical_decision_issue: 'duckvhuynh/aico-backend#25',
  historical_proof_issue: 'duckvhuynh/aico-backend#26',
  repository,
  branch,
  commit_sha: headSha,
  product_trace: {
    ...productTrace,
    manifest_digest: sha256(readFileSync('docs/delivery/AICO_005_PRODUCT_TRACE.json')),
  },
  commit_timestamp: commitTimestamp,
  generated_at: new Date().toISOString(),
  decision_status: status,
  result: 'PASSED',
  environment: {
    kind: process.env.GITHUB_ACTIONS === 'true' ? 'GITHUB_ACTIONS' : 'LOCAL',
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
  },
  hosted_run: {
    run_id: process.env.GITHUB_RUN_ID || null,
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || null,
    workflow: process.env.GITHUB_WORKFLOW || null,
  },
  artifact: {
    name: `aico-005-provider-decision-${headSha}`,
    path: '.aico-evidence/aico-005-provider-decision.json',
    retention_days: 90,
  },
  assertions: [
    { id: 'A5-EVIDENCE-STRUCTURE', outcome: 'PASS' },
    { id: 'A5-EVIDENCE-AJV-2020-12', outcome: 'PASS' },
    { id: 'A5-EVIDENCE-MUTATION-EQUALITY', outcome: 'PASS' },
    { id: 'A5-EVIDENCE-SECRET-ABSENCE', outcome: 'PASS' },
    { id: 'A5-EVIDENCE-CLEAN-TREE', outcome: 'PASS' },
    { id: 'A5-EVIDENCE-NO-EXTERNAL-PROVIDER', outcome: 'PASS' },
  ],
  wire_contract_registry: wireContractRegistry,
  fixture_registry: examplePaths,
  mutation_registry: mutationRegistry,
  summaries: {
    closed_wire_contract_count: wireContractRegistry.length,
    fixture_count: examplePaths.length,
    fail_closed_mutation_count: mutationRegistry.length,
    skipped_count: 0,
    duplicate_count: 0,
    surviving_mutation_count: 0,
    prohibited_content_hits: prohibitedContentHits,
    unauthorized_state_effects: 0,
    unauthorized_artifact_effects: 0,
    unauthorized_tool_effects: 0,
    external_provider_activated: false,
    external_network_requests: 0,
    external_cost_micros: '0',
  },
  owner_evidence: {
    architecture_ai: evidenceMap.match(/^\*\*Architecture\/AI evidence:\*\* (.+)$/m)?.[1],
    product_legal_security: evidenceMap.match(
      /^\*\*Product \+ Legal\/Security evidence:\*\* (.+)$/m,
    )?.[1],
  },
  file_count: fileDigests.length,
  files: fileDigests,
};
const evidence = {
  ...manifest,
  self_digest: sha256(Buffer.from(canonicalJson(manifest), 'utf8')),
};
const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
if (Buffer.byteLength(serialized, 'utf8') > 32_768) {
  throw new Error('AICO-005 decision evidence exceeded the 32 KiB bound.');
}

mkdirSync('.aico-evidence', { recursive: true });
writeFileSync('.aico-evidence/aico-005-provider-decision.json', serialized, 'utf8');
const roundTripped = JSON.parse(
  readFileSync('.aico-evidence/aico-005-provider-decision.json', 'utf8'),
);
const recordedSelfDigest = roundTripped.self_digest;
delete roundTripped.self_digest;
if (sha256(Buffer.from(canonicalJson(roundTripped), 'utf8')) !== recordedSelfDigest) {
  throw new Error('AICO-005 decision evidence self-digest did not round-trip canonically.');
}
console.log(`AICO-005 decision evidence passed for ${headSha}; artifact ${evidence.self_digest}.`);
