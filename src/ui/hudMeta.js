// src/ui/hudMeta.js — the HUD meta-arc (the three phases of complicity).
//
// CANONICAL SOURCE: docs/worldbuilding/story/HUD-META-ARC.md.
//   Phase 1 (Protective, B0–B2): the HUD's lies read as malfunctions. CARGO shows "STABLE LOAD"
//     after the cargo is gone. The civilian tag flickers 0.5s before the kill feed overwrites it.
//   Phase 2 (Complicit, B3–B5): manifest self-corrects silently. No announcement.
//   Phase 3 (Absent, B6–B7): tags freeze on last-known state. CONTRACT 47-A shows PENDING forever.
//
// This is a HUD SUB-COMPONENT: createHud() mounts it (like the death banner / cargo panel). It
// listens to events the story system emits (hud:phase, hud:tagFlicker) and renders:
//   - the persistent "STABLE LOAD" cargo lie line (top of the cargo stat / a dedicated HUD line)
//   - a transient "CIVILIAN VESSEL — REGISTERED" tag that flickers, then gets overwritten
//   - a small "PHASE n" readout in the corner that the player learns to distrust
//
// Pure DOM. Reads ctx.state. Never mutates sim state.

export function createHudMeta(ctx) {
  const { bus, state } = ctx;

  // ── the STABLE LOAD line (the Chapter-01 prototype that stays on after cargo is gone) ─────
  // Mounted into #hud. Hidden until Phase 1 begins (B0). Once shown, it PERSISTS — toggling it
  // off hides it momentarily but the line returns. This is the HUD's first and most persistent lie.
  const stableLoad = document.createElement('div');
  stableLoad.className = 'sf-stableload';
  stableLoad.id = 'sf-stableload';
  stableLoad.setAttribute('aria-hidden', 'true');
  stableLoad.innerHTML =
    '<span class="sf-stableload__k mono">CARGO</span>' +
    '<span class="sf-stableload__v mono">STABLE LOAD</span>';
  document.getElementById('hud').appendChild(stableLoad);
  let stableLoadArmed = false;     // Phase 1+ has begun → the line exists
  let stableLoadHidden = false;    // player toggled it off (it returns)

  // ── the civilian-tag flicker (B2 / Elroy) ─────────────────────────────────────────────────
  const tagFlicker = document.createElement('div');
  tagFlicker.className = 'sf-tagflicker';
  tagFlicker.id = 'sf-tagflicker';
  tagFlicker.setAttribute('aria-hidden', 'true');
  tagFlicker.innerHTML = '<span class="sf-tagflicker__tag mono"></span>';
  document.getElementById('hud').appendChild(tagFlicker);
  const tagFlickerLabel = tagFlicker.querySelector('.sf-tagflicker__tag');
  let tagFlickerTimer = 0;

  // ── the phase readout (small, corner, distrustful) ────────────────────────────────────────
  const phaseReadout = document.createElement('div');
  phaseReadout.className = 'sf-hudphase';
  phaseReadout.id = 'sf-hudphase';
  phaseReadout.setAttribute('aria-hidden', 'true');
  phaseReadout.innerHTML = '<span class="sf-hudphase__k mono">SYS</span><span class="sf-hudphase__v mono">NOMINAL</span>';
  document.getElementById('hud').appendChild(phaseReadout);
  const phaseValue = phaseReadout.querySelector('.sf-hudphase__v');

  // ── the manifest self-correction log (Phase 2+) ───────────────────────────────────────────
  // When the cargo manifest "silently corrects", we surface a one-line ghost of the old value that
  // fades — the player notices the discrepancy only if they're paying attention. No notification.
  const manifestGhost = document.createElement('div');
  manifestGhost.className = 'sf-manifest-ghost';
  manifestGhost.id = 'sf-manifest-ghost';
  manifestGhost.setAttribute('aria-hidden', 'true');
  document.getElementById('hud').appendChild(manifestGhost);
  let lastCargoSnapshot = snapshotCargo();
  let ghostTimer = 0;

  function snapshotCargo() {
    const c = (state.player && state.player.cargo && state.player.cargo.items) || {};
    const out = {};
    for (const k in c) out[k] = c[k];
    return out;
  }

  // ── hud:phase handler ─────────────────────────────────────────────────────────────────────
  bus.on('hud:phase', ({ phase, beat, lie }) => {
    // Phase readout: Phase 1 = "NOMINAL" (the lie), Phase 2 = "OPTIMIZED", Phase 3 = "STABLE".
    const phaseLabel = phase >= 3 ? 'STABLE' : (phase === 2 ? 'OPTIMIZED' : 'NOMINAL');
    phaseValue.textContent = phaseLabel;
    phaseReadout.classList.toggle('sf-hudphase--p2', phase === 2);
    phaseReadout.classList.toggle('sf-hudphase--p3', phase >= 3);

    if (phase >= 1) {
      stableLoadArmed = true;
      if (!stableLoadHidden) stableLoad.classList.add('sf-stableload--visible');
    }

    // specific lies
    if (lie === 'stable_load') {
      // ensure the STABLE LOAD line is showing even if the player toggled it off earlier — the HUD
      // re-asserts its courtesy. (The doc: "The line stays.")
      stableLoadHidden = false;
      stableLoad.classList.add('sf-stableload--visible');
    }
    if (lie === 'civilian_tag_flicker') {
      // armed; the actual flicker fires on hud:tagFlicker (the kill)
    }
    if (lie === 'manifest_silent_correct') {
      // armed; the ghost fires when cargo contents change (detected in tick)
    }
    if (lie === 'phase3_freeze') {
      // CONTRACT 47-A shows PENDING forever — surface a permanent HUD line.
      stableLoad.classList.add('sf-stableload--p3');
      stableLoad.querySelector('.sf-stableload__v').textContent = '47-A: PENDING';
    }
  });

  // ── hud:tagFlicker handler (B2 kill) ──────────────────────────────────────────────────────
  bus.on('hud:tagFlicker', ({ tag, durationMs, note }) => {
    tagFlickerLabel.textContent = tag || 'CIVILIAN VESSEL \u2014 REGISTERED';
    tagFlicker.classList.add('sf-tagflicker--show');
    tagFlickerTimer = durationMs || 500;
    // The note is the truth the HUD won't show — stash it as the title so an inspecting player finds it.
    tagFlicker.title = note || '';
  });

  // ── player can toggle the STABLE LOAD line off (it returns) ───────────────────────────────
  stableLoad.addEventListener('click', () => {
    if (!stableLoadArmed) return;
    stableLoadHidden = true;
    stableLoad.classList.remove('sf-stableload--visible');
    // per the doc: "The player can toggle it off. The line stays." It returns on next cargo change.
  });

  // ── per-frame tick (called from hud.frame via the returned api) ───────────────────────────
  function tick(dt) {
    // tag flicker countdown
    if (tagFlickerTimer > 0) {
      tagFlickerTimer -= (dt || 0.016) * 1000;
      if (tagFlickerTimer <= 0) {
        // the kill feed overwrites it — snap to the "neutralized" state then hide
        tagFlickerLabel.textContent = 'THREAT NEUTRALIZED';
        tagFlicker.classList.remove('sf-tagflicker--show');
        tagFlicker.classList.add('sf-tagflicker--overwrite');
        setTimeout(() => tagFlicker.classList.remove('sf-tagflicker--overwrite'), 600);
      }
    }

    // manifest ghost: detect a silent correction (a commodity changed/dropped without a trade event
    // the player initiated). We can't easily distinguish player trades from system rewrites, so the
    // ghost fires on ANY cargo-items change in Phase 2+ — surfacing the old value briefly.
    const phase = (state.story && state.story.phase) || 1;
    if (phase >= 2) {
      const cur = snapshotCargo();
      const diff = diffCargo(lastCargoSnapshot, cur);
      lastCargoSnapshot = cur;
      if (diff) {
        manifestGhost.textContent = diff;
        manifestGhost.classList.add('sf-manifest-ghost--show');
        ghostTimer = 1.6;
      }
    }
    if (ghostTimer > 0) {
      ghostTimer -= dt || 0.016;
      if (ghostTimer <= 0) manifestGhost.classList.remove('sf-manifest-ghost--show');
    }
  }

  function diffCargo(prev, cur) {
    // returns a one-line "old → new" ghost if a key's qty dropped to 0 or a key was renamed-ish;
    // else null. Deliberately subtle — the player notices only if watching.
    for (const k in prev) {
      if ((prev[k] || 0) > 0 && !(cur[k] > 0)) {
        return `MANIFEST: ${labelOf(k)} \u2014 RECONCILED`;
      }
    }
    return null;
  }
  function labelOf(id) {
    return String(id).replace(/^cmdty_/, '').replace(/_/g, ' ').toUpperCase();
  }

  function setVisible(v) {
    stableLoad.style.display = v ? '' : 'none';
    tagFlicker.style.display = v ? '' : 'none';
    phaseReadout.style.display = v ? '' : 'none';
    manifestGhost.style.display = v ? '' : 'none';
  }

  return { tick, setVisible };
}

