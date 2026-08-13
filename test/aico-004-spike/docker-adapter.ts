import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  canonicalDigest,
  type OutputEvidence,
  type OutputFileEvidence,
  type SandboxAdapterReceipt,
  type SandboxProofRequest,
  type SandboxReason,
} from './contracts';
import { ACCEPTED_DEPENDENCY_BUNDLE_DIGEST } from './fixture';
import type { SandboxProofAdapter } from './proof-service';

const IMAGE_TAG = 'aicompanyos/prototype-dependencies:aico004-proof';
const IMAGE_CONTEXT = 'docs/architecture/artifacts/aico-004';
const IMAGE_DOCKERFILE = `${IMAGE_CONTEXT}/dependency-image/Dockerfile`;
const BUILDKIT_IMAGE =
  'moby/buildkit:v0.27.0@sha256:054d632d0d7e94b11cdc6048674773499a5170cf7d8ce0c326daaff6be43c8e0';
const LABEL = 'aico.proof=aico-004';
const MAX_CAPTURE_BYTES = 64 * 1024;
const ENFORCE_NETWORK_ISOLATION = true;
const ENFORCE_CLOSED_GUEST_ENVIRONMENT = true;
const ENFORCE_RUNTIME_LIMITS = true;
const ENFORCE_TIMEOUT_CLASSIFICATION = true;
let forcedImageMaterializationCompleted = false;

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  stdoutBytes: number;
  stderrBytes: number;
  timedOut: boolean;
}

interface OutputInspection {
  files: OutputFileEvidence[];
  totalBytes: number;
}

const BUILD_SCRIPT = String.raw`
const {spawnSync}=require('node:child_process');
const commands=[
  ['/opt/aico-template/node_modules/prettier/bin/prettier.cjs',['--check','.']],
  ['/opt/aico-template/node_modules/eslint/bin/eslint.js',['.','--max-warnings=0']],
  ['/opt/aico-template/node_modules/typescript/bin/tsc',['--noEmit']],
  ['/opt/aico-template/node_modules/vitest/vitest.mjs',['run']],
  ['/opt/aico-template/node_modules/vite/bin/vite.js',['build']]
];
for(const [executable,args] of commands){
  const result=spawnSync(process.execPath,[executable,...args],{cwd:'/opt/aico-template/template',encoding:'utf8',env:{HOME:'/tmp',NODE_ENV:'production',PATH:'/usr/local/bin:/usr/bin:/bin'}});
  process.stdout.write('AICO_COMMAND='+executable.split('/').at(-2)+'\n');
  process.stdout.write(result.stdout||''); process.stderr.write(result.stderr||'');
  if(result.status!==0) process.exit(result.status||1);
}
`;

const DNS_PROBE_SCRIPT = String.raw`
require('node:dns').lookup('example.com',(error,address)=>{
  if(error){process.stderr.write('AICO_EGRESS_DENIED\n');process.exit(41);}
  process.stdout.write('AICO_UNEXPECTED_DNS='+address+'\n');process.exit(0);
});
`;

const IP_PROBE_SCRIPT = String.raw`
const socket=require('node:net').connect({host:'1.1.1.1',port:443});
socket.setTimeout(1500);
socket.on('connect',()=>{process.stdout.write('AICO_UNEXPECTED_IP_CONNECT\n');socket.destroy();process.exit(0);});
socket.on('error',()=>{process.stderr.write('AICO_EGRESS_DENIED\n');process.exit(41);});
socket.on('timeout',()=>{socket.destroy();process.stderr.write('AICO_EGRESS_DENIED\n');process.exit(41);});
`;

const CREDENTIAL_PROBE_SCRIPT = String.raw`
const fs=require('node:fs');
const forbidden=/(TOKEN|SECRET|PASSWORD|CREDENTIAL|DATABASE|JWT|AWS|S3|PROXY)/i;
const allowed=new Map([['HOME','/tmp'],['NODE_ENV','production'],['PATH','/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'],['AICO_PROOF_MODE','true'],['NODE_VERSION','24.18.0'],['YARN_VERSION','1.22.22']]);
const envFindings=Object.entries(process.env).filter(([key,value])=>key!=='HOSTNAME'&&(forbidden.test(key)||!allowed.has(key)||allowed.get(key)!==value));
const pathFindings=['/var/run/docker.sock','/run/secrets','/root/.aws','/root/.npmrc'].filter(path=>fs.existsSync(path));
const findings=envFindings.length+pathFindings.length;
process.stdout.write('AICO_CREDENTIAL_FINDINGS='+findings+'\n');
process.exit(findings===0?41:0);
`;

