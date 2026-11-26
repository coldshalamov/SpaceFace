'use strict';
// How Windows schedules the game's processes.
//
// Windows sorts every process into a quality-of-service class. A window that is focused gets the
// high class (performance cores, full clock); a visible window that is not focused gets a middle
// class, and on this 15 W hybrid chip its threads then lose out when anything else is busy. Two
// knobs decide it for a process: its priority class, and its "power throttling" state. A process
// may opt out of throttling explicitly (always the high class) instead of leaving it to focus.
//
// Measured in the referee's own setup (2026-11-22). Best case, Foundry round 2, one run switching
// state every 10 s in a shuffled order with six other cores kept busy: the frame callback was
// 24.8 ms p50 as an unfocused window, 24.3 with above-normal priority alone, 22.3 with the
// throttling opt-out alone and 18.8 with both. Typical case, ten ordinary referee runs that play
// the same fight both ways: the callback was between 2.0 ms slower and 9.3 ms faster with both
// applied, median about 3 ms faster, and frames a second were not reliably higher. A fixed
// arithmetic loop ran at the same speed in every state, so whatever is gained is not clock speed.
// What Windows gives a window that really is focused has not been measured here (the referee's
// window never takes focus); stating both for the game's own processes removes the question.
//
// Node can set the priority class (os.setPriority). The throttling state needs one Win32 call
// (SetProcessInformation, ProcessPowerThrottling) that Node and Electron do not expose, so it is
// made by a short PowerShell script, once per change of state, never per frame.

const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');

const IS_WINDOWS = process.platform === 'win32';

// control=1 (execution speed) with state=0: never throttled. control=0: Windows decides by focus.
function powerShellScript(pids, optOut) {
  const list = pids.filter((p) => Number.isInteger(p) && p > 0).join(',');
  return `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class SfSched {
  [StructLayout(LayoutKind.Sequential)] public struct PT { public uint Version; public uint ControlMask; public uint StateMask; }
  [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool SetProcessInformation(IntPtr h, int cls, ref PT info, int size);
  public static string Set(int pid, uint control) {
    IntPtr h = OpenProcess(0x0200, false, pid);
    if (h == IntPtr.Zero) return "open-failed-" + Marshal.GetLastWin32Error();
    var s = new PT { Version = 1, ControlMask = control, StateMask = 0 };
    bool ok = SetProcessInformation(h, 4, ref s, Marshal.SizeOf(s));
    int err = Marshal.GetLastWin32Error();
    CloseHandle(h);
    return ok ? "ok" : ("failed-" + err);
  }
}
'@
$r = foreach ($p in '${list}'.Split(',')) { if ($p) { "$p=" + [SfSched]::Set([int]$p, ${optOut ? 1 : 0}) } }
[Console]::Out.Write(($r -join ' '))
`;
}

function powerShellArgs(pids, optOut) {
  const encoded = Buffer.from(powerShellScript(pids, optOut), 'utf16le').toString('base64');
  return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded];
}

function summarize(text, pids) {
  const parts = String(text || '').trim().split(/\s+/).filter(Boolean);
  const ok = parts.filter((p) => /=ok$/.test(p)).length;
  return { ok: parts.length > 0 && ok === parts.length, applied: ok, of: pids.length, detail: parts.join(' ') };
}

/** Opt the processes out of power throttling (true) or hand the decision back to Windows (false). */
function setPowerThrottlingOptOut(pids, optOut, { timeoutMs = 20_000 } = {}) {
  if (!IS_WINDOWS) return Promise.resolve({ ok: false, applied: 0, of: pids.length, detail: 'not Windows' });
  return new Promise((resolve) => {
    let out = ''; let done = false;
    const finish = (result) => { if (!done) { done = true; resolve(result); } };
    try {
      const child = spawn('powershell.exe', powerShellArgs(pids, optOut), { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      const timer = setTimeout(() => { try { child.kill(); } catch (_) {} finish({ ok: false, applied: 0, of: pids.length, detail: 'timed out' }); }, timeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
      child.stdout.on('data', (chunk) => { out += chunk; });
      child.on('error', (error) => { clearTimeout(timer); finish({ ok: false, applied: 0, of: pids.length, detail: String(error && error.message).slice(0, 120) }); });
      child.on('close', () => { clearTimeout(timer); finish(summarize(out, pids)); });
    } catch (error) {
      finish({ ok: false, applied: 0, of: pids.length, detail: String(error && error.message).slice(0, 120) });
    }
  });
}

function setPowerThrottlingOptOutSync(pids, optOut, { timeoutMs = 30_000 } = {}) {
  if (!IS_WINDOWS) return { ok: false, applied: 0, of: pids.length, detail: 'not Windows' };
  try {
    const run = spawnSync('powershell.exe', powerShellArgs(pids, optOut), { windowsHide: true, encoding: 'utf8', timeout: timeoutMs });
    return summarize(run.stdout, pids);
  } catch (error) {
    return { ok: false, applied: 0, of: pids.length, detail: String(error && error.message).slice(0, 120) };
  }
}

/** Priority class for each process; returns how many took it. */
function setPriorityClass(pids, priority) {
  let applied = 0;
  for (const pid of pids) {
    if (!Number.isInteger(pid) || pid <= 0) continue;
    try { os.setPriority(pid, priority); applied++; } catch (_) { /* gone or not ours */ }
  }
  return applied;
}

function readPriorityClass(pid) {
  try { return os.getPriority(pid); } catch (_) { return null; }
}

/**
 * What a focused player's game gets, applied without focus (the referee's window never takes it):
 * above-normal priority and the throttling opt-out. `focused: false` returns both to what an
 * unfocused window has. Synchronous; for harnesses only.
 */
function applyFocusedSchedulingSync(pids, focused, { normalPids = pids } = {}) {
  const ABOVE = os.constants.priority.PRIORITY_ABOVE_NORMAL;
  const NORMAL = os.constants.priority.PRIORITY_NORMAL;
  const priorityApplied = focused ? setPriorityClass(pids, ABOVE) : setPriorityClass(normalPids, NORMAL);
  const throttling = setPowerThrottlingOptOutSync(pids, focused);
  return { focused, priorityApplied, of: pids.length, throttling };
}

module.exports = {
  applyFocusedSchedulingSync,
  powerShellScript,
  readPriorityClass,
  setPowerThrottlingOptOut,
  setPowerThrottlingOptOutSync,
  setPriorityClass,
};
