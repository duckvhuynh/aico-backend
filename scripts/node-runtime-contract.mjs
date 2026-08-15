import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const exactVersionPattern = /^\d+\.\d+\.\d+$/u;
const defaultRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedDockerBaseStages = ['dependencies', 'runtime'];

export function readNodeRuntimeContract(repositoryRoot = defaultRepositoryRoot) {
  const read = (path) => readFileSync(resolve(repositoryRoot, path), 'utf8');
  const packageJson = JSON.parse(read('package.json'));
  const packageLock = JSON.parse(read('package-lock.json'));
  const workflowDirectory = resolve(repositoryRoot, '.github', 'workflows');
  const workflows = Object.fromEntries(
    readdirSync(workflowDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.ya?ml$/u.test(entry.name))
      .map((entry) => [entry.name, read(`.github/workflows/${entry.name}`)]),
  );

  return {
    expectedNodeVersion: packageJson.engines?.node,
    expectedNpmVersion: packageJson.engines?.npm,
    nodeVersionFiles: {
      '.nvmrc': read('.nvmrc').trim(),
      '.node-version': read('.node-version').trim(),
      'package-lock.json root engines.node': packageLock.packages?.['']?.engines?.node,
    },
    npmVersionFiles: {
      'package.json packageManager': packageJson.packageManager,
      'package-lock.json root engines.npm': packageLock.packages?.['']?.engines?.npm,
    },
    npmrc: read('.npmrc'),
    dockerfile: read('Dockerfile'),
    workflows,
  };
}

function setupNodeSteps(source) {
  const lines = source.split(/\r?\n/u);
  const steps = [];
  for (let index = 0; index < lines.length; index += 1) {
    const setup = /^(\s*)-\s+uses:\s*['"]?actions\/setup-node@[^\s'"]+['"]?\s*$/iu.exec(
      lines[index],
    );
    if (!setup) continue;
    const stepIndent = setup[1].length;
    const pins = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const nextStep = /^(\s*)-\s+/u.exec(lines[cursor]);
      if (nextStep && nextStep[1].length === stepIndent) break;
      const pin = /^\s*node-version:\s*['"]?([^\s'"]+)['"]?\s*$/iu.exec(lines[cursor]);
      if (pin) pins.push(pin[1]);
    }
    steps.push({ line: index, pins });
  }
  return steps;
}