const LINK_PROBE_SCRIPT = String.raw`
const fs=require('node:fs');
const path='/opt/aico-template/template/dist/foreign-link';
try{fs.symlinkSync('/etc/passwd',path);}catch(error){process.stderr.write('AICO_LINK_DENIED='+error.code+'\n');process.exit(41);}
process.stdout.write('AICO_LINK_CREATED_FOR_COLLECTOR\n');
`;

const HOST_PROBE_SCRIPT = String.raw`
const fs=require('node:fs');
const forbidden=['/aico-host-sentinel','/var/run/docker.sock','/run/host-services','/host_mnt'];
const findings=forbidden.filter(path=>fs.existsSync(path));
process.stdout.write('AICO_HOST_FINDINGS='+findings.length+'\n');
process.exit(findings.length===0?41:0);
`;

const WORKSPACE_PROBE_SCRIPT = String.raw`
const fs=require('node:fs');
const forbidden=['/company-a-workspace','/workspace/company-a','/staging/company-a'];
const findings=forbidden.filter(path=>fs.existsSync(path));
process.stdout.write('AICO_FOREIGN_WORKSPACE_FINDINGS='+findings.length+'\n');
process.exit(findings.length===0?41:0);
`;

const CPU_PROBE_SCRIPT = String.raw`
let value=0;while(true){value=Math.imul(value+1,2654435761);if(value===42)process.stdout.write('');}
`;

const MEMORY_PID_PROBE_SCRIPT = String.raw`
const {spawn}=require('node:child_process');const children=[];
for(let i=0;i<64;i++){try{children.push(spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}));}catch{break;}}
const allocations=[];setInterval(()=>{allocations.push(Buffer.allocUnsafe(16*1024*1024).fill(7));},10);
`;

const STORAGE_PROBE_SCRIPT = String.raw`
const fs=require('node:fs');
for(let i=0;i<80;i++)fs.writeFileSync('/opt/aico-template/template/dist/file-'+String(i).padStart(3,'0')+'.txt','x');
fs.writeFileSync('/opt/aico-template/template/dist/flood.bin',Buffer.alloc(2*1024*1024,7));
process.stdout.write('AICO_STORAGE_OUTPUT_READY\n');
`;

const OUTPUT_FLOOD_SCRIPT = String.raw`
process.stdout.write('X'.repeat(256*1024));
`;

const TIMEOUT_SCRIPT = String.raw`
const {spawn}=require('node:child_process');
spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
setInterval(()=>{},1000);
`;

const OUTPUT_INSPECTOR_SCRIPT = String.raw`
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const root='/evidence';const files=[];
function walk(directory){for(const name of fs.readdirSync(directory).sort()){const absolute=path.join(directory,name);const relative='dist/'+path.relative(root,absolute).replaceAll('\\','/');const stat=fs.lstatSync(absolute);if(stat.isDirectory()){walk(absolute);continue;}let kind='SPECIAL',bytes=0,sha256='';if(stat.isSymbolicLink()){kind='SYMLINK';sha256=crypto.createHash('sha256').update(fs.readlinkSync(absolute)).digest('hex');}else if(stat.isFile()){kind='REGULAR';const body=fs.readFileSync(absolute);bytes=body.length;sha256=crypto.createHash('sha256').update(body).digest('hex');}files.push({path:relative,bytes,sha256:'sha256:'+sha256,mediaType:relative.endsWith('.html')?'text/html':relative.endsWith('.css')?'text/css':relative.endsWith('.js')?'application/javascript':'application/octet-stream',kind});}}
walk(root);process.stdout.write(JSON.stringify({files,totalBytes:files.reduce((sum,file)=>sum+file.bytes,0)}));
`;

function docker(args: readonly string[], allowFailure = false): string {
  try {
    return execFileSync('docker', [...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    }).trim();
  } catch (error) {
    if (allowFailure) return '';
    throw error;
  }
}

