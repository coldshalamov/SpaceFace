# SPEC2/02 — FLIGHT, CAMERA & THE JUICE STACK

**Owner lane:** presentation agent (needs taste discipline — follow numbers exactly).
Read `spec2/00_MASTER_TASTE.md` first. **Files:** `src/render/camera.js`, `src/render/vfx.js`,
`src/render/feel.js`, `src/systems/cruise.js` (new; brief exists at
`.tmp/multi-loop/20260703/brief-codex-6-cruise.md` — fold it in), `src/data/combatDefs.js` weapon
cue tables, new `scripts/check-juice-contract.mjs`.

## 1. Cruise tier (A3 — completes the Freelancer travel grammar)
Implement exactly per the staged brief: V toggles; 3.0 s charge (cancel on damage/fire/boost);
×4 maxSpeed, ×2.5 accel, ×0.25 turn while cruising; drop instantly on damage / manual / mass-lock
(any entity radius ≥ 60 within 180 wu). Events: `cruise:charging/engaged/dropped{reason}`.
**Presentation contract (this spec adds):**
- Charging: engine glow ramps 1→2.2× emissive over the 3 s; rising two-tone hum; thin cyan
  progress arc around the ship (world-space, 24 px radius, NOT a HUD bar); camera zoom eases +8%.
- Engaged: 120 ms white-cyan streak flash (respect flashReduce), near-motes stretch ×2 beyond the
  boost stretch, fov/zoom settles at +14%, hum drops to a low even drone.
- Dropped by mass-lock: 'SNARED' one-voice banner (danger tier), 0.35 trauma, hum cuts with a
  descending pitch bend, zoom snaps back over 400 ms. Dropped manually: no drama, 200 ms ease.
- Engine-hue speed read (FR-4/FR-6): OUTSIDE cruise, the engine plume lerps its FACTION color
  toward white-hot by speed (÷ 4× maxSpeed) — a quiet analog throttle read that preserves faction
  identity and never borrows the locked strain-amber. WHILE cruising, cyan (#39d0ff, the locked
  interactive/engaged hue) overrides the plume, so speed-white and cruise-cyan are mutually
  exclusive in time — one cue per state.
- Prograde tick (FR-1): an always-on, unlabeled 2×8 px white (#d7e6ff) velocity-vector tick ~40 px
  ahead of the ship's projected screen point (via worldToScreen), fading out below 2 wu/s. It is a
  gauge — constant size, never animates. Its divergence from the centered aim reticle is the
  "facing vs travel" instrument.

## 2. Camera composition (small numbers, big feel — edit `camera.js` constants only)
- Default zoom 95 → **88** (tighter, ships read bigger); map-peek unchanged.
- Speed zoom: current ±10% band widens to **0.88×–1.18×** mapped over speed 0→cruise; ease 1.4/s.
- Look-ahead: keep 0.35 velocity bias but raise cap 18 → **26 wu** at cruise only.
- Kill-cam kiss: on player kill (entity:killed, killer=player), push-zoom 0.96× for 250 ms (existing
  `pushZoom`). Never on ordinary hits.
- Keep: no yaw-follow (locked), trauma model, aim bias, tether/threat composition biases.

## 3. The juice stack (all via existing pooled systems — vfx.js events, feel.js, floatingText)
Implement each cue EXACTLY; if a value feels wrong in play, change it here first:
| Event | Visual | Sound | Feel |
|---|---|---|---|
| Shield hit | hex-ripple decal at impact point, 220 ms fade, shield-color | soft 'tink', pitch rises with consecutive hits (max +4 semitones) | none |
| Shield break | full-ring cyan flash on target, 320 ms | bass drop + crack | 40 ms hit-stop, 0.3 trauma if player involved |
| Armor hit | 6–10 spark particles + 1 chunk sprite | metallic clank, low variance | none |
| Hull hit | dark smoke puff + ember | dull thud | 0.08 trauma if player is target |
| Kill (small) | interior flash → 2-stage breakup → shockwave ring 260 ms | crump + debris ticks | 60 ms hit-stop, kill-cam kiss |
| Kill (capital) | 3 sequential internal flashes over 800 ms → core bloom → ring + debris fan | rolling detonation | 0.5 trauma at ≤ 400 wu, scaled 1/d² |
| Player damage | existing radial indicators, contrast ×2 (styles) | existing | existing |
| Tether latch | whipcrack (exists) + 60 ms cyan flash at anchor | latch clunk + hum start | none |
| Tether snap | existing burst ×both ends | crack + recoil twang | 0.25 trauma |
| Charge detonate | white core + palette shockwave, radius-scaled | deep thump | trauma = 0.2 at epicenter, 1/d² |
Rules: all effects pool (no allocation), all respect motionReduce/flashReduce, hit-stop NEVER stacks
(one active at a time, newest wins), no effect exceeds 800 ms except capital kills.

## 4. Flee/telegraph presentation (binds to shipped `ai:telegraph`, `ai:flee`, `ai:formationBroken`)
- attackRun telegraph: 0.5 s engine flare (emissive ×2) + brief targeting glint toward player.
- alphaStrike: 0.8 s weapon-port glow amber→red + rising whine. THE PLAYER MUST BE ABLE TO DODGE.
- flee: engine stutter-flicker + jettisoned cargo tumbles (pickups already spawn).
- formationBroken: wingmen wobble (bank oscillation ±0.2 rad, 1.5 s) before scattering.

## 5. Acceptance assertions (`scripts/check-juice-contract.mjs`)
1. Every event in the §3 table emits its cue exactly once per trigger in a scripted 30 s combat
   scenario (count via presentation:vfxCue / audio:cue traces).
2. Hit-stop concurrency == 1; total time-scaled ticks < 4% of the scenario.
3. With motionReduce=true: zero trauma above 0.125, zero hit-stop, zero flashes > 120 ms.
4. Cruise: charge 3.0 ± 0.05 s; mass-lock drop within 2 ticks of proximity; check-cruise.mjs green.
5. Frame budget: scenario runs with zero frames > 32 ms attributable to vfx (use the perf runtime
   phase timers; headless driver stalls excluded per BUILD_PLAN A2 note).
