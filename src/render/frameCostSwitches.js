// Kill switches for the render lead's frame-cost changes (2026-11-20), read once from the launch
// URL. They exist so a change can be measured against its own absence in the same minute on the
// same seed (scripts/probe-frame-cost.mjs --variants="off:rfx=off;on:"), the way engines keep a
// console variable behind each renderer optimisation.
//
//   (absent)        every change on — the shipped game
//   ?rfx=off        every change off
//   ?rfx=-sort      one change off (comma list: ?rfx=-sort,-guard)
//
// Names: sort (state-sorted opaque list), gpuDrs (GPU timer queries steer dynamic resolution),
// hudRects (HUD obstacle rects cached and invalidations coalesced, src/ui/hudAvoidRects.js).
//
// A measurement harness may also flip a switch live in one page: globalThis.__sfRfx = { name: bool }
// overrides the URL for switches the renderer reads per frame (scripts/probe-frame-toggle.mjs).

let parsed = null;

function read() {
  if (parsed) return parsed;
  parsed = { all: true, off: new Set() };
  try {
    const raw = typeof location !== 'undefined' && location && location.search
      ? new URLSearchParams(location.search).get('rfx') : null;
    if (raw) {
      for (const part of String(raw).split(',')) {
        const name = part.trim();
        if (name === 'off') parsed.all = false;
        else if (name.startsWith('-')) parsed.off.add(name.slice(1));
      }
    }
  } catch (_) { /* no location: everything on */ }
  return parsed;
}

export function frameCostFixOn(name) {
  const live = globalThis.__sfRfx;
  if (live && typeof live[name] === 'boolean') return live[name];
  const p = read();
  return p.all && !p.off.has(name);
}

/** Tests only. */
export function resetFrameCostSwitchesForTest() {
  parsed = null;
}