function workflowJobs(source) {
  const lines = source.split(/\r?\n/u);
  const jobsLine = lines.findIndex((line) => /^\s*jobs:\s*(?:#.*)?$/iu.test(line));
  if (jobsLine < 0) return [];
  const jobsIndent = /^\s*/u.exec(lines[jobsLine])?.[0].length ?? 0;
  let jobIndent;
  let jobsEnd = lines.length;
  const starts = [];

  for (let index = jobsLine + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(?:#.*)?$/u.test(line)) continue;
    const indentation = /^\s*/u.exec(line)?.[0].length ?? 0;
    if (indentation <= jobsIndent) {
      jobsEnd = index;
      break;
    }
    if (jobIndent === undefined) jobIndent = indentation;
    if (indentation !== jobIndent) continue;
    const job = /^\s*['"]?([A-Za-z0-9_-]+)['"]?:\s*(?:#.*)?$/u.exec(line);
    if (job) starts.push({ line: index, name: job[1] });
  }

  return starts.map((start, index) => {
    const end = starts[index + 1]?.line ?? jobsEnd;
    return { name: start.name, source: lines.slice(start.line, end).join('\n') };
  });
}

function isNodeToolingCommand(line) {
  const command = line.replace(/^\s*(?:-\s*)?(?:run:\s*)?/iu, '');
  return /(?:^|(?:&&|\|\||[|;])\s*)(?:node|npm|npx)(?:\s|$)/iu.test(command);
}

export function runtimeContractProblems(contract, actualNodeVersion, actualNpmVersion) {
  const problems = [];
  const expectedNodeVersion = contract.expectedNodeVersion;
  const expectedNpmVersion = contract.expectedNpmVersion;
  const npmBootstrap = `npm install --global npm@${expectedNpmVersion} --ignore-scripts --no-audit --no-fund`;
  const workflowBootstrapPattern = new RegExp(
    `^\\s*(?:-\\s*)?(?:run:\\s*)?${npmBootstrap.replaceAll('.', '\\.')}(?:\\s*(?:&&|$))`,
    'iu',
  );

  if (typeof expectedNodeVersion !== 'string' || !exactVersionPattern.test(expectedNodeVersion)) {
    problems.push('package.json engines.node must be one exact semantic version.');
    return problems;
  }
  if (typeof expectedNpmVersion !== 'string' || !exactVersionPattern.test(expectedNpmVersion)) {
    problems.push('package.json engines.npm must be one exact semantic version.');
    return problems;
  }

  for (const [path, version] of Object.entries(contract.nodeVersionFiles)) {
    if (version !== expectedNodeVersion) {
      problems.push(
        `${path} must pin Node ${expectedNodeVersion}; found ${JSON.stringify(version)}.`,
      );
    }
  }
  for (const [path, version] of Object.entries(contract.npmVersionFiles)) {
    const expected =
      path === 'package.json packageManager' ? `npm@${expectedNpmVersion}` : expectedNpmVersion;
    if (version !== expected) {
      problems.push(`${path} must pin ${expected}; found ${JSON.stringify(version)}.`);
    }
  }

  const npmConfiguration = new Map(
    contract.npmrc
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        return separator < 0
          ? [line, '']
          : [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
  if (npmConfiguration.get('engine-strict') !== 'true') {
    problems.push('.npmrc must set engine-strict=true.');
  }

  const nodeBaseDeclarations = Array.from(
    contract.dockerfile.matchAll(/^FROM\s+(?:--platform=\S+\s+)?node:[^\r\n]+$/gimu),
  );
  const dockerBaseStages = Array.from(
    contract.dockerfile.matchAll(
      /^FROM\s+(?:--platform=\S+\s+)?node:([^\s]+)\s+AS\s+([^\s]+)\s*$/gimu,
    ),
    (match) => ({ imageTag: match[1], stage: match[2].toLowerCase() }),
  );
  if (nodeBaseDeclarations.length !== dockerBaseStages.length) {
    problems.push(
      'Every Dockerfile Node base declaration must use an explicit required stage alias.',
    );
  }
  const dockerStageNames = dockerBaseStages.map(({ stage }) => stage).sort();
  if (dockerStageNames.join('\n') !== [...expectedDockerBaseStages].sort().join('\n')) {
    problems.push(
      `Dockerfile Node base stages must be exactly ${expectedDockerBaseStages.join(', ')}; found ${dockerStageNames.join(', ') || 'none'}.`,
    );
  }
  for (const { imageTag, stage } of dockerBaseStages) {
    const version = /^(\d+\.\d+\.\d+)(?:-|@|$)/u.exec(imageTag)?.[1];
    if (version !== expectedNodeVersion) {
      problems.push(
        `Dockerfile stage ${stage} must pin Node ${expectedNodeVersion}; found ${JSON.stringify(imageTag)}.`,
      );
    }
  }
  const dependenciesStageOffset = contract.dockerfile.search(
    /^FROM\s+(?:--platform=\S+\s+)?node:[^\r\n]+\s+AS\s+dependencies\s*$/imu,
  );
  const nextStageOffset = contract.dockerfile.indexOf('\nFROM ', dependenciesStageOffset + 1);
  const dependenciesStage = contract.dockerfile.slice(
    dependenciesStageOffset,
    nextStageOffset < 0 ? undefined : nextStageOffset,
  );
  const dockerNpmBootstrapOffset = dependenciesStage.indexOf(npmBootstrap);
  const dockerNpmCiOffset = dependenciesStage.search(/\bnpm\s+ci\b/u);
  if (
    dependenciesStageOffset < 0 ||
    dockerNpmBootstrapOffset < 0 ||
    dockerNpmCiOffset < 0 ||
    dockerNpmBootstrapOffset >= dockerNpmCiOffset
  ) {
    problems.push(`Dockerfile dependencies stage must run '${npmBootstrap}' before npm ci.`);
  }

  for (const [name, source] of Object.entries(contract.workflows)) {
    const jobs = workflowJobs(source);
    const fileUsesNodeCommand = source.split(/\r?\n/u).some(isNodeToolingCommand);
    if (fileUsesNodeCommand && jobs.length === 0) {
      problems.push(`.github/workflows/${name} runs Node tooling outside a parseable jobs block.`);
    }
    for (const job of jobs) {
      const lines = job.source.split(/\r?\n/u);
      const firstToolingLine = lines.findIndex(isNodeToolingCommand);
      const usesNodeCommand = firstToolingLine >= 0;
      const setups = setupNodeSteps(job.source);
      const location = `.github/workflows/${name} job ${job.name}`;

      if (usesNodeCommand && setups.length === 0) {
        problems.push(`${location} runs Node tooling without actions/setup-node.`);
        continue;
      }
      for (const setup of setups) {
        if (setup.pins.length !== 1) {
          problems.push(`${location} setup-node step must contain exactly one node-version pin.`);
        } else if (setup.pins[0] !== expectedNodeVersion) {
          problems.push(
            `${location} must pin Node ${expectedNodeVersion}; found ${JSON.stringify(setup.pins[0])}.`,
          );
        }
      }
      if (!usesNodeCommand) continue;
      if (
        setups[0].line >= firstToolingLine ||
        !workflowBootstrapPattern.test(lines[firstToolingLine])
      ) {
        problems.push(
          `${location} must setup Node before running '${npmBootstrap}' as its first Node tooling command.`,
        );
      }
      for (const [setupIndex, setup] of setups.entries()) {
        const nextSetupLine = setups[setupIndex + 1]?.line ?? lines.length;
        const followingLines = lines.slice(setup.line + 1, nextSetupLine);
        const firstCommand = followingLines.findIndex(isNodeToolingCommand);
        if (firstCommand < 0 || !workflowBootstrapPattern.test(followingLines[firstCommand])) {
          problems.push(
            `${location} must run '${npmBootstrap}' as the first Node tooling command after every setup-node step.`,
          );
        }
      }
    }
  }

  if (actualNodeVersion !== expectedNodeVersion) {
    problems.push(
      `Unsupported Node.js runtime ${actualNodeVersion}. Expected exactly ${expectedNodeVersion}; activate it with your version manager before running repository commands.`,
    );
  }
  if (actualNpmVersion !== expectedNpmVersion) {
    problems.push(
      `Unsupported npm runtime ${actualNpmVersion ?? 'unknown'}. Expected exactly ${expectedNpmVersion}; activate the repository's exact package-manager version before running repository commands.`,
    );
  }

  return problems;
}

export function activeNpmVersion() {
  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) return undefined;
  try {
    const version = execFileSync(process.execPath, [npmExecPath, '--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5_000,
      windowsHide: true,
    }).trim();
    return exactVersionPattern.test(version) ? version : undefined;
  } catch {
    return undefined;
  }
}

export function assertSupportedNodeRuntime({
  repositoryRoot = defaultRepositoryRoot,
  actualNodeVersion = process.versions.node,
  actualNpmVersion = activeNpmVersion(),
} = {}) {
  const contract = readNodeRuntimeContract(repositoryRoot);
  const problems = runtimeContractProblems(contract, actualNodeVersion, actualNpmVersion);
  if (problems.length > 0) {
    throw new Error(`Node runtime preflight failed:\n- ${problems.join('\n- ')}`);
  }
  console.log(
    `Node/npm runtime preflight passed: Node ${contract.expectedNodeVersion}, npm ${contract.expectedNpmVersion}.`,
  );
}