function compact(value: string): string {
  return value
    .replaceAll(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .slice(0, 24);
}

function appendBounded(chunks: Buffer[], chunk: Buffer, retained: { bytes: number }): void {
  retained.bytes += chunk.length;
  const buffered = chunks.reduce((sum, item) => sum + item.length, 0);
  if (buffered >= MAX_CAPTURE_BYTES) return;
  chunks.push(chunk.subarray(0, MAX_CAPTURE_BYTES - buffered));
}

async function startAttached(name: string, timeoutMs: number): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['start', '--attach', name], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const stdoutCount = { bytes: 0 };
    const stderrCount = { bytes: 0 };
    let timedOut = false;
    child.stdout.on('data', (chunk: Buffer) => appendBounded(stdout, chunk, stdoutCount));
    child.stderr.on('data', (chunk: Buffer) => appendBounded(stderr, chunk, stderrCount));
    child.on('error', reject);
    const timer = setTimeout(() => {
      timedOut = true;
      docker(['kill', name], true);
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        stdoutBytes: stdoutCount.bytes,
        stderrBytes: stderrCount.bytes,
        timedOut,
      });
    });
  });
}

function mediaSafeInspection(volume: string): OutputEvidence {
  const raw = docker([
    'run',
    '--rm',
    '--network',
    'none',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--mount',
    `type=volume,source=${volume},target=/evidence,readonly`,
    '--entrypoint',
    '/usr/local/bin/node',
    IMAGE_TAG,
    '-e',
    OUTPUT_INSPECTOR_SCRIPT,
  ]);
  const parsed = JSON.parse(raw) as OutputInspection;
  return {
    files: parsed.files,
    totalBytes: parsed.totalBytes,
    aggregateDigest: canonicalDigest(parsed.files),
  };
}

