import { spawnSync } from 'node:child_process';

export function run(command, args, options = {}) {
  const windowsNpm = process.platform === 'win32' && command === 'npm';
  const executable = windowsNpm ? (process.env.ComSpec ?? 'cmd.exe') : command;
  const commandArgs = windowsNpm ? ['/d', '/s', '/c', 'npm', ...args] : args;
  const result = spawnSync(executable, commandArgs, {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 1}`);
  }
  return result;
}
