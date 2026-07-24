// Hard-timeout process control for validation broker children.
// Every broker-spawned child must go through runWithTimeout (Phase 1 §4.3 / §17).

import { spawn } from 'node:child_process';

/**
 * Kill a process and its descendants.
 * Windows: taskkill /T (process tree). POSIX: kill process group when detached.
 */
export async function killProcessTree(pid, { signal = 'SIGKILL' } = {}) {
  if (!Number.isFinite(pid) || pid <= 0) {
    return { ok: false, reason: 'invalid-pid' };
  }

  if (process.platform === 'win32') {
    const result = await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      killer.stdout?.on('data', (chunk) => { stdout += String(chunk); });
      killer.stderr?.on('data', (chunk) => { stderr += String(chunk); });
      killer.once('error', (error) => {
        resolve({ ok: false, reason: error.message, stdout, stderr });
      });
      killer.once('exit', (code) => {
        // taskkill returns non-zero when the process is already gone — still cleaned up.
        resolve({
          ok: code === 0 || /not found|not running/i.test(`${stdout}\n${stderr}`),
          exitCode: code,
          stdout,
          stderr,
        });
      });
    });
    return result;
  }

  try {
    process.kill(-pid, signal);
    return { ok: true, method: 'process-group' };
  } catch {
    try {
      process.kill(pid, signal);
      return { ok: true, method: 'pid' };
    } catch (error) {
      return { ok: false, reason: error.message };
    }
  }
}

/**
 * Spawn a child with a hard timeout and descendant cleanup.
 * @returns {{
 *   exitCode: number|null,
 *   signal: string|null,
 *   timedOut: boolean,
 *   durationMs: number,
 *   stdout: string,
 *   stderr: string,
 *   pidRecord: object,
 *   ownership: object,
 *   status: 'pass'|'fail'|'timeout'|'infra_error'
 * }}
 */
export async function runWithTimeout({
  command,
  args = [],
  cwd = process.cwd(),
  timeoutMs = 60_000,
  env = null,
  ownership = null,
  stdio = null,
  /** Called immediately after a successful spawn (pid known), before awaiting exit. */
  onSpawn = null,
} = {}) {
  if (!command) {
    return {
      exitCode: null,
      signal: null,
      timedOut: false,
      durationMs: 0,
      stdout: '',
      stderr: 'missing-command',
      pidRecord: null,
      ownership: ownership ?? null,
      status: 'infra_error',
    };
  }

  const hardTimeoutMs = Math.max(1, Number(timeoutMs) || 60_000);
  const startedAt = Date.now();
  const collectedStdout = [];
  const collectedStderr = [];
  let child;
  let timedOut = false;
  let timer = null;
  let killResult = null;

  try {
    child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: stdio ?? ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      // Detached process group on POSIX so kill(-pid) cleans descendants.
      detached: process.platform !== 'win32',
    });
  } catch (error) {
    return {
      exitCode: null,
      signal: null,
      timedOut: false,
      durationMs: Date.now() - startedAt,
      stdout: '',
      stderr: error?.message || String(error),
      pidRecord: null,
      ownership: ownership ?? null,
      status: 'infra_error',
    };
  }

  const pidRecord = {
    pid: child.pid ?? null,
    command,
    args: [...args],
    startedAt: new Date(startedAt).toISOString(),
    platform: process.platform,
  };

  // Reserve launch quota / notify ownership as soon as the child exists.
  if (typeof onSpawn === 'function' && pidRecord.pid) {
    try {
      await onSpawn(pidRecord);
    } catch (error) {
      // onSpawn failure must not orphan the child — kill tree and surface infra_error.
      try {
        await killProcessTree(child.pid);
      } catch {
        // ignore cleanup errors
      }
      return {
        exitCode: null,
        signal: null,
        timedOut: false,
        durationMs: Date.now() - startedAt,
        stdout: '',
        stderr: error?.message || String(error),
        pidRecord,
        ownership: ownership ?? null,
        status: 'infra_error',
      };
    }
  }

  if (child.stdout) {
    child.stdout.on('data', (chunk) => { collectedStdout.push(Buffer.from(chunk)); });
  }
  if (child.stderr) {
    child.stderr.on('data', (chunk) => { collectedStderr.push(Buffer.from(chunk)); });
  }

  const exitPromise = new Promise((resolve) => {
    child.once('error', (error) => {
      resolve({
        exitCode: null,
        signal: null,
        error: error?.message || String(error),
        infra: true,
      });
    });
    child.once('exit', (code, signal) => {
      resolve({
        exitCode: code,
        signal: signal ?? null,
        error: null,
        infra: false,
      });
    });
  });

  timer = setTimeout(async () => {
    timedOut = true;
    try {
      killResult = await killProcessTree(child.pid);
    } catch (error) {
      killResult = { ok: false, reason: error?.message || String(error) };
    }
  }, hardTimeoutMs);
  // Do not keep the event loop alive solely for the timer once the child exits.
  timer.unref?.();

  const exit = await exitPromise;
  if (timer) clearTimeout(timer);

  // If we timed out but the process is still around, ensure kill completed.
  if (timedOut && child.pid && !child.killed) {
    try {
      killResult = killResult ?? await killProcessTree(child.pid);
    } catch (error) {
      killResult = { ok: false, reason: error?.message || String(error) };
    }
  }

  const durationMs = Date.now() - startedAt;
  const stdout = Buffer.concat(collectedStdout).toString('utf8');
  const stderr = Buffer.concat(collectedStderr).toString('utf8')
    + (exit.error ? `\n${exit.error}` : '');

  const finishedAt = new Date().toISOString();
  Object.assign(pidRecord, {
    finishedAt,
    exitCode: exit.exitCode,
    signal: exit.signal,
    timedOut,
    killResult,
  });

  let status = 'pass';
  if (exit.infra) status = 'infra_error';
  else if (timedOut) status = 'timeout';
  else if ((exit.exitCode ?? 1) !== 0) status = 'fail';

  return {
    exitCode: exit.exitCode,
    signal: exit.signal,
    timedOut,
    durationMs,
    stdout,
    stderr,
    pidRecord,
    ownership: {
      ...(ownership ?? {}),
      browserOwned: ownership?.browserOwned ?? false,
      serverOwned: ownership?.serverOwned ?? false,
      probeId: ownership?.probeId ?? null,
      pid: child.pid ?? null,
    },
    status,
  };
}
