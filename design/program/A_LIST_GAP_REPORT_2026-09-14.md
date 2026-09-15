<!-- LIFETIME: DURABLE -->
# SpaceFace — From "technically satisfied" to A-list: the gap report and build plan

**Status: DESIGN INPUT, not a queue.** Written 2026-09-14 against `master` at `206e8b2f5` (working tree
dirty with concurrent agent work). Companion to the owner-endorsed research report *SpaceFace: The Physics
of Fun* (2026-09-14). Work routes through `design/program/roadmap/program-queue.json` packets; this file
names the gaps, the evidence, the exact edits, and the order. It does not dispatch.

**How this was produced.** The full research report and its 120-item portfolio were read first. Then the
repo: `VISION.md` (both parts), `FEEL_CONTRACT.md`, the Field Hardware program, the queue (492 dispatch
units), 40+ receipts, today's stills on the live route (title, New Game, flight, map, dock, station, pause,
two Crucible frames, two 60-second-proof frames), the headless flight and verb benches re-run on seed 4242,
a headed runtime-witness sample on the owner's Intel iGPU, and seven read-only subsystem audits (flight and
input and camera; Massline; combat and enemies; world reaction; onboarding and progression; HUD, UI and
audio; performance, saves and platform). Every claim below cites a file, a number, or a frame.

---

## 0. The verdict

The program measured the physics honestly and most of it is now right: on seed 4242 the starter hull
reaches cruise in 0.67 s, reverses in 1.6 s, turns inside 0.57 screen depths, keeps 100 % of earned
speed above the cap, the rope stretches 5 %, a shove moves a light hull 55 % of cruise, terrain kills a
light at 76 % of cruise and scratches a heavy. Almost every bar in `FEEL_CONTRACT.md` is MET. The owner
is still right that the game is sluggish and not fun, and the reason is not one thing but a layer:

1. **One rule below the cap brakes the ship whenever the hand leaves the key** (44 % of authority, half
   the speed gone in 3.2 s, and you decelerate while you turn). The earned-speed bar only looks above the
   cap, so it never saw the half of the speed range where the player lives. This is the finding the owner
   would feel within five seconds of flying, and it is two numbers (§4.1 F1).
2. **The fight is authored four to five screens away from a camera that shows 130 units** — enemies hold
   460–620 units, packs spawn at 900, guns reach 600. Two Crucible frames with 13 enemies alive show none.
   The "fight stays on screen" bar never asked whether a hostile was in frame (§3.1, §4.3 C1).
3. **The game narrates itself in prose.** Captions are on by default, so "Shield hit." and "Autopilot
   arrived" print under the ship; six to eleven text surfaces compete; labels sit on the player's own
   hull. One default, one arbiter lane, one unbuilt HUD frame (§4.6).
4. **The Massline's relationship between two bodies is half-built:** a heavy anchor swings you but never
   changes your turn rate; no line has a load rating; denied latches are silent; the throw cuts itself
   (§4.2).
5. **The world computes consequences it never tells,** and on the opening route pirates never attack a
   hauler at all because the only predation encounter is gated below the sector's security floor (§4.4).
6. **The first fifteen minutes assert the hook instead of demonstrating it,** teach sixteen actions
   before one choice, and put the first real upgrade 60–90 minutes away by the repo's own comment (§4.5).
7. **On the owner's machine the felt problem is hitch and load, not steady frame rate** — one frame in
   five hitches in the opening seconds, launch waits time out under the agent fleet's load, 22 point
   lights are shaded on every pixel at zero intensity, and GPU time has never been measured (§3.10, §4.7).

None of this is missing content. It is scale, configuration, information design, and frame pacing —
exactly the layer the owner suspected. Roughly twenty of the edits below are single values or single
lines. The plan (§5) fixes the hands and the frame first, then makes the world's answers legible, then
finishes the polish a $20M title cannot ship without — and it closes each package on the one instrument
the queue has been missing: a human playing it.

---

## 1. The yardstick (what "A-list" means here, in player moments)

The picture held in mind while auditing, so every gap is measured against the same target:

1. **Cold start to a controllable ship in ≤ 5 s** (warm) / ≤ 10 s (fresh). No hitch on the first thrust,
   first shot, first latch.
2. **Thrust shows on the same frame the key goes down.** Plume grows in ~120 ms; the sound attacks in
   ~30 ms. The camera leads the velocity and settles in ~0.2 s. The nose turns with a hint of angular
   inertia. Coasting is assisted below the cap and never brakes earned speed.
3. **The fight is on the screen.** Every enemy that can hurt me is in frame or has a large, directional,
   distance-carrying edge marker. Incoming fire is dodgeable because it is visible for ≥ 0.4 s.
4. **Every hit reads as its type.** Shield ripple, armor spark, hull rupture, physical thud, kill hitstop
   — different shapes, different sounds. Never a sentence.
5. **The Massline is the best-understood object on screen.** A stable bracket says CAN / OUT OF RANGE /
   DENIED-because. Latch thunks, taut line sings, handling changes at once, release snaps.
6. **Enemies telegraph intent** before it lands, and the roster is four different physical problems.
7. **One voice at a time.** One objective, always recoverable. Prompts show the real key.
8. **Consequences are specific:** one lost shipment → one named shortage, one price, one contract, one
   witness. Failure mutates the situation instead of ending it.
9. **Upgrades change what I can do,** described that way, comparable including handling, trialable.
10. **60 fps on the target machine, no hitch > 33 ms in the first minute of any encounter,** saves that
    keep obligations, browser and desktop identical.

---

## 2. What is already right (do not rebuild)

- The sim kernel and its bars (§0 numbers). `FEEL_CONTRACT.md` A1–A13 are real fixes.
- The bench (`scripts/run-fun-bench.mjs`) is deterministic and prints real values; only its summary
  column is misleading (see §3.6).
- The ship models at the shipping camera (Hitch, the freighters, the tender) read as designed objects.
  The New Game hull copy ("Turns wide. Sluggish under load. Stops badly.") is exactly the
  capability-first voice the whole game needs.
- The station shell has the right bones: one purpose per instrument, a recommended first job, a
  "getting started" rail, a live world behind the screen.
- The pause card already gives a return-after-absence recap (tracked contract, next step, save state).
- The Field Hardware program is the right *process* answer to "ten generic UI passes". The live title
  now matches its approved frame v2. Do not restyle from prose again.
- World-reaction listeners exist and fire (patrol chooses in 1.2 s, salvor reaches spilled cargo in
  4.3 s). The chain is real; it is the *telling* that is missing.

---

## 3. Findings I verified myself (lead)

### 3.1 The engagement envelope is 4–5× the camera envelope — the fight is off-screen (BLOCKER)

- Camera: `src/render/camera.js` `DEFAULT_ZOOM = 144`, FOV 50° → visible depth ≈ 130 WU at cruise
  (bench `screenDepthAtCruiseWu = 130.5`; frame ≈ 232 × 130 WU). Threat composition nudges the frame by
  at most `THREAT_COMPOSE_MAX_BIAS = 42` WU at `THREAT_COMPOSE_FRACTION = 0.08`, with a context zoom of
  4–12 % (`THREAT_ZOOM_BASE/RANGE`).
- Guns: `src/data/weapons.js` ranges are 520–680 WU for every S/M gun (pulse laser S: 600), railgun
  1100, torpedo 1400. Projectile TTL = range / speed (`src/systems/weapons.js:932`).
- AI: `src/ai/combatDoctrine.js` `snapshot()` holds `preferredRange` at **620** for the default standoff
  doctrine, capital broadside and every egress phase; 460–620 for the field controller; 150–190 for an
  interceptor strike; 90–140 only for tether raiders and brawler commit. `src/ai/maneuver.js`
  `orbitRadius: 240`. Crucible `SURVIVAL_SPAWN_DISTANCE = 220` (`src/systems/waveMaterialization.js:18`).
- Evidence: two Crucible frames from 2026-09-13 (`.devshots/main-thread-profile/swarm-p4-a/swarm.png`,
  `swarm-p2-shots/shot-26000.png`) with 13 of 15 hostiles alive show **zero enemies in frame**, only
  tracers entering from off-screen and tiny red brackets at the top edge.
- Why the bar passed: B3 "the fight stays on screen" measures the *player's* crossing time and the
  camera's opening with *speed*. It never asks whether a hostile is in frame.
- Player terms: you are shot by things you cannot see; a shove or a throw has no visible target; "light
  ships are ammunition" cannot be experienced because the ammunition is off-screen.
- Fix (configuration, one coordinated pass — "engagement scale"): weapon `range` for S/M guns → 220–300
  WU with `projSpeed` 260–340 so a shot lives ≥ 0.7 s on screen; AI `preferredRange` per doctrine →
  standoff 170, controller 150–190, capital 220, interceptor strike 110–140, extend/egress 260 (still
  inside 2× cruise depth); `orbitRadius` 240 → 120; spawn distance 220 stays; camera combat framing →
  fit player + active attackers within 300 WU into the frame with zoom ≤ 1.6× and 0.28 s stickiness
  (extend `resolveChaseComposition`), hull never below 4 % of frame width (already a bar). Add a new
  bar **B3b: "≥ 80 % of the seconds a hostile is actively attacking, that hostile is inside the frame"**
  to `feel.screen_crossing`, and re-record the two 47-A goldens with the causal note per
  `docs/COMMON_BUGS.md` §10d. Proving number: hostile-in-frame fraction on the Crucible bench, seeds
  4242/8008, before (expected ≈ 10–25 %) and after (≥ 80 %).

### 3.2 Feedback is delivered as sentences (MAJOR)

- Frames: "Shield hit." and "Autopilot arrived" render as plain-text toasts at screen centre
  (`.devshots/spec2/…/05-dock-prompt.png`, Crucible `shot-26000.png`). The pre-latch label is a text
  string "Payload · TOW · 76% · READY" drawn over the player hull.