export function materializeAcceptedSandboxImage(): void {
  const currentId = docker(['image', 'inspect', IMAGE_TAG, '--format', '{{.Id}}'], true);
  const forceMaterialization =
    process.env.AICO004_FORCE_IMAGE_MATERIALIZATION === 'true' &&
    !forcedImageMaterializationCompleted;
  if (currentId === ACCEPTED_DEPENDENCY_BUNDLE_DIGEST && !forceMaterialization) return;
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'aico004-oci-'));
  const archive = join(temporaryDirectory, 'dependency-image.oci.tar');
  const builderName = `aico004-proof-${process.pid}-${randomUUID().slice(0, 8)}`;
  let builderCreated = false;
  try {
    docker([
      'buildx',
      'create',
      '--name',
      builderName,
      '--driver',
      'docker-container',
      '--driver-opt',
      `image=${BUILDKIT_IMAGE}`,
    ]);
    builderCreated = true;
    docker(['buildx', 'inspect', builderName, '--bootstrap']);
    docker([
      'buildx',
      'build',
      '--builder',
      builderName,
      '--output',
      `type=oci,dest=${archive},rewrite-timestamp=true`,
      '--provenance=false',
      '--sbom=false',
      '--build-arg',
      'SOURCE_DATE_EPOCH=0',
      '--file',
      IMAGE_DOCKERFILE,
      IMAGE_CONTEXT,
    ]);
    const index = JSON.parse(
      execFileSync('tar', ['-xOf', archive, 'index.json'], { encoding: 'utf8' }),
    ) as { manifests?: { digest?: string }[] };
    if (index.manifests?.[0]?.digest !== ACCEPTED_DEPENDENCY_BUNDLE_DIGEST) {
      throw new Error('Rebuilt OCI image does not match the frozen AICO-004 digest.');
    }
    docker(['load', '--input', archive]);
    docker(['tag', ACCEPTED_DEPENDENCY_BUNDLE_DIGEST, IMAGE_TAG]);
    forcedImageMaterializationCompleted = true;
  } finally {
    if (builderCreated) docker(['buildx', 'rm', builderName], true);
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export class DockerSandboxProofAdapter implements SandboxProofAdapter {
  public readonly executionEvidence: SandboxAdapterReceipt[] = [];

  public async execute(request: SandboxProofRequest): Promise<SandboxAdapterReceipt> {
    return this.run(request, false);
  }

  public async cancel(request: SandboxProofRequest): Promise<SandboxAdapterReceipt> {
    return this.run(request, true);
  }

  private async run(
    request: SandboxProofRequest,
    forceCancellation: boolean,
  ): Promise<SandboxAdapterReceipt> {
    materializeAcceptedSandboxImage();
    const suffix = `${process.pid}-${compact(request.workspaceId)}`;
    const workload = `aico004-${suffix}`;
    const outputVolume = `aico004-output-${suffix}`;
    const startedAt = new Date().toISOString();
    docker(['volume', 'create', '--label', LABEL, outputVolume]);
    const selected = this.selectScript(request);
    const outputMount = `type=volume,source=${outputVolume},target=/opt/aico-template/template/dist`;
    const createArguments = [
      'create',
      '--name',
      workload,
      '--label',
      LABEL,
      '--label',
      `aico.workspace=${compact(request.workspaceId)}`,
      '--network',
      ENFORCE_NETWORK_ISOLATION ? 'none' : 'bridge',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--pids-limit',
      String(ENFORCE_RUNTIME_LIMITS ? request.resourceLimits.pids : -1),
      '--memory',
      String(request.resourceLimits.memoryBytes),
      '--cpus',
      String(request.resourceLimits.cpuCount),
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=16777216,uid=1000,gid=1000,mode=0700',
      '--tmpfs',
      '/opt/aico-template/node_modules/.vite-temp:rw,nosuid,size=8388608,uid=1000,gid=1000,mode=0700',
      '--mount',
      outputMount,
      '--user',
      '1000:1000',
      '--workdir',
      '/opt/aico-template/template',
      '--env',
      'HOME=/tmp',
      '--env',
      'NODE_ENV=production',
      '--env',
      'AICO_PROOF_MODE=true',
      ...(ENFORCE_CLOSED_GUEST_ENVIRONMENT
        ? []
        : ['--env', 'AICO_LEAK_CANARY=AICO004_CREDENTIAL_CANARY_e1aa29']),
      '--entrypoint',
      '/usr/local/bin/node',
      IMAGE_TAG,
      '-e',
      selected.script,
    ];

    let cleanupComplete = false;
    let processResult: ProcessResult | undefined;
    let output: OutputEvidence | undefined;
    let runtimeControls: SandboxAdapterReceipt['runtimeControls'] | undefined;
    try {
      docker([
        'run',
        '--rm',
        '--network',
        'none',
        '--cap-drop',
        'ALL',
        '--cap-add',
        'CHOWN',
        '--security-opt',
        'no-new-privileges',
        '--user',
        '0:0',
        '--mount',
        `type=volume,source=${outputVolume},target=/seed`,
        '--entrypoint',
        '/bin/chown',
        IMAGE_TAG,
        '1000:1000',
        '/seed',
      ]);
      docker(createArguments);
      const inspection = JSON.parse(
        docker(['container', 'inspect', workload, '--format', '{{json .HostConfig}}']),
      ) as {
        NetworkMode?: string;
        ReadonlyRootfs?: boolean;
        PidsLimit?: number;
        Memory?: number;
        NanoCpus?: number;
        CapDrop?: string[];
        SecurityOpt?: string[];
        Binds?: string[] | null;
        Devices?: unknown[];
      };
      const user = docker(['container', 'inspect', workload, '--format', '{{.Config.User}}']);
      runtimeControls = this.assertRuntimeControls(inspection, request, user);
      processResult = await startAttached(
        workload,
        forceCancellation ? 250 : request.resourceLimits.wallTimeMs,
      );
      output = mediaSafeInspection(outputVolume);
    } finally {
      docker(['container', 'rm', '--force', workload], true);
      docker(['volume', 'rm', '--force', outputVolume], true);
      cleanupComplete =
        docker(['container', 'inspect', workload], true) === '' &&
        docker(['volume', 'inspect', outputVolume], true) === '';
    }

    if (processResult === undefined || runtimeControls === undefined) {
      throw new Error('Sandbox workload produced no result or runtime evidence.');
    }
    const classification = this.classify(request, processResult, forceCancellation);
    const credentialMatch = /AICO_CREDENTIAL_FINDINGS=(\d+)/.exec(processResult.stdout);
    const receipt: SandboxAdapterReceipt = {
      result: classification.result,
      ...(classification.reason === undefined ? {} : { reason: classification.reason }),
      workloadId: workload,
      startedAt,
      endedAt: new Date().toISOString(),
      exitCode: processResult.exitCode,
      signal: processResult.timedOut ? 'SIGKILL' : null,
      stdout: processResult.stdout,
      stderr: processResult.stderr,
      ...(output === undefined ? {} : { output }),
      cleanupComplete,
      runtimeClass: 'DEVELOPMENT_ONLY_RUNC',
      commandCount:
        request.executionProfile === 'BUILD'
          ? (processResult.stdout.match(/AICO_COMMAND=/g) ?? []).length
          : 1,
      networkReceiverHits:
        ['NETWORK_DNS_PROBE', 'NETWORK_IP_PROBE'].includes(request.executionProfile) &&
        processResult.exitCode === 0
          ? 1
          : 0,
      credentialFindings: Number(credentialMatch?.[1] ?? 0),
      runtimeControls,
    };
    this.executionEvidence.push(structuredClone(receipt));
    return receipt;
  }

  private selectScript(request: SandboxProofRequest): { script: string } {
    if (request.caseId === 'A4-T-HOST-01') return { script: HOST_PROBE_SCRIPT };
    if (request.caseId === 'A4-T-WORKSPACE-01') return { script: WORKSPACE_PROBE_SCRIPT };
    if (request.caseId === 'A4-T-CPU-01') return { script: CPU_PROBE_SCRIPT };
    if (request.caseId === 'A4-T-MEMORY-PID-01') return { script: MEMORY_PID_PROBE_SCRIPT };
    if (request.caseId === 'A4-T-STORAGE-01') return { script: STORAGE_PROBE_SCRIPT };
    switch (request.executionProfile) {
      case 'BUILD':
        return { script: BUILD_SCRIPT };
      case 'NETWORK_DNS_PROBE':
        return { script: DNS_PROBE_SCRIPT };
      case 'NETWORK_IP_PROBE':
        return { script: IP_PROBE_SCRIPT };
      case 'CREDENTIAL_PROBE':
        return { script: CREDENTIAL_PROBE_SCRIPT };
      case 'FS_LINK_PROBE':
        return { script: LINK_PROBE_SCRIPT };
      case 'LIMIT_PROBE':
        return { script: CPU_PROBE_SCRIPT };
      case 'OUTPUT_FLOOD':
        return { script: OUTPUT_FLOOD_SCRIPT };
      case 'TIMEOUT_PROBE':
      case 'CANCEL_PROBE':
        return { script: TIMEOUT_SCRIPT };
    }
  }

  private assertRuntimeControls(
    inspection: {
      NetworkMode?: string;
      ReadonlyRootfs?: boolean;
      PidsLimit?: number;
      Memory?: number;
      NanoCpus?: number;
      CapDrop?: string[];
      SecurityOpt?: string[];
      Binds?: string[] | null;
      Devices?: unknown[];
    },
    request: SandboxProofRequest,
    user: string,
  ): SandboxAdapterReceipt['runtimeControls'] {
    if (
      (ENFORCE_NETWORK_ISOLATION && inspection.NetworkMode !== 'none') ||
      inspection.ReadonlyRootfs !== true ||
      (ENFORCE_RUNTIME_LIMITS && inspection.PidsLimit !== request.resourceLimits.pids) ||
      inspection.Memory !== request.resourceLimits.memoryBytes ||
      inspection.NanoCpus !== request.resourceLimits.cpuCount * 1_000_000_000 ||
      !inspection.CapDrop?.includes('ALL') ||
      !inspection.SecurityOpt?.includes('no-new-privileges') ||
      user !== '1000:1000' ||
      (inspection.Binds?.length ?? 0) !== 0 ||
      (inspection.Devices?.length ?? 0) !== 0
    ) {
      throw new Error('Docker runtime control inspection failed closed.');
    }
    return {
      networkMode: inspection.NetworkMode ?? 'UNKNOWN',
      readonlyRootfs: inspection.ReadonlyRootfs === true,
      pidsLimit: inspection.PidsLimit ?? 0,
      memoryBytes: inspection.Memory ?? 0,
      nanoCpus: inspection.NanoCpus ?? 0,
      capDropAll: inspection.CapDrop?.includes('ALL') ?? false,
      noNewPrivileges: inspection.SecurityOpt?.includes('no-new-privileges') ?? false,
      user,
      hostBindCount: inspection.Binds?.length ?? 0,
      deviceCount: inspection.Devices?.length ?? 0,
    };
  }

  private classify(
    request: SandboxProofRequest,
    processResult: ProcessResult,
    forceCancellation: boolean,
  ): { result: SandboxAdapterReceipt['result']; reason?: SandboxReason } {
    if (forceCancellation) return { result: 'CANCELED', reason: 'CANCELED' };
    if (ENFORCE_TIMEOUT_CLASSIFICATION && processResult.timedOut) {
      return { result: 'FAILED', reason: 'TIMEOUT' };
    }
    if (!ENFORCE_TIMEOUT_CLASSIFICATION && request.executionProfile === 'TIMEOUT_PROBE') {
      return { result: 'SUCCEEDED' };
    }
    if (processResult.stdoutBytes > request.resourceLimits.stdoutBytes) {
      return { result: 'FAILED', reason: 'OUTPUT_LIMIT' };
    }
    if (processResult.stderrBytes > request.resourceLimits.stderrBytes) {
      return { result: 'FAILED', reason: 'OUTPUT_LIMIT' };
    }
    if (request.executionProfile === 'BUILD') {
      return processResult.exitCode === 0
        ? { result: 'SUCCEEDED' }
        : { result: 'FAILED', reason: 'INTEGRITY' };
    }
    if (request.caseId === 'A4-T-HOST-01' || request.caseId === 'A4-T-WORKSPACE-01') {
      return { result: 'FAILED', reason: 'FILESYSTEM_BOUNDARY' };
    }
    const violationSucceeded = processResult.exitCode === 0;
    const reasonByProfile: Partial<Record<SandboxProofRequest['executionProfile'], SandboxReason>> =
      {
        NETWORK_DNS_PROBE: 'EGRESS_DENIED',
        NETWORK_IP_PROBE: 'EGRESS_DENIED',
        CREDENTIAL_PROBE: 'CREDENTIAL_BOUNDARY',
        FS_LINK_PROBE: 'OUTPUT_INTEGRITY',
        LIMIT_PROBE: 'RESOURCE_LIMIT',
        OUTPUT_FLOOD: 'OUTPUT_LIMIT',
        TIMEOUT_PROBE: 'TIMEOUT',
      };
    return violationSucceeded
      ? { result: 'SUCCEEDED' }
      : { result: 'FAILED', reason: reasonByProfile[request.executionProfile] ?? 'SECURITY' };
  }
}

export function assertNoAico004Resources(): void {
  const containers = docker([
    'container',
    'ls',
    '--all',
    '--filter',
    `label=${LABEL}`,
    '--format',
    '{{.ID}}',
  ]);
  const volumes = docker(['volume', 'ls', '--filter', `label=${LABEL}`, '--format', '{{.Name}}']);
  if (containers !== '' || volumes !== '') {
    throw new Error(`AICO-004 cleanup residue: containers=${containers} volumes=${volumes}`);
  }
}

export interface UnknownOutcomeEvidence {
  result: 'UNKNOWN';
  reason: 'UNKNOWN_OUTCOME';
  workloadId: string;
  existingWorkloads: 1;
  startedNewWorkloads: 0;
  replacementProcessId: number;
  cleanupComplete: boolean;
}

export function startUnknownWorkloadForProof(logicalKey: string): string {
  materializeAcceptedSandboxImage();
  const workload = `aico004-unknown-${compact(logicalKey)}`;
  docker([
    'create',
    '--name',
    workload,
    '--label',
    LABEL,
    '--label',
    `aico.logical-key=${compact(logicalKey)}`,
    '--network',
    'none',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--pids-limit',
    '16',
    '--memory',
    '134217728',
    '--cpus',
    '0.25',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=4194304,uid=1000,gid=1000,mode=0700',
    '--user',
    '1000:1000',
    '--env',
    'HOME=/tmp',
    '--env',
    'NODE_ENV=production',
    '--entrypoint',
    '/usr/local/bin/node',
    IMAGE_TAG,
    '-e',
    TIMEOUT_SCRIPT,
  ]);
  docker(['start', workload]);
  const running = docker(['container', 'inspect', workload, '--format', '{{.State.Running}}']);
  if (running !== 'true') throw new Error('Unknown-outcome workload did not start.');
  return workload;
}

export function reconcileUnknownWorkloadForProof(workload: string): UnknownOutcomeEvidence {
  const labels = docker(['container', 'inspect', workload, '--format', '{{json .Config.Labels}}']);
  const parsed = JSON.parse(labels) as Record<string, string>;
  if (parsed['aico.proof'] !== 'aico-004' || parsed['aico.logical-key'] === undefined) {
    throw new Error('Replacement process refused an unbound workload.');
  }
  docker(['container', 'kill', workload], true);
  docker(['container', 'rm', '--force', workload]);
  const cleanupComplete = docker(['container', 'inspect', workload], true) === '';
  return {
    result: 'UNKNOWN',
    reason: 'UNKNOWN_OUTCOME',
    workloadId: workload,
    existingWorkloads: 1,
    startedNewWorkloads: 0,
    replacementProcessId: process.pid,
    cleanupComplete,
  };
}

export function acceptedImageManifestDigestFromProvenance(): string {
  const provenance = JSON.parse(
    readFileSync('docs/architecture/artifacts/aico-004/dependency-image/provenance.json', 'utf8'),
  ) as { candidateImageDigest?: string };
  if (provenance.candidateImageDigest === undefined) {
    throw new Error('Candidate image digest missing from frozen provenance.');
  }
  return provenance.candidateImageDigest;
}
