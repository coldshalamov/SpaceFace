// WHAT HAPPENED THE LAST TIME THE OWNER PLAYED? (referee, 2026-11-22)
//
//   npm run check:owner-session            newest session
//   npm run check:owner-session -- --all   every session still on disk
//
// Reads, and only reads, what his own launches leave behind:
//   %LOCALAPPDATA%\Temp\spaceface-launcher\<id>.jsonl   the launch log of `npm run electron`
//       (window-ready, world-motion-hold rows, and frame-rate rows: one per ten live seconds)
//   %APPDATA%\SpaceFace\freeze-log.jsonl                 every freeze the game itself detected
//   %APPDATA%\SpaceFace\frame-rate-log.jsonl             the same frame-rate rows, kept across launches
// Nothing is launched, no save is opened, nothing is written. Plain words; no code knowledge needed.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

const ALL = process.argv.includes('--all');
const launcherDir = join(os.tmpdir(), 'spaceface-launcher');
const userData = join(process.env.APPDATA || join(os.homedir(), 'AppData', 'Roaming'), 'SpaceFace');
const lines = (file) => { try { return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean); } catch (_) { return []; } };
const when = (d) => new Date(d).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const clock = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const span = (ms) => (ms < 90000 ? `${Math.round(ms / 1000)} seconds` : `${Math.round(ms / 60000)} minutes`);
const ago = (d) => { const h = (Date.now() - new Date(d).getTime()) / 3600000; return h < 1 ? `${Math.round(h * 60)} minutes ago` : h < 48 ? `${Math.round(h)} hours ago` : `${Math.round(h / 24)} days ago`; };

// What a recorded hold was waiting on, in plain words.
function holdCause(m) {
  const w = m.worker || {};
  const paused = m.pauseRequests && Object.keys(m.pauseRequests);
  if ((paused && paused.includes('window-focus-loss')) || (m.shellState && m.shellState !== 'foreground-visible')) {
    return 'another window took the focus and the game paused itself without showing a pause sign';
  }
  if (paused && paused.length) return `the game was paused by: ${paused.join(', ')}`;
  if (w.awaitingAck === true || w.backpressured === true || Number(w.unacked) > 0) {
    return `the simulation was waiting for the screen to acknowledge earlier results${Number(w.unacked) > 0 ? ` (${w.unacked} unacknowledged)` : ''}`;
  }
  if (w.heartbeatHeld === true) return 'the simulation was holding because the screen had stopped drawing';
  if (m.clockScale === 0) return 'time was stopped with no pause on record';
  return 'something else (the simulation reported itself running; see the raw row)';
}
function freezeCause(text) {
  if (/window-focus-loss/.test(text)) return 'focus loss (another window took focus)';
  if (/"awaitingAck":true|"backpressured":true/.test(text)) return 'waiting for acknowledgements';
  if (/"commandInFlight":true/.test(text)) return 'a command to the simulation was still in flight';
  return 'something else';
}