- Player terms: the game tells you what happened after it happened, in the place your eyes should not
  be. A shield hit should be a ripple on the hull and a glassy tone, not a caption.
- Fix: retire every toast that reports a physical event; route those events to `momentBeat` / VFX /
  audio only (list in §5.3). Keep text for decisions and law.

### 3.3 The first minute has six competing instruction surfaces (MAJOR)

- `ui-stills-smoke/flight.png` and `03-flight-after-input.png` show simultaneously: a top caption ("Light
  ships are ammunition…"), a LOG line (Kessler), an objective line ("Thrust until speed passes forty ·
  Beacon · 686 WU"), a STATUS 1/10 counter, a SECTOR LAW panel (three sentences), the payload label,
  and a contacts list. A tip, a log, an order, a legal notice, and a checklist at once.
- Player terms: five things to read while learning to fly. The report's rule is one surface at a time.
- Fix: one attention arbiter with a strict floor of **one** instruction surface in flight; law panel
  collapses to a badge until it changes; contacts list hidden until first lock; caption and LOG never
  co-visible. Proving number: max simultaneous instruction surfaces in the first 120 s = 1 (count in the
  HUD DOM from the UI matrix capture).

### 3.4 Craft defects a stranger sees in the first five screens (MAJOR, cheap)

From today's stills: the Continue subtitle is clipped under the highlighted plate (title.png); the New
Game ship preview is an empty black box (02-new-game.png); "PILOT NAME" label is clipped; the payload
label sits on the player hull (03-flight); "ROUTE · 99% · READY" overlaps "weapons Pulse Laser S"
(05-dock); "hull 2…" is hidden behind the speed gauge plate (swarm.png); mission titles truncate to
"SELL 30U SILICA CRYST…" (06-station-hub); the galaxy map draws its node graph over the live scene with
"GOAL · BEACON" on top of "YOU" and "ENGAGE ROUTE" clipped by a scrollbar (04-galaxy-map); thin grey
horizontal streaks cross the flight view; a flat unlit blue station silhouette sits on the planet; three
soft blue blobs on the hull at dock. Each is a one-line CSS or layout fix; together they are the
difference between "prototype" and "product".

### 3.5 The sky is the same stock spiral galaxy and Saturn in Helios and in the Crucible (MAJOR)

Every frame — opening, docking, arena — shows one spiral-galaxy plate and one ringed planet at the
same scale and brightness. The vision asks for a dark ground "so the action has somewhere to explode";
the galaxy plate is brighter than most of the action and reads as a screensaver. Sector identity
(PQ-143) is measured in behaviour columns, not in the sky. Fix: per-sector sky plates at ≤ 40 % of the
current luminance, the galaxy reserved for one sector, and arenas get an authored industrial backdrop.

### 3.6 The bench summary column hides which bars are unmeasured (PROCESS)

`scripts/lib/bench/verbBench.mjs` computes a top-level `barMet` for only five scenarios; the summary
table prints **OPEN** for the other seventeen even when every inner bar is met, and prints nothing
when a scenario has no bar at all. Today's run also carries two real reds inside "OPEN" rows: B11
collision helm-loss on a light hull at k ≥ 0.3 = 0 s (`met=false`), well convergence 103 WU/s vs the 45
target (`met=false`), tumble-trail recovery residual 2.0 WU (`met=false`). Fix: the summary prints
MET / RED / UNMEASURED from the inner bars, and a RED anywhere fails the run.

### 3.7 Hitstop and trauma saturate at ΔV 40 (POLISH with big felt payoff)

Bench B9: 60 WU/s closing → 41 ms hitstop / 0.12 trauma; 150 and **400** WU/s closing → identical
54 ms / 0.18. The consequence input is the post-solve contact ΔV, capped at the 40 WU/s solver bound,
so a scout kissing a rock and a freighter broadsiding a station "answer" the same. The audio already
uses mass (1.08 octaves, 18 dB apart). Fix: feed `feel.js` the pre-solve closing speed the damage law
already uses (`PQ-137.06`), curve hitstop 0→120 ms and trauma 0→0.5 over ΔV 8→150.

### 3.8 The queue says the game is finished; the receipts say nobody has played it (PROCESS)

`program-dispatch --next` returns PQ-033.02 "min-spec floors and soak" (release closeout). 327 units
are done, 65 implemented, 80 ready. The 60-second proof (PQ-141.00) closed on a *headless scripted
input tape* ("No headed GPU strip"); PQ-141.02's shipping-camera stills stayed NOT DONE; the stranger
readback (PQ-163.03b) is "an executable stranger proxy… NOT DONE on an unaided human"; the weekly
owner playtest (PQ-167.01) is **deferred**. The receipts are honest; the queue state is not connected
to them. Fix: a unit that names a felt outcome cannot leave `implemented` without a shipping-camera
strip graded by the critic (`PQ-173.02`) and, for opening/onboarding units, one unaided session.
Un-defer PQ-167.01 and make it the gate for ALPHA.

### 3.10 What the owner's machine did today (headed witness, New Game seed 47, Intel iGPU)

`npm run probe:runtime-witness --no-sample-shots`, 2026-09-14 12:37 UTC, with the agent fleet running
(host CPU 66 % busy from other processes during the window — the owner plays on the same machine that
runs the fleet, so this is the real condition, not a lab):

| What | Number | Yardstick |
|---|---|---|
| Launch → flying | **28.6 s** (gpu-resources stage 25.0 s; `wait.prepareLiveSectorBeforeFlight` hit its **20 s timeout**; live cook 6.6 s, opening composition 7.1 s, touch-compile 3.3 s, rock pools 2.4 s, material settle 3.2 s) | ≤ 5 s warm |
| Steady frame, in flight | presentation p95 11.9 ms, render p95 8.0, sim p95 6.6 — **fine** | ≤ 16.7 |
| Hitches, first 20 s of flight | **201 of 1012 frames**; mean hitch frame 33.9 ms; owners: sim 50, externalScheduling 48, bloom 1, **unknown 101** | 0 > 33 ms |
| Long main-thread tasks | **25** ≥ 50 ms, 9 ≥ 100 ms, max **1,641 ms** at 36.7 s, 651 ms, 638 ms | none |
| Opening admission | "opening GPU resources incomplete; entering flight"; first-draw identity gate **failed** (uncaptured programs + a texture); 148 → 210 geometries after entering flight | complete before first frame |
| Sim per tick | tacticalAI p95 1.8 ms, physics 1.3, flight 1.0 — the sim is cheap | — |

Reading: the steady state is already a 60 fps game; what the hands feel is **hitch** (one frame in five
in the opening seconds) and **load** (a 20 s wait that times out under contention). Half the hitch
frames have no owner in the classifier. This is the perf work that matters, and it is a different job
from the "crowded p95" work the deferred PQ-129 leaves describe.

### 3.11 What the Crucible bench says about the starter kit (headless, 27 runs, seeds 4242/8008/13502)

The bench's scripted pilot has 73–100 % hit accuracy, so it is an aim-bot, not a human — the numbers
below are ceilings, not experiences. Even so: with the **starter kit (pulse laser only)** the first kill
comes 4.6–18.4 s in and wave 1 (six wasps) takes 34–81 s or is not cleared inside 90 s; with the
**physics kit** the first kill comes 0.9–3.6 s in; with the **rope kit** verbs per minute triple. No run
clears more than one of its three waves in 90 s. The default kit is a gun-only experience and the
expressive kits are 22,000–54,000 credits and 60–90 minutes of research away (§4.5). B13 (never knocked
around) prints "not met" on every headless run because visible jitter cannot be measured without a
frame — a bar that can never pass on the path that runs nightly.

### 3.12 Velocity, churn and the broken tree (PROCESS)

440 commits since the 2026-09-08 re-root, ~70 per day, four agent brands; the working tree today has
337 modified files and at the time of the baseline run one HUD module (`src/ui/threatHalo.js`) was
mid-edit with a syntax error that took two baseline checks red. `src/` is 280 k lines (render 110 k,
UI 113 k, 168 systems). An A-list build needs a green trunk the owner can play every day; today the
owner's weekly play can land on a broken tree. Fix: a protected, auto-built "owner build" from the last
commit that passed `check:baseline` and the headed witness, published nightly to a fixed path the
desktop launcher uses; agents keep working on trunk.

---

## 4. Subsystem audits (seven read-only agents, verified by the lead)

### 4.1 Flight, input, camera, frame pacing

Lead-verified against `propulsionKernel.js`, `propulsionCatalog.js`, `flightV3.js`, `camera.js`,
`presentationRunner.js`. The audit drove the real kernel with the player's real profile and the real
presentation runner with an injected clock; the numbers are measured.

**Key constants:** player drive `drive_reaction_m` × responsiveness 1.15 → forward 115 WU/s² (full on
tick 1, no ramp), reverse 90, strafe 78; `combatSpeed` 95, boost cap 147; yaw rate 2.45 rad/s, yaw
accel 8.8, yaw brake 14; coast assist `neutralBrakeFraction 0.44`, `stopHorizonS 2.35` (shrunk to
2.04 by the responsiveness factor); pilot brake 152 WU/s²; camera follow τ 0.167 s, lookahead cap
26 WU, `ZOOM_LERP 1.4/s`; frame cap 0 + vsync → display Hz; catch-up 4 (1 after a late present);
render interpolation **yes** and correct; input is `UPDATE_ORDER[0]`, same tick as flight; **no**
slew, deadzone or filter on the player's axes.

| # | Finding | Evidence | Severity | Edit | Proof |
|---|---|---|---|---|---|
| F1 | **Letting go of the throttle brakes the ship.** Below the cap the assisted mode applies `-v/stopHorizon × 0.44` whenever no manual input is held — 20.5 WU/s² on the first tick (18 % of full authority). Hands-off from cruise: 76.6 at 1 s, 49.7 at 3 s, **11.0 WU/s at 10 s**; half the speed gone in 3.2 s. Turning counts as hands-off (`hasManual` ignores `turn`), so you decelerate while you turn. The player's horizon is *shorter* than an NPC's. Bar B1 measures only above the cap, where coast is perfect (190 → 190.0), so it never saw the half of the speed range where the player lives. This contradicts `VISION.md:369` "drift when I choose to" and `FEEL_CONTRACT.md` D3 "never add drag". (History: the July 2026 pilot scheme asked for an off-throttle retro-brake; the September vision supersedes it with "drift when I choose to". Owner taste check — one evening: default `flightMode 'drift'` and fly.) | `propulsionKernel.js:747-776`; `propulsionCatalog.js:111-118,484-494`; `gameState.js:48` | **BLOCKER** | Make the below-cap assist a settle, not a stop: `neutralBrakeFraction` 0.44 → ~0.10, `stopHorizonS` 2.35 → ~4.0, stop shrinking the horizon by the player factor, count `turn` as manual; keep `lateralKillFraction` (the "controllable mass" grip). | hands-off coast from 95 keeps ≥ 90 WU/s at 10 s (today 11.0); reversal bar stays ≤ 1.6 s |
| F2 | **The picture is drawn before the sim runs.** Each rAF presents the last completed snapshot, then advances the sim; a key pressed just before callback k first shows at k+1, and the interpolation fence adds one more; plus the compositor. ≈ 50–67 ms input-to-photon at 60 Hz, double that if the iGPU drops rAF to 30 Hz — the number the hand calls "sluggish". | `presentationRunner.js:832,854`; `renderer.js:7946-7967` | MAJOR | Advance first, present after, on healthy frames; keep present-first only on the `latePresent` recovery path (the machinery exists). Buys ~17 ms; the interpolation tick is the price of smoothness (keep). Measure it (P7). | harness: first-visible callback index == press index on healthy frames |
| F3 | **Yaw spin-up and spin-down are ~2× the yardstick**: 90 % of target yaw rate at 0.267 s, stop-to-10 % at 0.167 s; yaw is excluded from the player responsiveness pass. | `propulsionKernel.js:808-822`; `propulsionCatalog.js:31-43` | MAJOR | Add `yawAccel`/`yawBrake` to the player-only pass at ~2× (8.8 → 17.6, 14 → 28); leave `maxYawRate` and NPCs. | 90 % of rate ≤ 0.14 s; stop ≤ 0.09 s |
| F4 | **Camera lead is capped in world units, so it shrinks as you go faster** — 0.27 s of velocity at cruise, 0.14 s at 2×, 0.09 s at 3×, and ×0.32 whenever anything is shooting at you (≈ 0.09 s). | `camera.js:42-48,1100-1107`; `gameState.js:124` | MAJOR | Cap the lead in seconds: `la = speed × 0.45` clamped to 0.3–0.6 s of velocity; combat scale 0.32 → 0.6. | lead/speed in 0.30–0.60 at 1×, 2×, 3× cruise, in and out of combat |
| F5 | **The frame opens about 1.5 s after the speed arrives.** `ZOOM_LERP 1.4/s` (τ 0.71 s, 95 % at 2.1 s) re-sampled every 0.125 s; boost zoom τ 1.25 s toward a 1.025 target. Boost reads as "the ship got faster", not "the world opened". | `camera.js:248-257` | MAJOR | `ZOOM_LERP` → 3.5–4.5; boost zoom asymmetric (rise ~6/s, decay ~1.2/s), target ~1.10. | keydown → 90 % of boost zoom ≤ 0.25 s; return ≥ 0.8 s |
| F6 | **The dash fires on key release**, up to 320 ms after keydown (`DASH_TAP_WINDOW 0.32`); boost has no anticipation. | `flightV3.js:92,347-390` | MAJOR (dash) / POLISH (boost shape) | Dash on press with hold-cancel; 80 ms pre-kick (FOV, plume, audio) and a 1.35× accel overshoot for 0.2 s. | dash impulse tick == keydown tick |
| F7 | The camera targets the raw sim pose while the hull is drawn interpolated (invisible at 60 Hz, sub-pixel wobble at 120/144 Hz). | `renderer.js:8820-8823`; `camera.js:1067` | POLISH | Hand `follow()` the interpolated position. | hull sd < 0.1 px at 144 Hz with no input |
| F8 | The dedicated brake is excellent (152 WU/s², cruise → 0 in 2.8 s, never settles into reverse) and bound to the `0` key; Space is the Massline. | `input.js:232,279` | POLISH (product call) | Consider Space=brake / F=Massline or a rebind prompt in the first minute. | — |
| F9 | Hitstop slows the player's own controls to 12 % for ≤ 90 ms on collisions; rate-limited, 1–2/min. Not a cause of the complaint. | `feel.js` | — | none | — |

**No gap (do not re-litigate):** frame cap and render scale on Intel; interpolation (600-frame test: shown-sim-time/wall-time 1.000, 0 frozen, 0 jump frames); input sample point; no ramp on thrust (first tick is full authority; rest → 90 % of cruise in 0.87 s); above-cap coast; catch-up bound; draw-to-fly yields same-tick on any brake/turn/move axis; no player-specific contact drag; MMB has no hidden flight authority.

### 4.2 Massline

Lead-verified against `flightV3.js`, `propulsionKernel.js`, `masslineThrow.js`, `tetherGameplay.js`.
Correction to an older note: the pre-latch marker **is** live (`tetherGameplay.js:952` publishes every
tick; `masslineHud.js:350–398` renders it; 16/16 tests). Hysteresis (200 ms, `masslineTargetScoring.js:444`),
taut-vs-slack geometry and the 90→310 Hz load hum (`masslineInstrument.js:35–37`), the command-deck load
gauge (`hud.js:4294–4325`), release rating with 55/38/20 ms hitstop (`feel.js:373–386`), untouched
tangent velocity on cut, cutter telegraph 500 ms → 250 ms attach window, and mouse-aimed throws with a
solution-lock cue are all **right**. The gaps are in the relationship between the two bodies — the
sentence the vision hangs the mechanic on.

| # | Finding | Evidence | Severity | Edit | Proof |
|---|---|---|---|---|---|
| M1 | **Handling is blind to attached mass.** "Attach to a massive body and your own movement changes" (`VISION.md:349`) has no code: `applyMasslineFlightModifiers` sets only the earned-momentum tag and coast assist; the propulsion kernel never reads attached, tether or reduced mass; the winch stall term is pinned at 1.0 because `maxTension` is 10.25 M. Translation coupling through Rapier is real (a heavy swings you, a pod gets yanked) — yaw authority and acceleration are not. | `src/systems/flightV3.js:530–553`; `src/core/flight/propulsionKernel.js` (one comment mention); `src/core/constraints/masslineController.js:106`; `twoBodyReducedMass` computed at `tetherGameplay.js:2847` and discarded | BLOCKER | In the kernel, while the line is taut: `maxYawRate *= 1/(1 + k·m_attached/m_hull)`, `k ≈ 0.35`, same for lateral authority; read the reduced mass already computed. | turn rate with a 640-mass anchor ≤ 60 % of unloaded; with a 20-mass pod ≥ 95 % (Motion Lab) |
| M2 | **No line load rating.** `breakTension: 10,500,000`, `automaticBreakPolicy: 'extreme_load_only'`; validation returns only `target-lost / out-of-range / blocked / protected`; nothing consults mass. A 640-mass asteroid under full opposing thrust peaks at strain 1e-4. Every anchor is equally grabbable, so the ladder's "sustain stronger loads" (`VISION.md:187, 529`) has no axis and no denial can say "too heavy". | `src/data/combatDefs.js:332,341`; `tetherGameplay.js:2335`; `src/render/vfx.js:7916` | MAJOR (design) | `massRating` on `tether_standard` (~800) scaled by the existing spool ladder ×1.5/×3/×6 (`attachments.js:62`); deny above it with the words already in `previewStatusCopy`. | the starter line denies the 2000-mass dreadnought and the 420-mass foreman; the ×3 spool takes the foreman |
| M3 | **Denied latches are silent.** `tether:latchDenied` is emitted from 6 sites; zero UI or audio consumers (only a lab harness listens). The world label is hidden exactly when `reason === 'no-target'`; `create_failed` has no copy. Press with nothing in reach: no marker, no words, no sound. | emits at `tetherGameplay.js:401,441,448,461,477`, `masslineSnares.js:549`; consumer only `src/testing/lab/proofSixtySeconds.js:953`; `masslineHud.js:378` | MAJOR | One bus subscription in `masslineHud` → `previewStatusCopy(reason)` in a 1.2 s floor pill; one short denial cue in `minimalActionAudio`. | 6 emit sites, ≥ 1 player-facing consumer; every reason has copy |
| M4 | **The % beside the target is disambiguation confidence, floored at 42 %.** Next to READY it reads as grip or line strength. | `tetherGameplay.js:2303` `clamp01((exact ? 0.62 : 0.42) + score·0.32 + gap·0.7)` | MAJOR | Print the body's mass instead (`bodyMassOf` exists at `:2843`): `Anchor · ORBIT · 640 t · READY`. | label never shows a number that cannot go below 42 |
| M5 | **The throw cuts itself.** `releaseAssistMode` defaults to `'arm'`: "the line cuts itself on the first solution frame". The honest modes `'snap'` (manual press, 90 ms forgiveness) and `'off'` already ship. | `src/systems/masslineThrow.js:182,602–605` | MAJOR | Default `'snap'`; expose the setting. | authorship: release tick = player press tick ± 90 ms in the bench tape |
| M6 | **Space+W reels and thrusts at once.** Line length is driven by `-moveZ` while in line control, and nothing suppresses thrust, so one key fires two opposed forces. | `src/systems/input.js:232,1221,1266` | MAJOR | Scale `input.moveZ` to ~0.25 while `masslineCommand.lineControl` is true. | reel-in with W held: forward thrust ≤ 25 % |
| M7 | **Latch is instantaneous** — both ends flash on the same frame; no travelling reach. The physics already assumes a 0.35 s soft capture. (Owner call: the vision's "not a grappling hook" heading is about the two-body relationship, not about forbidding a visible reach.) | `src/render/vfx.js:8575–8609`; `combatDefs.js:338` | POLISH | A 150–180 ms travelling head with the thunk on arrival. | — |
| M8 | Cut fires on key-**up**, so a tap's own hold (80–120 ms) precedes the 55 ms snap. Cutters: counterplay (go slack; NPCs cut only a ≥ 92 % taut line) exists but is never told. | `src/systems/masslineInputGrammar.js:109`; `tetherGameplay.js:53`; `combatDoctrine.js:356` | POLISH | Cut on key-down when no line intent is present; add "GO SLACK" to the TETHER tell. | — |

### 4.3 Combat feedback, weapons, enemy roles, telegraphs

Lead-verified against `environmentMix.js`, `combatDefs.js`, `sg02DynamicBodyOwner.js`, `feel.js`.

| # | Finding | Evidence | Severity | Edit | Proof |
|---|---|---|---|---|---|
| C1 | **The fight is authored outside the frame.** Default standoff and every egress phase hold 620 WU; snipers 760–780; adventure packs spawn at 900 WU; the camera's threat zoom tops out at 12 %. | `src/ai/combatDoctrine.js:682,708`; `src/data/enemies.js:43,292`; `src/systems/encounterDirector.js:3199`; `src/render/camera.js:25,30-31` | BLOCKER | Engagement-scale table (§5, item 1): standoff 620→330, sniper 760→420, controller hold 460→300, interceptor extend 620→300, capital 620→380, adventure spawn 900→520, Crucible spawn 220→260; camera `THREAT_ZOOM_BASE/RANGE` 0.04/0.08→0.10/0.30, `THREAT_COMPOSE_MAX_BIAS` 42→70; keep player ranges. | hostile-in-frame fraction ≥ 80 % of attacking seconds (new bar B3b) |
| C2 | **Impact feel saturates at ΔV 40.** `MAX_CONTACT_DV = 40` is the physics solver's per-tick clamp; damage was freed from it (PQ-137.06) but `feel.js` still reads the clamped receipt ΔV, so its curve's 90 ms ceiling at ΔV 150 is unreachable. A 40 WU/s nudge and a 400 WU/s ram both give 54 ms / 0.18 trauma. | `src/core/sg02DynamicBodyOwner.js:109,922`; `src/render/feel.js:59-62,125-129` | MAJOR | Pass `preSolveRadialClosingSpeed` through the collision receipt as `feelDeltaV`; read it in `resolveCollisionFeel`; leave the solver clamp. | hitstop at 400 WU/s closing = 90 ms vs 54 at 40 (1.67× spread, now 1.00×) |
| C3 | **Armor and hull hits are the same sound; cue is chosen by gun family, not by what was hit.** | `src/audio/environmentMix.js:222` maps `combat.damage.armor` → `vfx.hullHit`; `src/data/combatDefs.js:430-437` `cueId` per weapon family | MAJOR | Add `vfx.armorHit` bound to `sfx.armorHit`; drop `cueId` from `WEAPON_CUE_TABLES` and let the surface-keyed receipt path (`vfx.js:3706-3775`, which already distinguishes shield/break/armor/hull) own the cue. | 3 distinct recipe ids across one shield→armor→hull sequence |
| C4 | **Bruiser is a grind:** 27–36 s of unbroken starter-gun fire (100–135 shots through heat vents); wasp resolves in 2.4–3.1 s (fine). | `src/combat/damage.js` energy split thermal 0.72/ion 0.28; ion hull mult 0.55, armor mult 0.28 (`combatDefs.js:70-72`); `subsystemShare 0.35` (`:76`); heat duty cycle `weapons.js:76-78` | MAJOR | Ion hull mult 0.55→0.85, armor mult 0.28→0.45; or give the medium a physical answer (shove into rock) that the roster hole below prevents today. | bruiser ≤ 16 s incl. vents; wasp ≥ 2.0 s |
| C5 | **Enemy aim is exact.** One lead solver, no reaction time, no aim error; spread 0.6–1.6° = 11 WU scatter at 400 WU vs an 18 WU hull. You dodge by accelerating, never by reading a shot. | `src/systems/weapons.js:781`, `src/ai/gunnery.js:79` | MAJOR | Per-shooter aim error scaled by target lateral acceleration and flight time; a 150–250 ms reaction latency on target change. | hit rate vs a laterally burning target 95 % → 55–65 % at 400 WU |
| C6 | **Weapon recoil is sub-perceptual:** FOV kick 0.73°–1.5° across the whole table; pulse laser vs siege lance differ by 0.77°. | `src/render/feel.js:41-54,958-967` | POLISH | Widen to 0.3°–4.0°; add a rearward camera kick from `impulsePerHit` via `impactKickFromMomentum`. | railgun peak ≥ 5× pulse peak |
| C7 | **Roster mass hole:** nothing between mass 22 and 55, nothing between 96 and 420. "Medium needs a setup" has no body. | `src/data/enemies.js` roster | POLISH | One mass-130 medium (throws lights; concussion moves it 7 WU/s, under the 18 tumble threshold). | third category exists on the bench |
| C8 | Telegraphs: **no gap.** Every doctrine cues 0.5 s (`DOCTRINE_TELEGRAPH_TICKS = 30`) before its fire phase and the fire gate equals the cue; tick-lifetimed, colour-coded, reduced-motion variants. `threatHalo` chevrons carry type, tier, distance, role. | `combatDoctrine.js:24,301-538`; `engagementAuthority.js:28-48`; `vfx.js:8842-8900` | — | Keep. Make the chevrons bigger (they are ~12 px at 1080p in `swarm.png`). | — |
| C9 | Crucible waves 1–3 are well authored (one physical question each; HP scaling forbidden). | `src/data/survivalWaves.js:87-137,691-727` | — | Keep. | — |

### 4.4 World reaction and consequences

Lead-verified against `329-curtain-convoy.js`, `sectors.js`, `barkDirector.js`, `traffic.js`, `hud.js`,
`heat.js`. The machinery is built — `provenanceLedger`, `lossLedger`, `freightCausality`, law incidents
with cause lines, the mission mutation table, pirate parley demands, civilian hails — and every system
is registered on the production route. What is missing is the *telling*, and one gate that keeps the
whole chain from ever starting where the player starts.

| # | Finding | Evidence | Severity | Edit | Proof |
|---|---|---|---|---|---|
| W1 | **Pirates never attack a hauler on the default route.** Exactly one encounter in the catalog has `predation` (329 curtain convoy) and it is gated `maxSecurity: 0.65`. Helios Prime is 0.98 (ecology clamps the floor to 0.78), Ceres 0.72 (floor 0.52). The other pirate-on-hauler path (Ceres throughline ambush) springs only when the *player* enters the killbox. A player who parks and watches a lane in Helios sees the vision's chain **never**. | `src/data/encounters/329-curtain-convoy.js:16,51`; `src/data/sectors.js:46,102`; `regionalEcology.js:86`; `encounterDirector.js:1700-1718` | **BLOCKER** | 329 `maxSecurity` → ~0.80 with a raised `pressureCost` in high-security space; add a low-weight raider branch with `predation` to `070-convoy-departure`. | stationary at the Helios Freight Spine for 5 min: a hauler is attacked and a patrol responds without player input |
| W2 | **Ambient haulers have no name, so the one restitution line is dead.** `_speakCargoSpill` returns null unless `ownerName` resolves; `traffic.js` never stamps `ownerName`/`displayName` on a manifest. The receipt already carries `originId`, `destinationId`, `qty` — unused. | `barkDirector.js:472-477,100`; `traffic.js` (0 matches for ownerName); receipt at `barkDirector.js:520` | **BLOCKER** | Deterministic `ownerName` (hash over `worldRecordId`) at manifest spawn; template → "{owner} — {qty} t {cargo} for {destination} — demands restitution." | that sentence on the comms log after shooting a hauler |
| W3 | **The witness choice is never told.** `law:witnessChoice {holderId, chaserIds}` fires (bench: 1.2 s) and its only consumer is an internal escalation token; no bark, toast or HUD element. | `lawSecurity.js:1551`; consumer `encounterDirector.js:206`; `targetPanel.js:306-314` | MAJOR | One `_say('info', …)` at the emit: "CONCORD P-2 HOLDS THE WRECK. P-3 IS ON YOU."; `MOTIVE_LABEL` row for `jurisdiction_enforcement`. | line on the voice floor within 10 s of a witnessed kill |
| W4 | **WANTED shows no cause**, on raise or clear, although `heat.js` ships `reason: 'piracy kill (hauler)'` in the packet; heat from kills is omniscient (no witness/jurisdiction), only theft is witness-gated. | `hud.js:3244-3248`; `heat.js:320,494,267` | MAJOR | Interpolate `reason` and the witness into the alert; add a clear line; witness-gate kill heat like theft. | "WANTED · PIRACY (HAULER KILL) · WITNESSED BY P-2" / "WANTED CLEARED — you outran the search" |
| W5 | **The shortage lands at the wrong address and reads as weather.** Loss intent uses the station nearest the *corpse*, not the manifest destination; no headline names the player; the `news` channel is priority 30 (below `bark` 50 and `alert` 80) so the consequence line is eaten by the fight that caused it; `levyRestitutionSink` needs `playerCaused` that nothing emits. | `traffic.js:8924-8972,9061`; `newsTemplates.js:113`; voice priorities; `economy.js:1775` | MAJOR | Pass the manifest destination to `buildLossIntent`; add a `freight_loss_player` template ("{station} is short {qty} t {noun}. Your kill, logged."); deliver cause-bearing lines at `comms` 55 or after `combat:outcome` (post-combat silence exists). | one floor line naming destination and tonnage; the market row at that destination moves |
| W6 | **There is no sortie debrief.** Each mission fires its own popup (well written) plus "Paid N cr"; dock arrival shows cargo, one news line, next action. `footprint.js` already renders the full provenance chains (act → incident → standing → consequence) but only behind F3. | `missions.js:4749-4816`; `stationApp.js:17`; `src/ui/screens/footprint.js`; `ui/input.js:377` | MAJOR | "Since you undocked" card in `buildDockArrival` from the newest 3 provenance chains using footprint's formatters. | docking after a fight shows "You destroyed MTS K-7 near the Freight Spine → Hauler Guild −5 → recovery contract posted" |
| W7 | Civilians react in 0.1 s — no perception delay; the idiom exists elsewhere (`salvorNoticeAt`, hulk stumble 18–45 s). | `traffic.js:4335,4390,4755` | POLISH | `violenceNoticeAt = t + lerp(0.4, 2.2, dist/300) × roleFactor`. | bench 0.1 s → 0.5–2 s, varying with distance |
| W8 | Failure mutation is the best-built part of the layer: 11 reasons produce a follow-on objective with an authored sentence; six failures are deliberately plain (`busted`, `pods_lost` are the two worth a follow-on). Pirate parley shows a concrete demand before any shot; players can hail civilians. **No gap.** | `missions.js:310-338,5211`; `pirateParley.js`; `contactHail.js` | — | keep | — |

### 4.5 Onboarding and progression

Lead-verified against `47aLiveScene.js`, `main.js`, `techVerbLadder.js`, `check-first-15-runtime.mjs`
(red today). The good news first: the New Game hull copy is the right voice; the Shipworks delta
strip already shows turn rate, thrust and operational mass; "Take it to the range" is a real trial
flight of the *proposed* fit; the ship already stores paint, wear, decal, kill tally, patches and
graffiti, and the scarfield renders them. The gaps are sequencing, the missing demonstration of the
one hook the game has, and an acquisition wall the repo itself documents.

| # | Finding | Evidence | Severity | Edit | Proof |
|---|---|---|---|---|---|
| O1 | **The 47-A discrepancy is asserted, never demonstrated.** `falseMassKg: 960 / manifestMassKg: 480` exist on two lines that nothing reads. The spindle spawns 92 WU from the player at t = 0, weighing 960 against a hull of 18 — and the tutorial rail tows the player 620 WU the other way to latch a purpose-spawned, storyless wreck (mass 900, hull 1) at beat 5 of 10, around minute 4–6. | `src/data/scenarios/47aLiveScene.js:90-91`; `src/main.js:343`; `onboarding.js:940-955` | **BLOCKER** | Beat 5 latches the spindle in place; on latch, the HUD shows manifest 480 / measured 960 and the nose visibly drags (needs M1). | first latch inside 3 minutes, on the spindle; both numbers on screen |
| O2 | **Sixteen taught actions before the first choice, six instruction surfaces at t = 0**, one of them the store tagline on the same `tutorial` voice channel as the first order, so the slogan can displace the imperative. The order itself is a speedometer target ("thrust until forty") with no stated need. Identity is split: New Game and prompts say Hitch, the LOG and the weapon hint say Kestrel. `check-first-15-runtime` is red today. | `onboarding.js:122-146,442,552,627,1149,1164`; `storeSentence.js:4`; `sectorLawPresenter.js:118`; `voiceArbiter.js:93` | **BLOCKER** | Move the tagline to rescue-swing completion; suppress sector law, the TOW pill and the 47-A comms line until `onboarding.finished` (reuse `CRUCIBLE_HIDDEN_PANELS`); teach a need before the number; one hull name. | t = 0 capture shows exactly one sentence; the first-15 check is green |
| O3 | **No capability choice inside 15 minutes.** Beat 10 offers HAUL / BOUNTY / SURVEY — three jobs at the same risk tier, not three tools. The ship at minute 15 is the ship you were given. | `onboarding.js:141,1114`; `missions.js:377-387,1206` | MAJOR | Stock one Massline head at Helios for the first dock; branch beat 10 on which tool you want next. | at 15 min the player owns a head they did not start with |
| O4 | **First research is 60–90 minutes away and the repo says so.** RP starts at 0; only recon and salvage contracts mint it (bounties deliberately none); `FIRST_UPGRADE_MINUTES {60, 90}` vs `TARGET_FIRST_UPGRADE_MINUTES = 15`. The first Massline head costs 10,000 cr + 15 RP of tech plus 12,000 cr — 14–27 contracts; the concussion cannon 54,000 cr + 45 RP. | `src/data/techVerbLadder.js:13-15`; `missions.js:4945-4956`; `weapons.js:224` | **BLOCKER** | Seed RP from the tutorial's own contracts (2 on the recommended trade, 3 on beat 10); a board contract whose reward *is* a tech node; one head at ~2,500 cr, Helios-only, no tech gate. | a fresh save researches a node before 60 min; tutorial + one contract affords a second head |
| O5 | **Fitting copy is category labels.** 1 of 67 modules has a `description`, 1 a `behavior`, 0 of 20 weapons have either — and the two that exist never render; the shop prints "Defensive field system". 16 Crucible rigs (twin mount, bank shot, cryo gyros …) have no `mods` object, so they show no delta and no text. | `shipworks.js:1940-1963`; `modules.js`; `weapons.js` | MAJOR | One capability sentence per purchasable item in the New Game voice, rendered in `.sx-modrow__role`; an authored effect line for the 16 rigs. | every shop row reads as what you can now do |
| O6 | **"My ship" has storage and a setter but no screen.** `setShipAppearance` exists; nothing calls it; there is no player ship name field (`callsign` is NPC-only); the default decal is `borrowed_time`. | `ships.js:1885-1898`; `contactHail.js:326` | MAJOR | Paint / decal / name on the Shipworks nameplate; the name in the HUD and in station address. | the station addresses you by your ship's name |
| O7 | Trial flight is discoverable only as a footer text button once lost off-screen. | `shipworks.js:456-462,1357,2501-2513` | POLISH | Promote to a primary key beside Buy on any row whose delta touches turn rate or mass. | — |
| O8 | Crucible and adventure share nothing: wave unlocks grant Crucible starters only; the campaign gates the same verbs behind 110,000 cr + 170 RP. | `survivalUnlocks.js:105-215`; `onboarding.js:447-452` | POLISH | A wave-10 clear grants the campaign the matching node's RP. | clearing 10 waves with Tag moves `researchPoints` |
| O9 | Upgrade inventory ratio is fine: 24 capability / 27 number / 16 unlabelled; the physics weapons are genuine capabilities. **No gap in the catalog** — the gap is ordering and access (O3, O4). | `modules.js`, `tech.js` (`countVerbVsStatOnly`: 29/32 verb nodes) | — | — | — |

### 4.6 HUD, UI, audio, presentation grammar

Lead-verified against `gameState.js`, `environmentMix.js`, `kit.css`, `velocityLanguage.js`, `hud.js`.
The Field Hardware kit **is** consumed on the bench/poster screens (672 `fh-*` references across 22 UI
files: title, New Game, pause, settings, station, codex, crucible, map …). The mix-priority bus is right
(cues ≥ 0.8 duck the loops), the music state machine has 1.5 s hysteresis and does not thrash, trails
interpolate across hitches, and the recipe layer (400 generated WAVs + synth) has 1–3 ms attacks on
impacts. The gaps are one wrong default, one lane the arbiter does not govern, and the flight HUD
(the EDGE register) that the program has not reached yet.

| # | Finding | Evidence | Severity | Edit | Proof |
|---|---|---|---|---|---|
| U1 | **Gameplay captions are on by default**, so every physical event that already has a sound and an effect is also narrated as prose at the bottom centre: "Shield hit.", "Hull hit.", "Shields down.", "Weapon fire.", "Explosion.", "Boost.", "Kill confirmed.", "Wanted.", "Docking clamp.", "Scan pulse.", plus "Target destroyed.", "Massline attached / strain rising / broken", "Clean release.", "Razor cut.", "Autopilot arrived". The accessibility toggle already exists. | `src/core/gameState.js:55` `captions: true`; `src/audio/environmentMix.js:206-215`; `presentationAdapters.js:131-144`; `flightV3.js:828`; `hud.js:1873-1893` | **MAJOR, one line** | `captions: false` by default (keep the Access toggle); replace the autopilot toast with the arrival chirp and the objective arrow settling. | capture 05 shows no "Shield hit." / "Autopilot arrived" at defaults |
| U2 | **The voice arbiter governs one lane, not the screen.** Its priority queue is right (danger 110 → info 10), but `presentation:caption`, control prompts, the tip, the law panel, the LOG tape and the payload caption all bypass it. Capture 05 has **eleven** text surfaces at once. No history: dropped entries vanish (only comms keeps a backlog). | `voiceArbiter.js:37-46`; `hud.js:1873`; `controlPrompts.js`; `bandHud.js:100`; `sectorLawPresenter.js:84` | MAJOR | Route captions through `voice.say()`; suppress-while-floor-held on prompts, band, law; append surfaced *and* dropped entries to the comms backlog. | ≤ 2 transient text surfaces in a re-capture of 05; a dropped bark appears in the backlog |
| U3 | **The approved HUD frame is not built.** `hud.js` has zero `fh-` references; the objective, contacts, law, energy block and payload label are bare text on black where the frame plates them and puts the payload label on a leader line clear of the hull. Radar, toasts, alerts, mission log, star map, local map, game over are also unconverted. | `frame-hud-resting.png`; `src/ui/hud.js`; `views/hudStyles.js` (4 refs, all Power Rail glyphs) | **MAJOR (looks unfinished)** | Port the five EDGE surfaces onto `fh-plate`/`fh-key` hosts (mind the kit.css load-order trap: `fh-key` brings uppercase and size floors); payload label → plated leader-line label. | a flight capture whose left column, right column and payload label match the frame's plate geometry |
| U4 | **The grey horizontal streaks are the starfield's speed smear**, not trails: along-flow stretch up to 3.4× on every bright background point; the file's own comment calls the result "a scratched card". | `src/render/velocityLanguage.js:523,555`; `spaceBackground.js:669-800,2559` | MAJOR | Cap `VL_SMEAR_MAX_STRETCH` near 2.5 and restrict the smear to the brightest decile. | no continuous line longer than ~60 px at 282 WU/s |
| U5 | **The blue blobs at dock are RCS jets at a 1.7:1 aspect** (`baseLength 3.2 / baseWidth 1.85`, axial billboard) — a round soft glow from the top-down camera, which the VFX standard forbids. | `thruster/recipes/kestrelRecipes.js:228-243`; `familyRecipes.js:79,120` | MAJOR | ≥ 4:1 aspect, higher taper. | dock-approach capture shows directional jets |
| U6 | **Screens open with a hard cut** (`.k-screen { transition: none }`); only exit animates, and `screenManager` waits 200 ms for a 140 ms token. **No hover sound anywhere**: `ui:hover` has a listener and no emitter; kit `cue('move')` fires only on keyboard roving; `screenManager` plays nothing on open/close; every toast plays a menu click. | `styles/kit.css:71-77,195-196`; `screenManager.js:220,453`; `audioSystem.js:1281,1382`; `kit/dom.js:39,58-60` | MAJOR | 140 ms eased enter (opacity + 12 px rise); drive both timeouts from the token; `pointerenter → cue('move')`; open/close cues from `screenManager` (pause.js already models it); gate toast sounds on kind. | two captures 80 ms apart show an intermediate frame; a cue log over a menu walk shows hover/confirm/back |
| U7 | **Brake has no onset sound** (bed only) and no dedicated visual; armor hit and pickup are shared sounds; the capital-kill pre-detonation is a UI hover blip at half rate. | `audioSystem.js:526,2266-2267,4407-4428`; `environmentMix.js:196` | MAJOR (brake) / POLISH | `sfx_brake_bite` on the brake rising edge; `combat.damage.armor` → `sfx.armorHit`; pickup → `sfx_loot_collect`. | one brake cue per press |
| U8 | **Same sky in Helios and every arena**: no `lagrange`/`crucible` row in `sectorVisualProfiles.js`, so arenas take the default face-on spiral. | `sectorVisualProfiles.js:27,65`; `deepFieldStructureRecipes.js:265` | MAJOR | A profile row per arena; the spiral reserved for one sector; sky luminance ≤ 40 % of today's. | Crucible and Helios captures show different sky silhouettes |
| U9 | **HUD information gaps vs the yardstick:** (a) nothing marks the player's own hull in-world (the approved frame has the same hole); (b) threat is a distance-sorted roster, not a "this one" element; (d) cargo and legal status are behind a toggle and red prose; the speed dial's lit arc escapes the bezel at low speed; `BAND OFF ---` is permanently on; the dial needle and numerals snap. | `hud.js:1443,3158,4278`; `hudStyles.js:1534-1540`; `bandHud.js:100-105` | MAJOR | A subtle hull ring/anchor mark; a single "active threat" bracket fed by the camera's composed threat; a two-glyph cargo/legal chip; clip the arc; hide the band row when null; tween the dial. | — |
| U10 | **Craft defects with owners:** payload caption across the hull (`masslineHud.js:780-822`); ROUTE label over the weapons label (no reserved lane); intercept lines colliding (no line-height floor, `sectorLawPresenter.js:84-86`); contacts rows overlapping on 3-line entries (`hud.js:1443`); radar clipping the frame bottom; New Game empty preview (`stageHull.js:67` mount failure renders nothing); selected vs focused hull chips both amber (`newGame.js:193`); difficulty text under the wrong chip (`newGame.js:29`); Codex rail clipped ~10 px; **Missions screen entirely outside the kit** (system font, no plates); pause HUD not dimmed with the scrim; station banner clipped, titles truncated; galaxy map labels colliding over the live scene, ENGAGE ROUTE clipped; Continue sub-line above the highlighted plate (`mainMenu.js:332`); settings label 1,000 px from its slider. | as cited | MAJOR (in aggregate) | One craft pass with a reserved-lane rule for the HUD and a clip/truncation lint on the UI matrix capture. | UI matrix capture shows zero overlaps/clips at 1280/1920/2560 |

### 4.7 Performance, saves, platform

Lead-verified against `weaponLights.js`, `vfx.js`, `renderer.js`, `compilePresentSlice.js`, `gpuTimers.js`.
What is **not** the problem, and should not be re-litigated: there is no 30 fps cap by default
(`frameCap 0` + vsync → display rate); the post chain is lean (bloom 2 levels, one composite pass, no
MSAA on the offscreen HDR route, 512² PCF shadows, drawing buffer 1832×973); the loop is present-first
with real snapshot interpolation (`renderer.js:7946`), `MAX_CATCHUP_STEPS 4` with a 1-step late-present
clamp and a reduced catch-up system set; steady CPU frame is ~10 ms of 16.7. The felt problem is
**hitch, load, and an unmeasured GPU**, plus one big invisible shading cost.

| # | Finding | Evidence | Severity | Edit | Proof |
|---|---|---|---|---|---|
| P1 | **22 point lights are permanently visible at zero intensity**, so `NUM_POINT_LIGHTS = 22` is baked into every lit program and the unrolled loop runs 22× per fragment on every lit pixel, every frame. Measured occupancy: median 0, p90 2, max 5. On a 15 W Xe part at 1.78 Mpx with ~1.5× overdraw this is plausibly 3–6 ms/frame of shading for zero pixels — the only per-pixel term big enough to explain a sluggish iGPU. (The constant-count design is deliberate and correct — toggling `visible` caused the 2026-07 recompile storm — the pool is simply 3× too big.) | `src/render/weapons/weaponLights.js:3,17-19`; `src/render/vfx.js:231`; three collects lights by visibility, not intensity | MAJOR (structural) | Size the pool to measured p90: **8 total** (6 event + 2 weapon, priority-evicted — the eviction already exists at `weaponLights.js:35-40`). One program key, no relink churn, invisible at p90 occupancy. Longer term: clustered light assignment. | GPU ms/frame before/after in a wave-3 swarm (needs P4); busy-Ceres worst frame 67 → ~40 ms |
| P2 | **Admission work is armed with `setTimeout(0)` after rAF, which lands in the compositor beat.** `externalScheduling` is the largest *named* hitch owner (today: 48 of 100 named; dispatch lag ~7–12 ms). | `src/render/compilePresentSlice.js:126-141`; consumers incl. `renderer.js:7767-7774` | MAJOR | `scheduler.postTask({priority:'background'})` / `scheduler.yield()` with an explicit slice budget. | `externalScheduling` hitch count → 0; long-task total in 20 s ≥ 4× lower |
| P3 | **The Continue route was never re-measured after the New Game wins**: 06:04 today, opening ledger 21.4 s, `capturedPipelineDrain 3001 ms timeout (12 still pending)`, `prepareLiveSectorBeforeFlight 15.9 s`; my New Game run under fleet load hit the same 20 s timeout (§3.10). | `.devshots/runtime-witness/report.md` 2026-09-14 06:04; `src/render/pipelineReadiness.js:585-661` | BLOCKER (load) | Make the drain resolve: link the 12 captured pipelines behind the shell in the same cohort as the opening (the admission plan already knows them); never enter flight with the identity gate failed. | ledger `capturedPipelineDrain` resolves; Continue → flying ≤ 8 s warm |
| P4 | **GPU time has never been measured.** Timer queries are default-off and PQ-144.01's attempt produced no samples; "presentation p95" is CPU time inside the present call. Every steady-fps conclusion is a CPU proxy. | `src/render/gpuTimers.js:1-6`; `PERF_WHAT_MATTERS.md` | MAJOR (instrument) | Arm `EXT_disjoint_timer_query_webgl2` for a witness window; print a GPU ms column per pass next to the CPU column. | the column exists |
| P5 | **Shadows are held off for the first 20 s of every flight** — a dodge for a stall the shadow-refresh gate already removed. This is exactly the first-encounter window. | `src/render/renderer.js:8863-8865` | MAJOR | Delete the `simTime < 20` clause. | shadows in frame 1; no frame > 34 ms |
| P6 | **Late-present catch-up clamp only arms from a presentation overrun**; a sim- or external-task brick still catches up to 4 steps next frame ("echoes 7 of 24"; today 27 echoes). | `src/core/presentationRunner.js:753,839-845` | POLISH | Arm `latePresent` on `frameDt > 2×fixedDt` from any cause. | echoes → ~0 |
| P7 | **Input-to-photon is ~2 frames by construction and unmeasured** (input sampled in callback N's leftover sim, shown in N+1, plus compositor). Nothing in the repo measures it. | `presentationRunner.js:832-854` | MAJOR (unknown) | Timestamp the input command and the first `drawPreparedFrame` reflecting it; print p50/p95 in the witness. | a number exists; target ≤ 33 ms |
| P8 | **Saves:** last-good recovery is real (validated copy to a recovery key, read-back checksum, rollback), migrations chained; but saves are localStorage mirrored over HTTP, not an fs rename; and an in-flight tow target without `flags.persistent` loses its body on load even though the attachment id survives. | `src/save/saveSystem.js:692,800-855`; `src/combat/persistence.js:6-18`; `tetherGameplay.js:148-150` | MAJOR | Flag any body on the player's line persistent for the save; one test: tow, save, load, line still taut with the same body. | test green; no duplicated or vanished tow target |
| P9 | **Electron adds GPU flags the browser never gets** (`ignore-gpu-blocklist`, `enable-gpu-rasterization`, `enable-zero-copy`), and saves only share when the loopback store answers (the witness logs a 404 under the probe server). | `electron/main.cjs:140-142`; `src/save/sharedPlayerStore.js:3` | POLISH | Document the divergence; make the browser route request the same GPU features where the platform allows; make the store failure visible. | parity table in the release checklist |

Closed and not worth another pass (measured by the campaign): bloom (0.3 ms), draw calls (22–96), Rapier
(66 bodies, 0.8 ms), GC (285 → 282 MB), shader prewarm (worse twice), Vulkan (worse), the catch-up amplifier.

---

## 5. The build plan

Five packages, in order. Each is a coherent unit of felt outcome, closes on **one headed capture at the
shipping camera graded by the critic** (`PQ-173.02`) **plus the felt-number scoreboard on the owner's
machine** (launch-to-flight, hitches in the first 60 s, hostile-in-frame fraction, input-to-photon), and
the first three each end with **one unaided 45-minute owner session** (`PQ-167.01`, un-deferred). Size:
S = a value or a line, M = a bounded change in one owner, L = cross-system. Existing packet owners are
named so the work lands in the queue, not beside it. Do not start Package 2 before Package 0 has been
played by a human; the first two are where "sluggish" and "not fun" live.

### Package 0 — The hands (≈ 1 week, almost all configuration)

The rule: one change at a time, re-run the same instrument, keep only what moves a felt number.

| # | Edit | Where | Size | Proves it | Owner |
|---|---|---|---|---|---|
| 0.1 | Below-cap coast assist becomes a settle: `neutralBrakeFraction` 0.44 → 0.10, `stopHorizonS` 2.35 → 4.0, no player-factor shrink, `turn` counts as manual (F1) | `propulsionCatalog.js:111-118,484-494`; `propulsionKernel.js:761` | S | hands-off from 95 keeps ≥ 90 WU/s at 10 s; reversal ≤ 1.6 s | PQ-137 (new leaf .12); FEEL_CONTRACT adds **B1b below-cap coast** |
| 0.2 | Captions off by default (U1) | `gameState.js:55` | S | no "Shield hit." at defaults | PQ-165 |
| 0.3 | Engagement scale: standoff 620 → 330, sniper 760/780 → 420, controller hold 460 → 300, interceptor extend/reform 620 → 300, capital 620 → 380, adventure spawn 900 → 520, Crucible spawn 220 → 260, enemy projSpeed floor 380; camera `THREAT_ZOOM_BASE/RANGE` 0.04/0.08 → 0.10/0.30, `THREAT_COMPOSE_MAX_BIAS` 42 → 70; player gun ranges unchanged, which leaves the player out-ranging a 330 standoff by 1.8× — the exit playtest watches explicitly for kiting from outside enemy range (C1, §3.1) | `combatDoctrine.js:682,708,…`; `enemies.js:43,292`; `encounterDirector.js:3199`; `waveMaterialization.js:18`; `camera.js:25,30-31` | M | **new bar B3b:** a hostile that is attacking is in frame ≥ 80 % of the time (Crucible seeds 4242/8008); diff, never re-record, the three 47-A goldens | PQ-137.03 / PQ-140 / PQ-174 |
| 0.4 | Impact feel reads the pre-solve closing speed (C2) | `sg02DynamicBodyOwner.js:163-171` → receipt `feelDeltaV`; `feel.js:125` | S | hitstop at 400 WU/s closing = 90 ms vs 54 at 40 | PQ-139 |
| 0.5 | Yaw accel/brake ×2 for the player only (F3) | `propulsionCatalog.js:31-43` | S | 90 % of rate ≤ 0.14 s; stop ≤ 0.09 s | PQ-137 |
| 0.6 | Camera lead in seconds (0.3–0.6 s of velocity, combat scale 0.6); `ZOOM_LERP` 1.4 → 4; boost zoom asymmetric to 1.10 (F4, F5) | `camera.js:42-48,248-257,1100-1107` | S | lead/speed 0.30–0.60 at 1–3× cruise; boost zoom 90 % ≤ 0.25 s | PQ-159 |
| 0.7 | Dash on press, 80 ms boost pre-kick, 0.2 s accel overshoot (F6) | `flightV3.js:92,347-390` | S | dash tick == keydown tick | PQ-137 |
| 0.8 | Mass → handling: taut line scales yaw and lateral authority by `1/(1 + 0.35·m_attached/m_hull)` (M1) | `propulsionKernel.js` + `flightV3.js:530` reading `twoBodyReducedMass` | M | 640-mass anchor → turn rate ≤ 60 %; 20-mass pod ≥ 95 % | PQ-137.07 / PQ-146 |
| 0.9 | Massline label prints mass, not confidence; throw default `'snap'`; thrust scaled to 25 % during line control; denied latches get a 1.2 s pill and a cue (M3–M6) | `tetherGameplay.js:2303`; `masslineThrow.js:605`; `input.js:1221`; `masslineHud.js` | S ×4 | label never < 42 gone; release tick == press tick; every denial has words and a sound | PQ-146 / PQ-164 |
| 0.10 | Armor gets its own sound; cue by hit surface, not gun family; brake bite; pickup cue (C3, U7) | `environmentMix.js:196,222`; `combatDefs.js:430-437`; `audioSystem.js:526,4407` | S ×3 | 3 recipe ids across shield→armor→hull; one brake cue per press | PQ-158 |
| 0.11 | Delete the 20 s first-flight shadow hold; light pool 22 → 8 (constant count — change it at every consumer, `visiblePointLightBudget` and the precompile staging included, and re-warm, or the 2026-07 recompile storm returns); admission via `scheduler.postTask` (P5, P1, P2) | `renderer.js:8863`; `weaponLights.js:3`; `vfx.js:231`; `compilePresentSlice.js:126-141` | S, S, M | shadows in frame 1; GPU ms/frame (after 0.12); `externalScheduling` hitches → 0 | PQ-129 |
| 0.12 | Instruments: GPU timer window in the witness; input-to-photon stamp; hostile-in-frame metric; bench summary prints MET / RED / UNMEASURED and a RED fails (P4, P7, §3.6) | `gpuTimers.js`; `presentationRunner.js`; `verbBench.mjs`; `run-fun-bench.mjs` | M | the three columns exist; today's three inner reds are visible | PQ-173 / PQ-186 |

**Exit:** owner session with a before/after scoreboard: hands-off coast, yaw, dash latency, hostile-in-
frame, hitches in the first 60 s, GPU ms. Keep what moved; revert what did not.

### Package 1 — The frame (≈ 2 weeks; the EDGE register of Field Hardware)

| # | Edit | Where | Size | Proves it | Owner |
|---|---|---|---|---|---|
| 1.1 | Build the approved HUD frame: objective, contacts, law, energy and radar on plates; payload label on a leader line clear of the hull; reserved lanes so nothing overlaps (U3, U10) | `hud.js`, `masslineHud.js:780-822`, `hudStyles.js`, `radar.js` | L | flight capture matches `frame-hud-resting.png` plate geometry; UI-matrix lint: zero overlaps/clips at 1280/1920/2560 | PQ-194.06 (P30–P38) |
| 1.2 | One attention arbiter for every text lane; captions, prompts, band, law and tip pass through it; surfaced and dropped lines go to the comms backlog (U2) | `voiceArbiter.js`; `hud.js:1873`; `controlPrompts.js`; `bandHud.js`; `sectorLawPresenter.js` | M | ≤ 2 transient text surfaces in any flight capture; backlog shows dropped barks | PQ-165 / PQ-180 |
| 1.3 | The three missing HUD facts: a hull mark for "me", a single active-threat bracket fed by the camera's composed threat, a two-glyph cargo/legal chip; bigger edge chevrons (U9, C8) | `hud.js`, `threatHalo.js` | M | stranger names ship, threat, objective in ≤ 3 s per frame (blind review) | PQ-161 / PQ-194.06 |
| 1.4 | Star smear capped at 2.5× and limited to the brightest decile; RCS jets ≥ 4:1; per-arena and per-sector sky rows at ≤ 40 % luminance; the spiral reserved for one sector (U4, U5, U8, §3.5) | `velocityLanguage.js:523`; `kestrelRecipes.js:228-243`; `sectorVisualProfiles.js` | S, S, M | no line > 60 px at 282 WU/s; directional jets at dock; different skies in Helios vs Crucible | PQ-190 / PQ-143 |
| 1.5 | 140 ms eased screen enter; timeouts from the token; hover / open / close cues; toast sounds by kind; dial needle and numerals tween; arc clipped to the bezel; band row hidden when null (U6, U9) | `kit.css:195`; `screenManager.js:220,453`; `kit/dom.js`; `audioSystem.js:1281`; `hudStyles.js:1534` | S ×6 | intermediate frame 80 ms into an open; cue log over a menu walk | PQ-194.06 / PQ-158 |
| 1.6 | Craft pass on the twenty named defects (§4.6 U10): New Game preview placeholder and chip states, Codex clipping, Missions screen onto the kit, pause dimming, station clipping and truncation, galaxy map lanes, Continue sub-line, settings alignment | as cited | M | UI-matrix capture, zero defects on the list | PQ-194.06 / PQ-194.07 |

**Exit:** a stranger looks at six frames (title, New Game, flight, fight, dock, station) and says which
game this is; the critic's `visual_stand_in`, `wrong_control_label` and `unreadable_decisive_threat`
blockers are clear on a Crucible strip.

### Package 2 — The first fifteen minutes (≈ 2 weeks)

| # | Edit | Where | Size | Proves it | Owner |
|---|---|---|---|---|---|
| 2.1 | One sentence at t = 0: tagline moves to the first swing; law, TOW pill and the 47-A comms line hidden until `onboarding.finished`; one hull name everywhere (O2) | `onboarding.js:272,1149,1164`; `crucibleFocus.js:64-98` pattern | M | t = 0 capture: one sentence; `check-first-15-runtime` green | PQ-163 |
| 2.2 | The spindle **is** beat 5: latch the 960-mass sealed load 92 WU from spawn, the HUD shows manifest 480 / measured 960, the nose drags (needs 0.8) (O1) | `onboarding.js:940-955`; `47aLiveScene.js:90-91` readers | M | first latch < 3 min on the spindle; both numbers on screen | PQ-163 / PQ-032 |
| 2.3 | A capability in the first dock: one Massline head at Helios for ~2,500 cr with no tech gate; RP seeded by the tutorial's own contracts (2 + 3); a board contract whose reward is a tech node; beat 10 branches on which tool you want (O3, O4) | `modules.js`; `missions.js:377-387,4945-4956`; `tech.js` | M | at 15 min the player owns a head they did not start with; a node researched before 60 min | PQ-155 / PQ-142 |
| 2.4 | Capability sentences for all 87 purchasables in the New Game voice, rendered in the shop; effect lines for the 16 unlabelled rigs; trial flight promoted beside Buy (O5, O7) | `shipworks.js:1940-1963,1357`; `modules.js`; `weapons.js` | M | every shop row reads as what you can now do | PQ-176.03 / PQ-142 |
| 2.5 | Name, paint, decal on the Shipworks nameplate calling the existing setter; the name in the HUD and station address (O6) | `ships.js:1885-1898`; `shipworks.js`; `hud.js` | M | the station addresses you by your ship's name | PQ-142 |
| 2.6 | Wave-10 Crucible clears grant the campaign the matching node's RP (O8) | `survivalUnlocks.js`; `survivalRecords.js` | S | campaign `researchPoints` moves after a run | PQ-169 |

**Exit:** a fresh unaided session (a real person): first latch under 3 minutes, a capability owned by
minute 15, and the player can name what they want to try next.

### Package 3 — The world answers (≈ 2–3 weeks)

| # | Edit | Where | Size | Proves it | Owner |
|---|---|---|---|---|---|
| 3.1 | Pirates attack haulers where the player starts: 329 `maxSecurity` 0.65 → 0.80 with a high-security `pressureCost`; a low-weight raider branch with `predation` on `070-convoy-departure` (W1) | `329-curtain-convoy.js:16`; `encounters/070` | M | 5 min stationary at the Freight Spine: a raid and a patrol response with no player input | PQ-138 / PQ-143 |
| 3.2 | Every ambient hauler has a name; the restitution line names owner, tonnage, cargo and destination (W2) | `traffic.js` manifest spawn; `barkDirector.js:100,477` | S | "MTS K-7 — 40 t iron ore for Ceres Foundry — demands restitution" on the comms log | PQ-138 |
| 3.3 | The witness choice is told; WANTED shows cause and witness on raise and a line on clear; kill heat is witness-gated like theft (W3, W4) | `lawSecurity.js:1551`; `hud.js:3244`; `heat.js:320,494` | S ×3 | the sentences appear within 10 s; no WANTED from an unwitnessed kill | PQ-151 |
| 3.4 | The shortage lands at the manifest destination, the headline names the player, cause-bearing lines are delivered at `comms` 55 or after `combat:outcome` (W5) | `traffic.js:8924-9061`; `newsTemplates.js`; voice priorities | M | the market row at the destination moves; one floor line names destination and tonnage | PQ-177 |
| 3.5 | "Since you undocked": the newest three provenance chains on the dock arrival card, using the Footprint formatters (W6) | `stationApp.js:17`; `screens/footprint.js` | M | docking after a fight shows act → incident → standing → consequence | PQ-177 / PQ-149 |
| 3.6 | Civilians get a perception delay keyed to distance and role (W7); enemies get aim error and a 150–250 ms reaction latency (C5) | `traffic.js:4335`; `weapons.js:781`; `gunnery.js` | S, M | civilian reaction 0.5–2 s by distance; enemy hit rate vs a burning target 95 → 55–65 % | PQ-140 |
| 3.7 | Bruiser time-to-kill ≤ 16 s (ion hull/armor multipliers) and one mass-130 medium that needs a setup (C4, C7) | `combatDefs.js:70-76`; `enemies.js` | S, M | bench TTK; the third mass category exists | PQ-140 |
| 3.8 | The line has a load rating on the spool ladder; too-heavy is a denial the HUD can say; the ladder gains its second axis (M2) | `combatDefs.js:332`; `attachments.js:62`; `previewStatusCopy` | M | the starter line denies the foreman; the ×3 spool takes it | PQ-142 / PQ-155 |

**Exit:** the critic's `unreadable_decisive_threat` and question 8 ("did anyone flee, choose or arrive
because of the violence?") pass on an adventure strip; the owner tells a "so then" story after a session.

### Package 4 — Ship it (a parallel lane from week 1)

| # | Edit | Where | Size | Proves it | Owner |
|---|---|---|---|---|---|
| 4.1 | Continue route: the 12 captured pipelines link behind the shell; never enter flight with the identity gate failed (P3) | `pipelineReadiness.js:585-661` | M | Continue → flying ≤ 8 s warm; `capturedPipelineDrain` resolves | PQ-129 |
| 4.2 | Advance-then-present on healthy frames; late-present arming from any brick (F2, P6) | `presentationRunner.js:753,832-854` | M | first-visible callback == press callback; echoes → 0 | PQ-129 |
| 4.3 | Persist any body on the player's line; tow-save-load test (P8) | `saveSystem.js:692`; `combat/persistence.js` | S | line still taut after load with the same body | PQ-033 |
| 4.4 | Parity table (Electron GPU flags, shared store failure made visible) and an opt-in "integrated GPU" panel for the visible knobs (P9, P-F13) | `electron/main.cjs:140-142`; settings | S | release checklist row | PQ-033 |
| 4.5 | The owner build: nightly build from the last commit that passed `check:baseline` + the headed witness, at a fixed path the desktop launcher uses (§3.12) | `scripts/`, `SpaceFace-Desktop.bat` | M | the owner's Saturday play never lands on a broken tree | PQ-167 |
| 4.6 | Queue hygiene: a felt-outcome unit cannot leave `implemented` without a shipping-camera strip graded by the critic; opening units additionally need one unaided session; un-defer PQ-167.01 as the ALPHA gate (§3.8) | `program-queue.json` state contract; `FEEL_CONTRACT.md` §D | S | the rule is in the state contract | PQ-186 |

**Exit, on the owner's machine with the fleet running:** launch ≤ 8 s warm, ≤ 3 hitches > 33 ms in the
first 60 s of a Crucible wave 3, input-to-photon p95 ≤ 50 ms, GPU ms/frame printed.

### Package 5 — Signature situations (after 0–3; the research report's eight, mapped to owners)

All eight are buildable from systems that already exist; none needs a new engine. The acceptance test
is the report's: a clever solution works through ordinary rules and the technique is useful elsewhere.

| Situation | Existing owners to compose | New content |
|---|---|---|
| The Freight Pendulum | `329-curtain-convoy` predation, custody (`PQ-177.06`), `masslineController`, `impulseKernel`, `aftermathWrecks` | one authored heavy freighter route around an anchor with a trailing cradle; escort screen doctrine |
| The Refinery That Breathes | `environmentalMachinery`, `fields.js` wells/`DistortionField`, `PQ-139.05` | one industrial pulse with a period, an exhaust field, a trapped recovery target |
| The Rescue Nobody Agrees About | `recoveryEncounters`, `survivorPod:ejected`, `custody`, `lawSecurity` witness, `stationContacts` | one disabled hull with survivor + disputed cargo + evidence, three claimants |
| The Capital Ship as Landscape | `dreadnought_boss` (mass 2000, capital broadside), `subsystems.js`, heavy-as-terrain (`PQ-140.01`) | two authored subsystem states (tractor mount, escort bay) that change its movement |
| The Customs Shadow | `customsPrompt`, `PQ-177.04` black market parcel, `lawSecurity` scan, `contactHail` | a scan lane with a periodic occluding carrier and a jettison/recover loop |
| The Raider That Comes Back Prepared | `namedAces.js`, ace memory, `specialistPlans` | one returning ace with a single readable counter (a cutter escort or a new ambush position) |
| The Industrial Rescue Chain | `npcJobsRuntime`, `sectorActivityPockets`, `regionalEcology`, tenders | one site whose lost hauler visibly starves it and diverts a tender |
| The Beautiful Bad Idea | rope + heavy wreck (`uniqueWrecks`), wells, `PQ-137.09` chains | one placement: huge movable wreck, a well, a pirate screen, cargo |

### How much of this is "small"

Of the 47 edits above, 22 are single values or single lines (S), 21 are bounded changes inside one
owner (M), and 4 are cross-system (L: the HUD frame, and three already-planned Field Hardware surfaces).
Nothing here is a new system, a new mode, or a new controller. That is the point: the game is not thin
because it lacks machinery; it is thin because the machinery is tuned for a bench and told to nobody.

### What to do Monday

1. Change the two coast numbers (0.1), flip captions off (0.2), delete the shadow hold (0.11), and
   play for five minutes. That is the fastest possible test of this whole report.
2. Ship the engagement-scale table (0.3) behind the new hostile-in-frame bar and re-capture the two
   Crucible frames.
3. Un-defer the weekly playtest and put the first one on the calendar.

---

## 6. What not to do

- Do not add enemies, ships, sectors or missions to fix feel. Every gap above is scale, configuration,
  information design or pacing.
- Do not restyle the UI from prose; the Field Hardware frames are the authority. Fix information design
  and craft inside them.
- Do not lower default quality to pass a frame-time gate; change *what* is rendered at a given tier
  so it is not visibly cheaper (see §4.7).
- Do not add a second camera, flight or tether controller. Extend `resolveChaseComposition`,
  `applySpeedGovernor`, `tetherGameplay`.
- Do not close a felt-outcome unit on a headless tape again.