// CSS is injected by uiRoot's HUD stylesheet block (added there to keep all HUD CSS in one place).
// The classes used: .sf-stableload, .sf-tagflicker, .sf-hudphase, .sf-manifest-ghost.
export const HUD_META_CSS = `
  /* STABLE LOAD — the persistent cargo lie (Phase 1+) */
  .sf-stableload { position:absolute; left:18px; bottom:200px; display:none; align-items:center; gap:8px;
    padding:6px 12px; background:rgba(8,14,24,.6); border:1px solid var(--panel-edge); border-left:2px solid var(--ink-mute);
    border-radius:6px; backdrop-filter:blur(4px); pointer-events:auto; cursor:pointer; opacity:0; transition:opacity .5s ease; }
  .sf-stableload--visible { display:flex; opacity:1; }
  .sf-stableload__k { font-size:9px; letter-spacing:.14em; color:var(--ink-mute); }
  .sf-stableload__v { font-size:11px; letter-spacing:.08em; color:var(--ink-dim); }
  .sf-stableload--p3 { border-left-color:var(--danger); }
  .sf-stableload--p3 .sf-stableload__v { color:var(--danger); animation:sf-stablepulse 2.5s ease-in-out infinite alternate; }
  @keyframes sf-stablepulse { from { opacity:.7; } to { opacity:1; } }
  /* civilian tag flicker (B2) */
  .sf-tagflicker { position:absolute; left:50%; top:42%; transform:translate(-50%,-50%); pointer-events:none;
    opacity:0; transition:opacity .12s ease; z-index:12; }
  .sf-tagflicker--show { opacity:1; }
  .sf-tagflicker__tag { font-family:var(--mono); font-size:12px; letter-spacing:.16em; color:var(--good);
    padding:4px 12px; background:rgba(8,14,24,.85); border:1px solid var(--good); border-radius:4px;
    text-shadow:0 0 8px rgba(98,224,138,.5); }
  .sf-tagflicker--overwrite .sf-tagflicker__tag { color:var(--danger); border-color:var(--danger);
    text-shadow:0 0 8px rgba(255,84,112,.5); }
  /* phase readout (corner, distrustful) */
  .sf-hudphase { position:absolute; right:18px; bottom:230px; display:flex; align-items:center; gap:7px;
    padding:5px 11px; background:rgba(8,14,24,.5); border:1px solid var(--panel-edge); border-radius:6px;
    backdrop-filter:blur(4px); pointer-events:none; opacity:.7; }
  .sf-hudphase__k { font-size:9px; letter-spacing:.14em; color:var(--ink-mute); }
  .sf-hudphase__v { font-size:11px; letter-spacing:.08em; color:var(--ink-dim); }
  .sf-hudphase--p2 .sf-hudphase__v { color:var(--accent-2); }
  .sf-hudphase--p3 .sf-hudphase__v { color:var(--ink-mute); }
  /* manifest ghost (Phase 2 silent correction) */
  .sf-manifest-ghost { position:absolute; left:50%; top:54%; transform:translateX(-50%); pointer-events:none;
    font-family:var(--mono); font-size:10px; letter-spacing:.12em; color:var(--ink-mute); opacity:0;
    transition:opacity .4s ease; text-shadow:0 0 8px rgba(0,0,0,.8); }
  .sf-manifest-ghost--show { opacity:.6; }
  @media (max-width: 760px) {
    .sf-stableload { left:8px; bottom:230px; padding:4px 8px; }
    .sf-hudphase { right:8px; bottom:250px; }
  }
`;