const out = [];
const files = existsSync(launcherDir) ? readdirSync(launcherDir).filter((f) => f.endsWith('.jsonl')).sort() : [];
if (!files.length) {
  out.push(`No launch log found in ${launcherDir}. He has not started the game with "npm run electron" on this machine (or the temp folder was cleared).`);
} else {
  const chosen = ALL ? files : files.slice(-1);
  for (const file of chosen) {
    const path = join(launcherDir, file);
    const rows = lines(path);
    const start = rows.find((r) => r.status === 'starting');
    const ready = rows.find((r) => r.status === 'window-ready');
    const quit = rows.find((r) => r.status === 'quit-requested');
    const lastAt = quit ? quit.at : (rows.at(-1) && rows.at(-1).at);
    const lastWrite = statSync(path).mtime;
    const end = quit ? new Date(quit.at) : new Date(Math.max(lastWrite.getTime(), new Date(lastAt || 0).getTime()));
    out.push(`LAST PLAYED: ${when(start ? start.at : lastWrite)} (${ago(start ? start.at : lastWrite)})`);
    if (!ready) { out.push('  The game window never finished opening in that launch.'); continue; }
    const loadMs = new Date(ready.at) - new Date(start.at);
    out.push(`  Window opened after ${span(loadMs)}, ${ready.fullscreen ? 'fullscreen' : 'windowed'}.`);
    out.push(quit
      ? `  Played for ${span(new Date(quit.at) - new Date(ready.at))} (closed at ${clock(quit.at)}).`
      : `  Played for at least ${span(end - new Date(ready.at))} (the log has no closing line; its last entry is at ${clock(end)}).`);
    const holds = rows.filter((r) => r.status === 'world-motion-hold');
    if (!holds.length) out.push('  Freezes recorded: none.');
    else {
      out.push(`  Freezes recorded: ${holds.length >= 8 ? 'at least 8 (the log stops counting at 8)' : holds.length}. The ship was moving, frames were being drawn, and the world stood still:`);
      for (const h of holds) {
        let m = {};
        try { m = JSON.parse(String(h.message).replace('[world-motion-hold] ', '')); } catch (_) { /* cut-off row */ }
        const intoPlay = new Date(h.at) - new Date(ready.at);
        out.push(`    ${clock(h.at)} (${span(intoPlay)} after the window opened): the world stood still for about ${(Number(m.durationMs) / 1000 || 1).toFixed(1)} s or more while ${m.frames ?? '?'} frames were drawn. Cause: ${holdCause(m)}.`);
      }
    }
    const fr = rows.filter((r) => r.status === 'frame-rate');
    if (!fr.length) out.push('  Frame rate: not recorded in that session (the frame-rate line was added on 2026-11-22; his next launch will carry it).');
    else {
      const med = (k) => { const a = fr.map((r) => Number(r[k])).filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
      const worst = Math.max(...fr.map((r) => Number(r.worst) || 0));
      const over100 = fr.reduce((s, r) => s + (Number(r.over100) || 0), 0);
      const slowWorld = fr.filter((r) => Number(r.world) < 0.97).length;
      out.push(`  Frame rate over ${span(fr.length * 10000)} of live play: typically ${med('fps')} frames a second (a typical frame took ${med('p50')} ms; one frame in twenty took ${med('p95')} ms or longer).`);
      out.push(`    Worst single frame ${worst} ms; ${over100} frames longer than a tenth of a second; the world ran slower than real time in ${slowWorld} of ${fr.length} ten-second stretches.`);
      const caps = [...new Set(fr.map((r) => r.cap))];
      out.push(`    Frame cap chosen by the game: ${caps.map((c) => (c ? `${c} fps` : 'none')).join(', ')}.`);
      const bad = fr.filter((r) => Number(r.fps) < 25 || Number(r.worst) > 150).slice(0, 8);
      for (const r of bad) out.push(`    rough stretch at ${clock(r.at)}: ${r.fps} fps, worst frame ${r.worst} ms${r.swarm ? `, Swarm ${r.swarm}` : ''}`);
    }
    out.push('');
  }
}

const freezeLog = join(userData, 'freeze-log.jsonl');
if (!existsSync(freezeLog)) {
  out.push(`The game's own freeze log (${freezeLog}) does not exist yet: he has not launched the game since the freeze recorder was added (2026-11-21). The next launch creates it.`);
} else {
  const rows = lines(freezeLog);
  const sessions = rows.filter((r) => r.kind === 'session-start');
  const lastStart = sessions.at(-1);
  const recent = lastStart ? rows.slice(rows.lastIndexOf(lastStart) + 1) : rows;
  out.push(`THE GAME'S OWN FREEZE LOG: ${sessions.length} launch${sessions.length === 1 ? '' : 'es'} on record; newest ${lastStart ? when(lastStart.at) : 'unknown'}${lastStart && lastStart.version ? ` (version ${lastStart.version})` : ''}.`);
  if (!recent.length) out.push('  That launch recorded no freeze and no hold.');
  for (const r of recent.slice(0, 40)) {
    const text = String(r.message || '');
    out.push(`  ${clock(r.at)}  ${r.kind === 'freeze-episode' ? 'freeze detected by the simulation link' : 'world stood still'}: ${freezeCause(text)}${Array.isArray(r.devices) && r.devices.length ? `; controllers connected: ${r.devices.join(', ')}` : ''}`);
  }
}
const presence = lines(join(launcherDir, 'player-presence.json'))[0];
if (presence && presence.focused === true && Date.now() - presence.at < 15000) out.push('\nHe is playing right now (the game window reported in within the last 15 seconds).');
console.log(out.join('\n'));
