# BUILD PLAN — CORRECTED, DEDUPLICATED, RE-SEQUENCED

> Reviewer: lead-plan review pass, 2026-07-20, against live HEAD `3d2dc765`.
> This is the executable plan that falls out of `REVIEWER_DECISIONS.md` (the why)
> and `COLLISION_RESOLUTIONS.md` (the fold mechanics). It **replaces** the raw
> SF-00…SF-35 numeric order as a work order. The SF prompt files remain as the
> detailed brief library at `../PLANS/plans/` — each step below names the SF brief
> that binds it and the *corrections* this review adds on top.
>
> **How to read:** Section A = who owns what. Section B = the sequence with gates.
> Section C = per-step briefs in the user's format (problem → consequence → why bad →
> solution → how → what it looks like → forbidden shortcuts → evidence → authority →
> model routing). Section D = absorption ledger so no source material is orphaned.

---

## Section A — Program authority resolution

| SF-XX | Canonical ID (executes as) | Action | Live status of that ID | SF brief role |
|---|---|---|---|---|
| SF-00 | program roll-up | ALREADY_SATISFIED | NOW.md current | Retired; mapping table here is the artifact |
| SF-01 | Step 0 (graphics/perf lane) | ABSORBED | ACTIVE lane | Retired into Step 0 |
| SF-02 | new lab fixture (recommend T-family) | KEPT | new | Binding |
| SF-03 | T02/T03 delta | FOLDED | INTEGRATED | Binding for the delta |
| SF-04 | T04+T06+T07+T16 | FOLDED | PLANNED | Binding (corrected) |
| SF-05 | T05 | FOLDED | PLANNED | Binding (corrected, tuned per Q21) |
| SF-06 | T07 extension + D7 seam | FOLDED | PLANNED / D7 dirty | Binding (corrected) |
| SF-07 | T19 (recommended) | NEW-ID | new | Binding (replaced: pursuit-slot) |
| SF-08 | F18 (recommended) | NEW-ID | new | Binding |
| SF-09 | T08 prerequisite layer | FOLDED | T08 PLANNED | Binding |
| SF-10 | combat-systems step | KEPT | new | Binding (+ enemy balance) |
| SF-11 | T20 (recommended) | NEW-ID | new | Binding |
| SF-12 | T21 (recommended) | NEW-ID | new | Binding |
| SF-13 | T22 (recommended) | NEW-ID, Wave-2 | new | Binding (deferred) |
| SF-14 | depth W1/W2 | FOLDED | W1 IP-CP→treat TODO; W2 TODO | Binding (corrected) |
| SF-15 | W06 | FOLDED | PLANNED (+encounter-director RED) | Binding (corrected) |
| SF-16 | world-systems step, folds W03–W05 | KEPT | W03/W04 READY-PENDING, W05 BLOCKED | Binding (corrected) |
| SF-17 | interaction-grammar step (F18 wave) | KEPT | new | Binding |
| SF-18 | A12 extension | FOLDED | PLANNED | Binding |
| SF-19 | A15 kernel | FOLDED | PLANNED; `$.sites` row exists | Binding |
| SF-20 | depth H1a | FOLDED | TODO | Binding (corrected) |
| SF-21 | W-family (Ceres physical recomposition) | FOLDED | W07–W10 PLANNED | Binding (corrected, scoped) |
| SF-22 | W21 (recommended) | NEW-ID, Wave-2 | new | Binding (deferred) |
| SF-23 | A03/A04 | FOLDED | BLOCKED_BY_LEASE | Binding (gated) |
| SF-24 | A07/A09/A11 | FOLDED | PLANNED | Binding (A08 ruling) |
| SF-25 | A15/W17 | FOLDED | PLANNED | Binding (stage-1 scope) |
| SF-26 | travel: ALREADY_SATISFIED (atlas D1); manufacturing: late-P3 step | SPLIT | atlas ACTIVE | Binding (narrowed) |
| SF-27 | T11/T12/T13 | FOLDED, Wave-2 | PLANNED | Binding |
| SF-28 | T08/T09 | FOLDED, Wave-2 | PLANNED | Binding |
| SF-29 | T23 (recommended) | NEW-ID, Wave-2 | new | Binding (object-to-object) |
| SF-30 | depth A2 | FOLDED | IP-CP→`shipLedger.js` exists, 0 importers | Binding (wire, not rebuild) |
| SF-31 | depth S1–S4 via graphics checkpoint | FOLDED | S1/S2 TODO, S3/S4 IP-CP | Binding (corrected) |
| SF-32 | R01–R09 + VFX-language packet | FOLDED | PLANNED; D7 dirty | Binding (corrected) |
| SF-33 | G17/G18 | FOLDED | PLANNED | Binding |
| SF-34 | W12–W20 | FOLDED, post-corridor | PLANNED | Binding |
| SF-35 | R12–R18 + M6 | FOLDED | PLANNED | Binding |

---

## Section B — The corrected sequence

### The re-sequencing logic (what changed vs SF-00…35 and why)

1. **Step 0 is the repo's live "immediate next," not SF-00.** NOW.md (2026-07-19)
   orders the strict perf-contract rerun + evidence captures; the broken `precheck`
   rides along (Q25). The physics program does not start on an unverifiable tree.
2. **The massline control spine (SF-02→04→03→05→06) is one indivisible wave, pulled
   forward ahead of everything.** The roadmap had T04 in Wave-02 but T05/T06/T07/T16
   scattered later. Orbit assist is the user's single most-confirmed want (L421) and
   every later mechanic (sling, skim, heist, extraction) stands on it. SF-03 comes
   *after* SF-04 in the corrected order (input grammar must exist before the
   acquisition preview can latch through it) — the SF sequence had this backwards.
3. **The G-mode decision (SF-07) is prototyped in the lab during the control wave,
   not after the whole P0 phase.** It blocks corridor combat feel; it must not block
   the planet slice.
4. **Compound collision (SF-08) moves up ahead of weapon impulse consumers.** It is
   the keystone: no wrecks, no honest docking, no ricochet, no terrain-as-weapon
   without it. The SF sequence correctly placed it early; the corrected plan keeps
   it in Wave 2, parallel-safe with SF-09.
5. **The planet slice (SF-14) precedes the world slice (SF-15–21).** SF-16's heist
   needs the mass-driver planet; the Wreck Cathedral's home (SF-21's graveyard
   pocket) is defined by the recomposition, so SF-20 lands the *site* and SF-21
   lands the *placement* in the same wave.
6. **Asteroid-ops depth (SF-23/24/25) is cut to corridor-minimal scope** (one survey
   reveal, one claim stage) because the corridor (G17/G18) requires exactly one
   survey/operation milestone and one industrial consequence — no more.
7. **Everything specialized (SF-13, SF-22, SF-26-manufacturing, SF-27/28/29, SF-34)
   is Wave-2/post-corridor** per the restraint rule (L1851). SF-26's travel half is
   already satisfied by the atlas program.

### The order, with dependencies and gates

```
STEP 0  Baseline closeout            [NOW.md immediate-next + precheck repair]
        gate: strict perf contract green on one clean commit; precheck green;
              check:sim:compare ok/deterministic

WAVE 1 — THE TOY (massline control spine)
  1. SF-02  deterministic physics-control lab           deps: Step 0
  2. SF-04  input grammar (T04+T06+T07+T16)             deps: T16 lease granted
  3. SF-03  acquisition + pre-latch preview (T02/03 Δ)  deps: SF-04
  4. SF-05  orbit assist (T05)                          deps: SF-04, lab
  5. SF-06  release predictor + speed language (T07+)   deps: SF-05; D7 seam
  6. SF-07  pursuit-slot assist (T19)                   deps: lab; kill criterion
  GATE G1: Massline Proving Ground — 3 line lengths, 10 s stable orbit,
           green-window release, two-anchor chain, pursuit-slot hold;
           browser player-route capture; sim compare green.

WAVE 2 — PHYSICS COMBAT
  7. SF-08  compound collision + truthful docking (F18) deps: Step 0 (parallel-ok)
  8. SF-09  universal impulse kernel (T08 layer)        deps: physics authority
  9. SF-10  3 physics weapons + enemy light-tier balance deps: SF-09
 10. SF-11  Mass Seed anchor (T20)                      deps: SF-06
 11. SF-12  continuous field kernel (T21)               deps: SF-09, SF-11
  GATE G2: combat slice — setup/payoff kills on light-tier swarm, environment
           kill via terrain, Mass-Seed sling in empty space; VFX per toolbox.

WAVE 3 — THE PLANET
 12. SF-14  planetary sling + skim + reentry (W1/W2)    deps: SF-06, SF-08, SF-12
  GATE G3: the trailer moment, captured: sling release at the window, skim
           harvest, enemy reentry kill; Atlas record + physics one identity.

WAVE 4 — THE WORLD
 13. SF-15  NPC jobs (W06)                              deps: encounter-director fix
 14. SF-17  interaction descriptors + component targeting deps: SF-08
 15. SF-18  contextual beam + payloads (A12 ext)        deps: SF-17, SF-09
 16. SF-19  World Site kernel (A15)                     deps: SF-17, SF-18, save mutex
 17. SF-20  Wreck Cathedral (H1a)                       deps: SF-19
 18. SF-16  mass-driver heist loop                      deps: SF-14, SF-15
 19. SF-21  Ceres Belt recomposition (W-family)         deps: SF-20, SF-15, atlas W08
 20. SF-30  Ship's Ledger (A2)                          deps: SF-20, station-shell seam
  GATE G4: one recomposed sector with 2–4 pockets incl. the Cathedral off-lane;
           jobs visible in motion; one heist completed and fenced; ledger page
           earned; all through normal routes.

WAVE 5 — THE PROOF
 21. SF-31  visual families (S1–S4)                     deps: graphics admission gate
 22. SF-32  HUD/VFX/camera/a11y consolidation (R + VFX) deps: SF-06/10/12/14 visuals
 23. SF-23  asteroid exteriorization + survey (A03/A04) deps: render lease free
 24. SF-24/25 corridor-minimal (A07/A09/A11 + A15/W17 stage-1)
 25. SF-33  gold corridor 30/90-min (G17/G18)           deps: all above
  GATE G5: three careers × 30-min + representative 90-min, held-out seeds,
           browser+Electron, captures reviewed.

POST-CORRIDOR (Wave-2, re-plan at corridor gate): SF-13 (T22), SF-22 (W21),
SF-26 manufacturing (acceleration ring), SF-27 (T11–T13), SF-28 (T08/T09),
SF-29 (T23), SF-34 (W12–W20), then SF-35 release closeout (R12–R18).
```

**The single next safe step** (matching NOW.md): Step 0 — rerun the strict
performance contract on one clean commit with the measured ship-local batching
winner, capture the exact-head evidence, and repair the precheck assertion. The
first *physics-program* step after that is SF-02 (the lab).

---

## The Trackpad Ergonomic Contract (binding on every control step)

The user flies a **trackpad and keyboard**. This is a hard design constraint, not a
preference, and it produces one rule that the failed G-modes all violated:

> **The cursor is for aiming; the keys are for flying; the thumb (Space) is for the
> massline. No core maneuver may require cursor and keys simultaneously.**

Concretely, for every step below:
- **Untethered:** arrows/WASD fly; cursor aims weapons and free tether targeting;
  LMB fires; RMB is the contextual tool; Space latches the *previewed* candidate.
- **Tethered:** arrows + Space run the entire orbit/reel/pay-out/pump/cut grammar;
  the cursor is free to aim at *other* things (the next anchor, an enemy).
- **Dogfighting:** pursuit-slot is *set* by a trackpad drag and persists; the ship
  stations itself within bounds; any movement key instantly returns manual control;
  the cursor never stops being the aim channel.
- **Every assist shows its inferred action** (Law 8) and is bounded, overridable in
  one sim tick, and tuned in the deterministic lab before any player-route tuning.
- Modifier chords that demand two hands doing two things at once (the D+F failure,
  L1663) are forbidden. The 150–250 ms input-history window replaces simultaneity.

---

## Section C — Per-step build briefs

Steps are numbered in execution order. Each brief is self-contained; the SF prompt
file of the same number carries the long-form context and is *included by reference*
with the corrections stated here binding where they differ.

---

### STEP 0 — Baseline closeout and verification repair

**Problem.** The broad `npm run check` chain is dead on arrival in `precheck`
(`check-m1-tether-mass-grounding.mjs:24` asserts a `check:ci` inlining that the
foundation refactor removed), and the strict performance contract has not been
re-run on one clean commit since the batching experiments were rejected.
**Consequence.** Every later integration gate that requires broad verification is
built on a red baseline, and "green subset" results will silently paper over it.
**Why it's bad.** A physics program that cannot run its own golden gate is teaching
every agent that red tooling is normal — the exact failure normalization the repo's
rules exist to prevent.
**Proposed solution.** Land NOW.md's immediate-next as written, plus the one-file
precheck repair, before any feature work.
**Direction of how.** Rerun the strict final performance contract on one clean exact
commit with the measured ship-local batching winner; capture exact-head propulsion
settings/accessibility, natural Helios/rock motion, and combat/destruction GPU
evidence per NOW.md:46–53. Repair the precheck by pointing the grounding assertion
at the refactored `check:ci` delegation contract (or restoring the inlined command
the assertion expects — whichever the foundation refactor intended). Re-verify
`check:sim:compare` and `check:sim:v3:compare` after. Remeasure the three other
recorded reds (encounter-director, save-schema dirty-tree, sim:v3 envelope) and
re-attribute; do not fix them here.
**What it looks like.** `npm run check` runs to completion; the perf contract
produces one clean-commit record; the reds list is current and owned.
**Forbidden shortcuts.** (1) Editing the precheck to skip the assertion instead of
fixing it. (2) Re-recording any golden/expected data to get green. (3) Declaring the
baseline closed from a subset run. (4) Touching the graphics-overhaul worktree's
paths from master. (5) Bundling any feature change into this step.
**Acceptance evidence.** `npm run check` exit 0; strict perf contract artifact on a
named commit; `check:sim:compare` ok/deterministic; receipt lists remaining reds.
**Authority/lease.** Test/tooling seam owns the precheck file; lead owns the ledger
transaction; no `src/render/**` edits (graphics lane).
**Model routing.** Backend/no-vision.

---

### STEP 1 (SF-02) — Deterministic physics-control laboratory

**Problem.** Every control constant in the plan (orbit PD gains, pursuit-slot gains,
predictor cadences) is currently "tune through playtesting" — which in practice means
an agent guesses once and ships it.
**Consequence.** The single biggest implementation risk in the whole program (flagged
in both design packages) goes undischarged, and control feel becomes unreviewable.
**Why it's bad.** Feel is the product here. An orbit assist that ricochets is worse
than none — it actively teaches the player the massline is broken.
**Proposed solution.** A deterministic laboratory: headless fixed-step harness that
spawns ship + anchor + tether, replays recorded input scripts (including
trackpad-sampled traces), runs the controllers, and emits traces (radius error,
tangential fraction, tension, settle time, oscillation count) plus a grid-search
runner.
**Direction of how.** Reuse T01's `masslineOrbitTelemetry.js` — do not rebuild
telemetry. Pure kernel module (no render), seeded `state.rng`, fixed dt, scripted
input timelines, JSON trace output, and a sweep mode over (Kr, Kd, Ts) × (line
length, speed, anchor mass). Acceptance matrix runner for Q21. Property tests:
rotational symmetry, fail-closed on NaN, determinism of repeated runs.
**What it looks like.** `npm run check:massline:lab` (new focused script) prints the
acceptance matrix; a tuning change shows up as a matrix delta in the receipt.
**Forbidden shortcuts.** (1) Lab physics that diverges from live Flight V3 command
path. (2) Wall-clock or unseeded randomness. (3) A lab that tests the controller
against a kinematic fake anchor instead of the physics authority. (4) Golden traces
re-recorded without a named decision. (5) A debug-only lab the implementer can't run
from npm scripts.
**Acceptance evidence.** Lab runs deterministic twice (hash-equal traces); acceptance
matrix exists and fails on a deliberately detuned controller; `check:sim:compare`
unaffected.
**Authority/lease.** No render/input/save paths. New test/tooling files only.
**Model routing.** Backend/no-vision.

---

### STEP 2 (SF-04 → T04/T06/T07/T16) — Massline input grammar: latch, cut, reel, pay-out, buffered intent

**Problem.** The massline — the project's best toy — is a secondary key (F) with a
frame-perfect chord requirement (D+F, L1663), no pay-out (L1700), and surprise
latches. Holding thrust+turn while tethered fights the tether (L421).
**Consequence.** The toy is inhibitory beyond two tricks (L447), and whole designed
activities (skim, sling chains) are unreachable.
**Why it's bad.** This is the game's signature control surface; if it costs effort,
nothing downstream matters.
**Proposed solution.** One thumb action with a tap/hold grammar and a line-control
modifier mode, on Space, specified through the T16 input lease.
**Direction of how.** Input state machine: `idle → preview → latched → line-control`.
**Latch fires on press, never delayed** — tap/hold is disambiguated after the latch
by hold duration (F8 resolution). Space press (unattached) = latch the previewed
candidate if confidence suffices; no candidate = dry-fire acquisition sweep, never
attach to an unseen object behind the player. Attached: quick tap = cut; hold past
the forgiving, visually-signaled threshold = line-control mode (release does *not*
cut). Line-control: Up/forward = reel in; Down/reverse = **pay-out (new primitive,
L1700)**; Left/Right = orbit-direction bias; Shift = boost-pump. Input-history
window 150–250 ms so near-simultaneous keys count as combined intent — never
frame-perfect. Space is canonical; F remains an alias; both rebindable; existing
saves keep F-primary via profile migration, new profiles get Space (Q7). Ship the
pay-out as a first-class line-length rate through the same telemetry as reel.
**What it looks like.** Tether an asteroid with Space; hold Space+Up+Left and the
spin tightens and quickens; hold Down and the arc widens; tap Space and you cut
clean. One hand on arrows, thumb on Space, cursor free the whole time.
**Forbidden shortcuts.** (1) Editing `src/systems/input.js` outside the T16 lease.
(2) Delaying the latch to decide tap-vs-hold. (3) Attaching without a previewed
candidate. (4) Pay-out as a separate key (keyboard tax, Law 3). (5) Requiring
simultaneity (chords). (6) Removing the F alias. (7) Default-off grammar.
**Acceptance evidence.** `check:massline:reelpump`, `check:massline:release`,
input-contract tests for the new `actions.*` semantics; public route: acquire →
orbit → pay-out → reel → cut using arrows+Space only (trackpad idle), captured on
browser; determinism compare green.
**Authority/lease.** **LOCKED input** — semantics specified here, edit only via T16
lease owner. Consumes/extends `actions.*`; telemetry owner for line-length rate.
**Model routing.** RECOMMENDED (frontend review of the modifier signaling).

---

### STEP 3 (SF-03 → T02/T03 delta) — Intent-aware tether acquisition + pre-latch preview

**Problem.** Tethering requires aiming precisely at a small target with a trackpad
while flying — the user's own 3-signal design (L1650) is only partially embodied in
the integrated T02/T03 scorer.
**Consequence.** Players either can't tether what they intend, or the game tethers
the wrong thing — both read as "the massline doesn't work."
**Why it's bad.** Acquisition is the front door to every massline verb; a 10% wrong-
target rate at the door kills the toy.
**Proposed solution.** Verify the integrated scorer covers the user's three signals
with the highest weights; add the missing signals and the pre-latch preview; never
replace the integrated scorer.
**Direction of how.** First, audit T02/T03's scoring against the user's signals —
**(1) closeness to ship, (2) turn-key direction, (3) cursor-center proximity** — and
confirm they are the three highest-weighted terms (expansion signals from gravity 02
— approach geometry, mass context, route, combat focus, candidate memory — must not
dilute the top three; B12 nuance). Add the delta only: turn-direction alignment if
missing, hysteresis/candidate memory if missing, and the **pre-latch preview**: the
current best candidate shows a subtle bracket + a one-word intent label ("orbit",
"tow", "fling") before Space is pressed (Law 8: always show the inferred action).
Preview flicker is killed by hysteresis (candidate must lose by a margin for ~200 ms
to switch). Profiles (Anchor/Combat/Tow) re-weight but keep the user's three on top.
**What it looks like.** As you nudge toward an asteroid, its bracket breathes in;
the game shows you what it *thinks* you want; you press Space and get exactly that
rock — never the one behind you.
**Forbidden shortcuts.** (1) Rebuilding the T02/T03 scorer instead of extending it.
(2) Closest-thing-only targeting (the user explicitly rejected it, L1650). (3) A
preview that lies about the actual latch target. (4) Cursor-only weighting (trackpad
aim is imprecise by nature). (5) Preview flicker at decision boundaries. (6) Secret
target changes at fire time.
**Acceptance evidence.** `check:massline:target-scoring` extended with 3-signal
weight pins; acquisition accuracy test across crowded scenes; public route: tether
the intended target 19/20 across a scripted clutter run; preview == latch asserted
in tests.
**Authority/lease.** Combat/targeting seam; HUD cue via `ui:*` presentation only.
**Model routing.** RECOMMENDED (vision review of the preview readability).

---

### STEP 4 (SF-05 → T05) — Anchor-relative orbit assist (the user's #1 ask)

**Problem.** Tethered steering turns too fast or too slow for line length and speed:
the player ricochets against the constraint, spirals into the anchor, or stalls the
swing (L421, SF-05 problem statement verbatim).
**Consequence.** The slingshot fantasy — the game's signature moment — is
inaccessible in practice, and "hold thrust + turn to orbit" feels broken.
**Why it's bad.** This is the most-confirmed user intent in the entire corpus
(L421/L423/L1661). It is also invisible-assist design at its purest: detect the
obvious intent, supply the precision, never choose the maneuver.
**Proposed solution.** A bounded PD orbit assist in the anchor-relative frame,
engaged only by explicit intent, tuned by the Q21 procedure in the lab.
**Direction of how.** Frame: `r = pShip − pAnchor; rHat = r/|r|; tHat = ±perp(rHat)`
(sign = player-chosen orbit direction). Decompose relative velocity into `vRadial`
and `vTangential`. Desired yaw rate `ω* = clamp(vT / max(R, Rmin), −ωmax, +ωmax)`
routed through `turnIntent` — **never write `rot`/`angVel` directly**. Radial
correction `aRadial = clamp(−Kr·lengthError − Kd·vRadial, −aRadialMax, +aRadialMax)`
with `aRadialMax = 0.20 × maxThrustAccel`. Engagement requires: tethered, anchor
mass ≥ `anchorMassRatioMin` (= 50× player mass), line taut, forward held, exactly one
lateral held, no brake, no armed throw, no modal UI. Disengagement: release lateral
or any override → assist fades within one tick; reversal is allowed, costly, and
settles (no instant sign flip). Tuning per Q21: seed `Ts = 2.0 s`, `ωn = 4/Ts`,
`ζ = 1.0`, `Kd = 2ζωn`, `Kr = ωn²` in normalized authority units; grid-search
[0.5×, 2×] in the lab; lock as `orbitAssist.tuning.v1`. Strengths: Full/Standard/
Light/Off — **Standard default, first-session Full grace stepping down at first
successful release** (Q6). Light towables are not anchors: shared-motion mode or no
engagement.
**What it looks like.** Hold thrust+left tethered to a big asteroid: the ship
settles into a taut, quickening swing within two seconds, the camera eases out, the
line stays loaded; reel in and the spin whips faster; let go of left and you're
simply flying again. Ten-second orbits at three line lengths, zero anchor contact.
**Forbidden shortcuts.** (1) Positioning the ship on a circle per tick. (2) Direct
velocity/angular-velocity writes. (3) Erasing strain/radial motion entirely (it's an
assist, not a rail — overstrain must still threaten). (4) Gains tuned for one
radius/mass. (5) Engagement without explicit intent, or assist that can't be
overridden instantly. (6) Invisible engagement — the assist state cue (minimal HUD
tick) is required. (7) Free energy: any launch bonus must be explicit, bounded,
provenance-tagged (gravity 06 Phase-3 invariant).
**Acceptance evidence.** Lab acceptance matrix green (3 lengths × 3 speeds × 3
anchor masses: no anchor contact, tangent-dominant within 2 s, 10 s sustained, no
oscillation); `check:massline:telemetry`; live-route capture of the SF-05 checkpoint;
`check:sim:compare` ok; saturation/override telemetry in receipt.
**Authority/lease.** Physics authority for all corrections; Flight V3 command path;
T01 telemetry consumed, not modified.
**Model routing.** OPTIONAL vision (backend implementation; semantic telemetry is
the gate).

---

### STEP 5 (SF-06 → T07 extension) — Release predictor, validated sling course, and speed language

**Problem.** Release timing is blind luck; earned speed has no presentation; the
user's screen-edge red→green window (L1656) doesn't exist.
**Consequence.** Slingshots are spam-and-hope; the trailer fantasy of chaining
planets can't be built on chance.
**Why it's bad.** The skill the game asks for (time the release) must be *readable*
to be fun — this is the difference between a rhythm game and a slot machine.
**Proposed solution.** A shared trajectory predictor (same physics as the ship —
coherence, not realism), release-window computation, Arm/Snap release modes, the
accessible release UI (Q8), and camera speed language.
**Direction of how.** Predictor solves at **10–20 Hz on sim ticks**; consumers use
the interpolated solution stream every tick (Q22 — "frame" means latest sampled
solution). Arm mode: hold Space; the system cuts on the first tick inside the
interpolated window. Snap mode: tap within a forgiveness window; the system applies
a bounded phase correction (explicit, small, telemetry-logged — never a hidden
reroute). Route compiler samples entry envelopes (speed band, orbit direction,
tether length) and reports reachable windows per anchor pair — consumed by the
proving-ground course and later by sling-route content. Release UI per Q8:
**rotating screen-edge segment that decelerates, locks, and expands in-window +
pulse-frequency ramp + triple-pulse at close + filling chevron on the tether arc;
amber→cyan, never red/green alone; reduced-motion collapse to a static bracket.**
Camera: smooth zoom-out with physics-earned speed **regardless of source** (L1656),
orthographic scale punch on release, implemented against the D7 camera seam (FLAG 13
— if D7 is still dirty, ship predictor + UI now, camera hooks behind the seam).
Velocity provenance tags (Thruster/Massline/Gravity/Explosion) recorded for the HUD
and later the ledger.
**What it looks like.** Spinning around the planet, the screen edge breathes amber,
faster; it locks cyan; you tap at the triple-pulse and slingshot down the predicted
arc as the camera pulls wide. Miss, and the arc shows you where you would have gone.
**Forbidden shortcuts.** (1) Preview physics differing from gameplay physics (the
cardinal coherence sin). (2) Color-only release cues. (3) 60 Hz re-solve (perf).
(4) Camera yaw (anti-nausea contract). (5) Arm mode that picks the *destination*
for the player — it times the release toward the armed target only. (6) Invisible
teleport presented as momentum. (7) Forgiveness corrections large enough to feel
like a reroute.
**Acceptance evidence.** `check:massline:release`, `check:massline:release-feedback`;
predictor-vs-actual divergence test (preview == physics); a11y capture
(colorblind-sim + reduced-motion); proving-ground two-anchor chain on the public
route; camera evidence after D7 merge via `check:camera:velocity-language`.
**Authority/lease.** Camera via D7 seam only; predictor is a pure kernel; HUD via
`ui:*`.
**Model routing.** YES (strong frontend/vision pair).

---

### STEP 6 (SF-07 → T19 recommended) — Pursuit-slot assist; retire the flailing G-mode

**Problem.** The G/trackpad dogfight mode is a chronic, user-documented failure
(L431–437): fly-toward-cursor, the flailing arrow, the path-drawing that never
landed. It remains a flailing false promise in the build.
**Consequence.** Combat flight on a trackpad is either manual-and-hard or
assisted-and-broken; the user himself is unsure the primitive can work (L593).
**Why it's bad.** A broken assist is worse than none — it destroys trust in every
other assist. And combat is half the corridor.
**Proposed solution.** Replace G-mode with **Pursuit Assist**: a target-relative
station-keeping controller where the trackpad sets a persistent bearing/range slot
around a locked target and a bounded PD controller holds it — prototype-proven in
the lab with a kill criterion (Q5), then wired. Retire the gesture-path follower.
**Direction of how.** Slot: `p* = pTarget + range·[cos bearing, sin bearing]` in the
target frame; trackpad drag adjusts (bearing, range) and the slot **persists** — no
continuous path input, so the cursor is never stolen from aiming. Controller:
bounded position PD toward `p*` with velocity feed-forward of the target's motion,
authority capped (assist-class, not autopilot-class), deadband inside the slot,
immediate disengage on any movement-key input (one tick). Not a mode: an assist
layer with an explicit on-state cue, composable with tether (you can pursuit-slot a
target while tethered elsewhere). Kill criterion in the lab: trackpad-sampled slot
inputs on a weaving target → hold slot within tolerance 10 s, zero oscillation
("no flail"), slot transition settle ≤ 2.5 s, manual override ≤ 1 tick. Two focused
iterations (defined: implement → lab-trace → route-capture cycles) to pass; else
retire G entirely and document the evidence (Q5 fallback).
**What it looks like.** Lock a pirate, nudge the trackpad up-left: your ship sweeps
into a high-front slot and holds it while you shoot with the cursor; arrow keys and
it's yours again instantly. No arrow-HUD. No path drawing. No flail.
**Forbidden shortcuts.** (1) Any control scheme that consumes the cursor for
steering during combat. (2) Kinematic path playback. (3) Persistent auto-aim of
weapons (the slot stations the *ship*; aiming stays the player's). (4) A mode that
hides its active state. (5) Shipping the A/B instead of deciding (scope double).
(6) Keeping the gesture follower as a hidden default-on fallback.
**Acceptance evidence.** Lab kill-criterion trace; public combat route with pursuit
assist (lock → slot → kill → disengage); override latency test; G-mode retirement
diff (default-off + dead-path removal or documented archive).
**Authority/lease.** Input semantics via T16 lease; Flight V3 command path; target
lock from the T02/T03 scorer.
**Model routing.** YES (control-systems + browser/vision).

---

### STEP 7 (SF-08 → F18 recommended) — Compound planar collision proxies + truthful exterior docking

**Problem.** Ships fly through station walls like vapor; a spherical core unrelated
to the mesh is the only solid thing; docking means bonking that core until the zone
forgives you (L412–415, verbatim).
**Consequence.** No wreck channels to fly, no honest docking, no ricochet slug, no
terrain to dash enemies against — the entire physical-combat and world-site program
floats on a lie.
**Why it's bad.** This is the keystone primitive; the user's decisive pushback was
*about this*. Skipping it and building hero content first is "the original mistake"
(B1).
**Proposed solution.** Data-driven compound 2D collision proxies (circle/capsule/
OBB/convex chains) registered per station/wreck type, plus docking as corridor +
capture volume + berth — proven on one authored station.
**Direction of how.** `collisionProxyManifest` per visual asset: proxy primitives
with flags `collides: true, renderable: false, targetable: false, radarVisible:
false`, registered with the physics authority as compound static shapes (Rapier
compound/collider sets, not per-frame mesh rebuilds). Chain-of-circles approximates
long slabs while leaving real navigable gaps (depth 01's own concession — ship it).
Docking: an exterior corridor volume with speed/heading gates feeding a capture
volume that applies a **bounded PD capture assist** to the berth (same shape-input
philosophy as orbit assist; never a teleport, never a yank). One authored station
(Helios) is the proof; a toggleable debug overlay renders proxies over visuals for
alignment review (Foundation J).
**What it looks like.** You clip a station arm and *bounce off the arm*. You thread
the deliberate gap. You fly the lit corridor and settle into the berth. The visible
silhouette is the collision silhouette.
**Forbidden shortcuts.** (1) A central circle under a beautiful mesh. (2) Per-frame
collider rebuilds or unbounded proxy counts. (3) Teleport-to-dock or capture that
seizes the ship. (4) Proxy/visual silhouette divergence. (5) Walkable interiors or
full triangle collision (explicit non-goals). (6) Editing renderer paths under the
graphics lease for the debug overlay — sim-side data + existing debug draw.
**Acceptance evidence.** Collision contract tests (proxy count bounds, flags,
silhouette Hausdorff bound vs authored mesh); corridor docking on the public route
(G04-style clean dock through the corridor, not the wall); `check:physics-authority`
green; debug-overlay capture showing proxy/visual alignment.
**Authority/lease.** Physics authority registration; station visual owner
coordination for manifests; no render-lease paths.
**Model routing.** YES (physics/geometry + frontend reviewer for the docking feel).

---

### STEP 8 (SF-09 → T08 layer) — Universal weapon impulse + collision-consequence kernel

**Problem.** Combat is "pew-pew = damage" (L439): weapons differ only in DPS, so
fights are hold-button-until-dead, and the user's clear preference — *every weapon
knocks back* (L1686) — is unimplemented.
**Consequence.** The physics-weapon catalog (SF-10) has no substrate; massline throws
and terrain kills have no receipt channel.
**Why it's bad.** Setup/payoff combat (the declared fun source) is impossible when
the only consequence of a hit is HP.
**Proposed solution.** A data-driven impulse kernel: every weapon family declares
impulse identity; every impact routes through the physics authority with provenance;
collisions convert momentum into stagger/tumble/terrain receipts.
**Direction of how.** Weapon data gains `impulsePerHit` (vector, mass-scaled),
`tumbleTorque`, and `impulseProvenance`; application via
`combatPhysics.applyImpulse(entityId, impulse, provenance)` through the physics
authority — with a **new-path membrane contract test that fails on any new direct
velocity write** in weapon/impulse paths (Q26; the 17 legacy violations go on the
named debt list for an F-family repair packet, not fixed here). Collision
consequence: relative momentum at contact → (stagger duration, tumble state, impact
damage multiplier vs terrain/structure, debris spawn) resolved by existing combat/
physics owners. Starter cannon: near-zero impulse per the user's explicit exemption.
Knockback-forward weapons: high impulse, low damage — a legitimate build (L1686).
**What it looks like.** A concussion slug picks a light fighter up and *puts him in
the wall*; the wall impact is its own event with its own receipt; your starter
cannon still just plinks.
**Forbidden shortcuts.** (1) Direct velocity writes. (2) Identical impulse across
families (the forbidden shortcut the gravity package named). (3) Impulse without
provenance tags. (4) Fixing the 17 legacy violations in this step. (5) Compensating
for impulse with HP sponges. (6) Damage numbers presented as physics (fake knockback
animations).
**Acceptance evidence.** `check:impulse:authority`; membrane contract test red on an
injected direct-write; combat route capture: concussion → tumble → terrain impact →
receipt; determinism compare green.
**Authority/lease.** Combat/weapons seam; physics authority; **no** heat/economy
writers.
**Model routing.** NO vision (backend combat/physics).

---

### STEP 9 (SF-10) — Physics-weapon vertical slice: concussion cannon, vector mine, RCS disruptor — and the expendable-swarm rebalance

**Problem.** The weapon sandbox has no verbs, and current enemies are "kind of
difficult and require a lot of shooting" (L1706) — HP sponges that make physics
combat rare instead of constant.
**Consequence.** Even with the impulse kernel, fights stay Galaga; the setup/payoff
loop never becomes the default experience.
**Why it's bad.** The user's fun sources are explicit: expendable swarm enemies,
twitchy physics combat, environment-as-weapon. Enemy *balance* is half this step —
the SF plan under-weighted it (this is a reviewer correction, not a nitpick).
**Proposed solution.** Ship three visibly distinct setup/payoff tools on the impulse
kernel, and rebalance the enemy mix so light-tier ships dominate and die to one
setup + one payoff.
**Direction of how.** **Concussion cannon**: low-damage slug, directional
mass-scaled impulse, tumble trigger — VFX: mesh shockwave layer + instanced debris
burst + camera trauma (gravity 05 toolbox, supplying the F-q7 missing spec).
**Vector mine**: deploy behind, manual R detonation, radial impulse that *also
affects the player* (blast-yourself mobility, L457–458; zero hull damage per Q9,
cost via capacitor/heat). **RCS disruptor**: subsystem hit reducing yaw/strafe
authority with visible sparking/attitude drift (reuse existing EMP/tumble systems).
Enemy rebalance through `encounterDirector` mix + per-tier data: **light = dominant
tier** (low hull, high impulse response, dies/disengages after one setup+payoff),
medium = needs one status or environmental combo, heavy = rare, mass-anchored,
component-weak-pointed. Knocked enemies must meet terrain, fields, or recover with
a readable re-approach — never "fly off and get lost" (L455).
**What it looks like.** A swarm of six lights boils in; you concussion two into the
asteroid, mine-boost backwards through the gap while the mine scatter reloads a
third, disruptor the leader and watch him drift into your tether arc. Fights last
seconds, not magazines.
**Forbidden shortcuts.** (1) DPS upgrades dressed as physics weapons. (2) Enemies
despawning off-screen after displacement. (3) Mines that don't move the player.
(4) Starter-cannon power creep. (5) All three weapons sharing one VFX. (6) Reaching
the balance target by nerfing player damage instead of restructuring enemy tiers.
**Acceptance evidence.** Three weapons each with distinct impulse/status receipt +
distinct VFX in a normal encounter; enemy-mix data showing light-tier dominance;
public combat route: kill via terrain, via mine, via disruptor+tether; tier
characterization tests.
**Authority/lease.** Weapons/impulse-charges seams; encounterDirector for mix; no
render-lease paths for VFX (use the vfx/energyMaterials seams per gravity 06's
audit list).
**Model routing.** YES (combat systems + VFX/frontend).

---

### STEP 10 (SF-11 → T20 recommended) — Deployable anchor Mass Seed

**Problem.** Empty space has no anchors: the sling toy stops existing exactly where
fights and escapes happen.
**Consequence.** Massline play is gated on asteroid geography; the user's own Mass
Seed idea (L810, L1672) goes unused.
**Why it's bad.** A signature multi-use tool — anchor from nothing — is the
difference between "physics game near rocks" and "physics game everywhere."
**Proposed solution.** A launchable, frame-locking, high-effective-mass temporary
anchor (Anchor mode first; Well mode is Step 11's field-kernel consumer).
**Direction of how.** Launch toward cursor or deploy at ship; after a short arming
fuse it locks to the local frame with very high effective mass (tetherable anchor,
*not* an attractor); one or two max per player; bounded duration with a visible
expiry warning and a graceful constraint handoff — an expiring seed warns, fades,
and releases the tether with a bounded nudge, never orphans a constraint or snaps
the ship. Uses the standard acquisition preview (Step 3) so it is teth erable like
any anchor.
**What it looks like.** Chased in open space: seed out, tether, one hard swing,
release backward down your own wake — pursuers keep going the other way.
**Forbidden shortcuts.** (1) Anchor mode that also attracts (that's Well mode —
different verb). (2) Orphaned tether constraints on expiry. (3) Unlimited seeds
(economy of scarcity is the balance). (4) A one-use "black hole ultimate" with no
traversal utility (gravity 03's own forbidden shortcut). (5) Invisible expiry.
**Acceptance evidence.** Seed → tether → orbit → release in open space on the
public route; expiry handoff test (no NaN, no constraint leak); determinism green.
**Authority/lease.** Physics authority for the body; weapons/inventory seam for
count/cooldown.
**Model routing.** RECOMMENDED.

---

### STEP 11 (SF-12 → T21 recommended) — Continuous field kernel: well, repulsor, clearing cone

**Problem.** Gravity weapons (the user's L1672–1678 proposals) have no shared
primitive — each would otherwise be a bespoke special case with its own physics lies.
**Consequence.** Mass Seed Well, Repulsor Seed, and the clearing cone can't exist
coherently; prediction can't show field effects.
**Why it's bad.** Fields are the second half of "environments are combat equipment."
**Proposed solution.** One deterministic, finite-radius continuous-field primitive —
register/unregister, strength, falloff, filters, capped acceleration — powering
three consumers, with flow-field VFX and predictor integration.
**Direction of how.** `forceFields.register({id, kind, center, radius, strength,
falloff, durationS, sourceId, filters})`; per-tick force accumulation inside the
sim (deterministic), acceleration-capped, selective coupling (strong vs light
bodies/projectiles/marked targets; weak vs heavy). Consumers: **Well** (Mass Seed
well mode — pull, never a stun sphere), **Repulsor Seed** (outward burst, fire into
a crowd or drop behind), **Directional Cone** (forward clearing wedge — the
"gravitic snowplow"). VFX: flow-field advected particles (inward spirals vs outward
streaks), SDF field boundary, refractive vector-flow volume for the cone — never a
flat colored triangle. Predictor shows field-influenced trajectories (same kernel,
coherence).
**What it looks like.** Well a swarm into a knot and torpedo the knot; drop a
repulsor behind you mid-chase; cone-plow a debris field into a corridor.
**Forbidden shortcuts.** (1) DoT circles called gravity. (2) Teleporting bodies into
fields. (3) Uncapped acceleration (heavy ships must shrug). (4) Per-particle Mesh
VFX (instanced only). (5) Field forces outside the fixed-step sim (render-side
fakes). (6) A stun that removes enemy agency instead of moving them.
**Acceptance evidence.** Field determinism test (same seed, same trajectories);
coupling-selectivity tests (light vs heavy); the three consumers on public routes;
predictor-vs-actual inside a well; perf: bounded force queries (spatial index, no
all-pairs).
**Authority/lease.** Physics authority; predictor kernel; VFX seams.
**Model routing.** YES.

---

### STEP 12 (SF-14 → depth W1/W2) — Planetary sling, atmospheric skim, enemy reentry: the trailer moment

**Problem.** Planets risk being background balls or damage circles; the user's most
vivid fantasy (L479–480, L1656) — colossal planets, sling chains, enemies burning
up "horribly, if animated right" — has no physical embodiment.
**Consequence.** The game's best trailer moment and the gravity UVP stay theoretical.
**Why it's bad.** One excellent planet proves movement + harvest + combat + traffic
from one place; it is the highest-leverage content build in the plan.
**Proposed solution.** One colossal planet — one atlas identity, one physics body —
supporting a massline/field sling route, an atmosphere-skimming resource activity,
and a staged enemy-reentry kill, with asymmetric player recovery.
**Direction of how.** **Identity (Q18):** the atlas record is canonical (stable ID,
4096-WU global position, bounds); one registration adapter spawns visual body,
exclusion/collision policy, bounded artistic attraction profile, atmosphere bands,
and map glyph in one transaction — no physics planet without an atlas record.
**Attraction:** documented artistic-liberties profile (softened, bounded, annular) —
coherence not realism (L1650). Regions with hysteresis + published semantic state
(outside/influence/sling/skim/danger/reentry). **Sling:** the release predictor and
route compiler from Step 5, tuned per-anchor. **Skim:** annular density bands
(outer/working/storm/reentry) with authored falloff; yield = distance × density via
an explicit collector device, settling through cargo ownership — storm band is
density/turbulence noise on the band profile, not a new system (F-q5). **Reentry:**
eligibility from inward trajectory + tumble/disruption; staged Skim→Commit→Breakup
→Descent→Aftermath with plasma onset, parts shedding, distress fragment; **healthy
enemies often escape a marginal pass** (counterplay preserved). **Player recovery:**
emergency burn costing capacitor/heat/momentum — never invisible teleport, never
casual instant death. VFX: depth-aware soft particles, heat distortion buffer,
flow-field skim wake, pooled emissive — LOD adjusts density only (F-q10).
**What it looks like.** You dive at a world that fills the sky, tether its limb,
spin up amber, release cyan across the terminator, drag the working band to fill
your collector while it glows, and put a disabled pursuer into the plasma with a
concussion round. One place, five verbs.
**Forbidden shortcuts.** (1) A planet that exists on the map but not in physics (or
vice versa). (2) An invisible damage circle called "atmosphere." (3) Instant
atmosphere kill on any radius crossing. (4) Realistic N-body/orbital simulation
(explicit non-goal). (5) Landable surface (non-goal). (6) Yield from a hold-E timer
instead of path × density. (7) Player recovery via teleport. (8) N64-tier plasma
(named techniques or don't ship).
**Acceptance evidence.** `check:atlas-integrity` green for the planet record; sling
route acceptance (enter/maintain/exit with prediction); skim yield == path×density
test through cargo owner; reentry staged-state test + healthy-escape characterization;
emergency-recovery cost test; browser+Electron captures near and far; save/Continue
across the site.
**Authority/lease.** Atlas record owner + physics authority + cargo owner (yield) +
VFX seams; D7 camera seam for the dive framing.
**Model routing.** YES (top-tier full-stack + vision).

---

### STEP 13 (SF-15 → W06) — NPC job controller: miner, hauler, patrol

**Problem.** "All the NPCs look and act the same, there's no scripted movements at
all" (L482); the world is dead between player actions.
**Consequence.** "World exists without me" fails; the GTA pillar has no traffic to
rob; sectors can't recompose (Step 19) without visible loops.
**Why it's bad.** Living-world is a declared pillar and the substrate for crime,
escort, and rumor content.
**Proposed solution.** One generic job controller (state machine, offscreen
virtualization) driving three visible loops — miner, hauler, patrol — riding
`sectorSim` and `encounterDirector`, never bypassing single writers.
**Direction of how.** Job state machine per depth 01-H: spawn/commission → depart →
transit → approach → work → load → return → unload (plus flee/resume), 5–10 Hz
decision cadence. **Ride existing systems (FLAG 7):** spawning/materialization
through `encounterDirector.js` (whose RED check is re-scoped as part of this step —
FLAG 12: soak-harness sector-local coords vs global zone anchors); economy/faction
intents through `sectorSim` day-tick; cargo/credits/rep only as intents applied by
their owners at virtualization boundaries (Q23). Offscreen: phase + normalized
progress stored, advanced statistically, materialized along the real route —
**never spawn a convoy from nowhere in the player's view**. Pirate predator behavior
(observe → select vulnerable traffic → intercept) lands here as the fourth loop if
the three primaries are green (it is SF-16's prey; keep it small).
**What it looks like.** Miners chew the belt in a cycle you can watch; a hauler
lifts off and actually flies the lane to the station; a patrol crosses the route on
a schedule you could learn — and you can decide to rob the hauler.
**Forbidden shortcuts.** (1) A parallel scheduler that duplicates encounterDirector
or sectorSim. (2) Direct writes to cargo/credits/rep. (3) Ambient "wandering" NPCs
with no origin/destination/cargo. (4) Teleporting NPCs between phases. (5) Escorts
asked to solve arbitrary tactics (one job: formation + respond + disengage).
(6) Convoys popping into existence on camera.
**Acceptance evidence.** `check:encounter-director` re-scoped green (or re-baselined
with the measured cause fixed); visible-loop player-route captures for the three
jobs; virtualization round-trip test (offscreen progress == materialized state);
intent-routing contract tests (no direct writes); determinism green.
**Authority/lease.** Encounter/world seams; single-writer intents only; combat AI
stays tacticalAI.
**Model routing.** RECOMMENDED.

---

### STEP 14 (SF-17) — Shared interaction descriptors + component-level targeting

**Problem.** Stations, wrecks, and sites are single monolithic targets: you can't
aim at the brace, the relay, or the port — only at "the station."
**Consequence.** No contextual verbs (Step 15), no World Sites (16), no Wreck
Cathedral (17) — the component grammar is shared foundation.
**Why it's bad.** "Targetable components are the multiplier" (digest E4): one
descriptor grammar turns one input code path into every operation in the game.
**Proposed solution.** A shared component descriptor — identity, role, state
vocabulary, tool tags, reveal rules — resolved by targeting, scanner, interaction,
and presentation as one object.
**Direction of how.** Descriptor per depth 01-B: `id, label, role, localPos, radius,
state, progress, maxProgress, toolTags, reveal, onComplete`; state vocabulary
hidden/revealed/intact/damaged/disabled/offline/active/severed/detached/repaired/
exhausted. One resolver consumed by: the acquisition scorer (components are
candidates), the scanner (labels/state), the contextual beam (Step 15, verb
eligibility), and the HUD (target panel). Read-side only: presentation emits `ui:*`
intents; mutations go through the site owner. Built on Step 7's compound proxies so
component collision == component visual.
**What it looks like.** Sweep the wreck: the port brace highlights as its own
target with its own label and integrity; scan reveals the offline relay behind the
hull plate.
**Forbidden shortcuts.** (1) Parent-center targeting under a detailed mesh.
(2) Component state stored in the UI. (3) Scanner labels hard-coded per site.
(4) A second descriptor grammar for stations vs wrecks. (5) Components without
collision alignment.
**Acceptance evidence.** Descriptor round-trip tests; targeting/scan/verb resolution
from one descriptor object; public route: select and scan two components on one
structure.
**Authority/lease.** Combat targeting + world-site owners; read-side UI only.
**Model routing.** YES.

---

### STEP 15 (SF-18 → A12 extension) — Contextual industrial beam, detachable payloads, receivers

**Problem.** The RMB beam is a janky HTML-bloom mining laser (L417); "cut braces"
is meaningless without components; wrecks can't yield physical salvage.
**Consequence.** The industrial verb set stays a mining animation; payload/catcher
loops (and the heist) are impossible.
**Why it's bad.** One button, many verbs is the input-grammar law; this step turns
RMB into that button.
**Proposed solution.** A contextual beam resolver over Step-14 descriptors, plus a
payload lifecycle (sever → spawn → tether/tow → receiver consumes).
**Direction of how.** `resolveIndustrialBeamAction(state, actor, target, component)`
→ `extract_geology | cut_joint | dismantle_component | repair_component |
heat_seal | stabilize_reactor | none`; work rate with range falloff, stability,
material, power factors; distinct label/VFX/audio/progress per verb — **the beam is
not HTML/CSS** (render through the VFX seams). Payloads: sever → parent visual hides
→ payload entity spawns at anchor with inherited velocity + bounded separation
impulse → tetherable/pushable → receiver zones consume (station cargo crane, site
Massline Core socket, tug capture field, black-market handoff for Step 18) with
persistence through the site owner. No mining yield on brace/relay targets.
**What it looks like.** RMB on the brace says "Cut" with a cutting arc and sparks;
the cargo module shears free and tumbles; you tether it and drag it to the crane,
which visibly swallows it into a receipt.
**Forbidden shortcuts.** (1) Ore yield from cutting a brace. (2) Instant cargo
conversion (no physical payload). (3) HTML/CSS beam. (4) Payloads that don't inherit
velocity. (5) A receiver that accepts payloads it has no manifest for.
**Acceptance evidence.** Verb-resolution tests per descriptor; payload lifecycle
test (sever → drift → tether → receive → persist); public route: cut, extract,
deliver; determinism green.
**Authority/lease.** Weapons/tools + site owners; cargo owner for receipts.
**Model routing.** YES.

---

### STEP 16 (SF-19 → A15 kernel) — Persistent multi-component World Site kernel

**Problem.** Every big site would otherwise be a bespoke monolith ("put it all in
world.js" — depth 04's own warning).
**Consequence.** Wreck Cathedral, outposts, and future sites each reinvent
components/payloads/persistence inconsistently.
**Why it's bad.** One kernel = every site is data; N kernels = N maintenance
failures.
**Proposed solution.** A World Site kernel: instantiate a site from a manifest
(proxies + components + recipes + receivers + persistence records) with stable IDs
and save/load through the existing `$.sites` row.
**Direction of how.** Compose Steps 7/14/15: site manifest → compound proxies +
component descriptors + operation recipes + receiver zones; persistent record
`{schemaVersion, worldObjectId, sectorId, state, components{}, payloads{},
discoveries[], updatedTick}` via the save mutex (`$.sites` already exists — FLAG 11:
schema *changes* go to the integration owner as requests). Total-order machine key
per A10. Sites survive save/offline per A18's boundary.
**What it looks like.** The wreck you stripped last week is still stripped; the
relay you repaired is still humming; the manifest, not a script, describes the site.
**Forbidden shortcuts.** (1) Site logic in one giant file. (2) Parallel save schema
outside the mutex. (3) Components with unstable IDs across saves. (4) A site that
resets on sector reload. (5) Bespoke per-site recipes instead of the shared grammar.
**Acceptance evidence.** `check:save-schema` green (clean tree); site persistence
round-trip (modify → save → reload → state preserved); A15 packet focused checks.
**Authority/lease.** asteroidSites/world seams; **save schema via integration owner
only**.
**Model routing.** RECOMMENDED.

---

### STEP 17 (SF-20 → depth H1a) — The Wreck Cathedral

**Problem.** The game has no hero place — nowhere a player would tell a friend they
flew to. (The depth-program's "bar-setter," currently TODO.)
**Consequence.** The world stays a cluster of equal-weight things; the story ledger
(Step 20) has no first subject; "semantic surplus, embodied deficit" remains the
verdict.
**Why it's bad.** This is the proof that SpaceFace can convert its systems into a
*place* — 320–600 wu of navigable, persistent, story-soaked wreck.
**Proposed solution.** Build the Cathedral as a World-Site instance on the Steps
7/14/15/16 stack, placed as the off-lane graveyard pocket of the Ceres
recomposition (Q14), with the SF-20 brief binding verbatim except as corrected here.
**Direction of how.** Task order per depth 04: (A) graybox + compound proxies
(channels ≥ 55–90 wu, hull sections 80–220 wu, visible ≥ 1,200 wu), (B) component
grammar (5–7: Power Relay A offline/repairable; Power Relay B separated; Port Cargo
Brace cuttable → detaches module; Cargo/Weapon Module payload; Reactor — **Version A
(physical extractable payload)** recommended over Version B because extraction *is*
the massline payoff; Version B is the documented fallback if payload risk review
fails; never both), Black Box scan-revealed → ledger), (C) payload extraction
(COM-to-COM tow, optional throw — the reactor is dangerous if thrown, that's the
fun), (D) final visual/story pass. Industrial-beam verbs: repair on relay, cut on
brace — no mining yield. Story: 3–5 flight fragments (8–20 words, silence gives
weight) + black-box ledger page. Aftermath persists (`partially_recovered` →
`recovered`).
**What it looks like.** A dead capital ship off the trade lane, dark; you scan two
relay signatures and a structural instability; you restore emergency power and
lights come up in sections; you cut the brace, tether the cargo module out through
the split hull you *actually fly through*, and leave with the black box while the
Cathedral stays behind you, changed.
**Forbidden shortcuts.** (1) A radius-9 sphere labeled "wreck." (2) Central-circle
collision under the hull. (3) Visual-only channels you can't fly. (4) Ore on cut,
toast-only power, flag-only black box. (5) Five identical cuts. (6) Both reactor
versions. (7) Debug-only reachability. (8) Rebuilding `shipLedger.js` for the black
box (Step 20 wires the existing one).
**Acceptance evidence.** The depth-04 anti-placeholder list as literal test cases;
full operation on the public route (scan → power → cut → extract → black box →
persist); save/Continue across the site; in-camera captures at the three scales;
`check:wreck-provenance` for the ledger link.
**Authority/lease.** World-site kernel owners; asset manifests via the graphics
admission gate (FLAG 9); station-shell seam for the ledger hook.
**Model routing.** YES (top-tier full-stack/asset/vision).

---

### STEP 18 (SF-16) — Surface-launch cargo, heist, patrol, and heat: the GTA pillar

**Problem.** "GTA in space" is a declared UVP pillar (L463, L1704) with zero
mechanics: nothing to rob, no witnesses, no pursuit, no fence.
**Consequence.** The game's identity claim is unproven; the living world (Step 13)
has traffic with no stakes.
**Why it's bad.** Crime is not flavor here — it is product positioning, and it is
also the highest-fun loop the user described after the massline.
**Proposed solution.** A scheduled mass driver at the Step-12 planet launches a
physical cargo capsule to an orbital catcher; the player can escort it, intercept
it, or watch it — with pursuit, heat, escape, and fencing through single-writer
intents.
**Direction of how.** Mass-driver schedule (predictable, visible, telegraphed — "a
physical object, a predictable opportunity, witnesses, pursuit, and economic
consequence" per gravity 04 §7). Capsule is a payload on a real trajectory (catch/
intercept both physical). Heist loop: shadow → disable (RCS disruptor on escorts,
or cut the pod free) → tether pod → flee patrol → fence through a black-market
receiver (Step 15's receiver grammar). **Heat/rep/cargo strictly by intent (FLAG
8):** heist actions emit faction/aggression events; `heat.js` and `factions.js`
decide consequences — including the T3 heat-seam constraint (FLAG 15: do not extend
the fallback path; emit intents). Pursuit uses patrol jobs from Step 13, not a new
AI. Laundering = delivery to the fence receiver with a rep/economy receipt.
**What it looks like.** The driver thumps on schedule; the capsule arcs up; you
kill its escort's RCS, cut the pod, and burn off the lane with patrol flares
rising behind you; three systems later a contact pays dirty rates for clean cargo.
**Forbidden shortcuts.** (1) Writing `state.player.heat` or rep directly. (2) A
heist with no witnesses → no consequences. (3) Script-spawned pursuers with no job
origin. (4) Cargo appearing without the physical pod. (5) Confiscation as a random
penalty (depth 03 forbids it). (6) A fence that's just a shop UI.
**Acceptance evidence.** Intent-routing contract tests (heat/rep/cargo writers
untouched); full loop on the public route (witness → steal → pursuit → escape →
fence → persistent heat); save/Continue with heat state; captures of the launch and
the intercept.
**Authority/lease.** heat/factions/economy/cargo are read-and-emit only; world/job
seams for driver/catcher; planet from Step 12.
**Model routing.** YES.

---

### STEP 19 (SF-21 → W-family) — Recompose Ceres Belt into activity pockets

**Problem.** Sectors are "a cluster of things in the middle of 99% empty space"
(L587) — geography with no geography.
**Consequence.** Navigation is meaningless, pockets can't form identity, and the
Cathedral has no "off-lane in the shadow" to live in.
**Why it's bad.** This fixes the user's *first-named* sameness (world sameness,
B4) on the corridor's own hub.
**Proposed solution.** Recompose Ceres Belt into 2–4 separated activity pockets
connected by the visible trade route — with the Cathedral as its mystery pocket —
as the physical sibling of atlas W08's postcard.
**Direction of how.** Pockets per the sector-identity law: civic (station), production
(belt ops from the asteroid program), transit/checkpoint (on the Helios→Tethys
route), mystery/graveyard (**the Wreck Cathedral, off-lane**). Separation 1,200–
3,000 wu; pocket radius 350–900 wu; route beacons visible at navigation distance;
one local mechanical condition (e.g. debris current through the graveyard approach);
one persistent consequence (the Cathedral's aftermath). **Coordinate, don't collide
(FLAG 4/13):** atlas owns map semantics (`galaxyMap.js` is atlas-owned); this step
owns physical placement in `world.js`/`sectors.js` data under the atlas D2 lattice
invariant (sector-local authoring stays; no cross-frame "cleanup"). The W08 postcard
must render the placed pockets.
**What it looks like.** "The refinery is beyond the belt, the Cathedral is off-lane
in the shadow" — you can say where things are, and the map agrees.
**Forbidden shortcuts.** (1) Editing `src/ui/galaxyMap.js` (atlas-owned). (2) Global
coordinate "cleanup" (D2 forbids it). (3) Pockets that are renamed clusters.
(4) Every pocket category mandatory (deliberate absence is identity). (5) A second
competing sector project for the same space.
**Acceptance evidence.** `check:atlas-integrity`, `check:sector-geography`,
`check:sector-postcard` for Ceres; navigation route from pocket to pocket on the
public route; captures at the three scales; journey textile stays ≥ 10/11.
**Authority/lease.** World data seams; atlas owner coordination; no map-UI edits.
**Model routing.** YES.

---

### STEP 20 (SF-30 → depth A2) — Ship's Ledger: wire the existing screen; fragments and the illustrated evidence pipeline

**Problem.** Story delivery is either absent or would become modal walls of text;
meanwhile `src/ui/screens/shipLedger.js` **exists with zero importers** (verified at
HEAD) and bar portraits keep coming out like 1950s pulp covers (L589).
**Consequence.** Discoveries evaporate; the Wreck Cathedral's black box has nowhere
to live; the image pipeline keeps failing the art bar.
**Why it's bad.** The three-layer story system (fragments → evidence → ledger) is
how the game tells a big story *without* cutscenes — but only if the screen is
actually reachable and the images aren't cartoons.
**Proposed solution.** Wire the existing ledger screen through the station-shell
intent seam; emit flight fragments from the operations already built; build the
image pipeline with anti-cartoon discipline as an acceptance gate.
**Direction of how.** **Wire, don't rebuild (FLAG 3):** register `shipLedger.js`
through `design/STATION_SHELL_CONTRACT.md`'s `ui:*` intent grammar (station screen +
in-flight review access); never a parallel mutation path. Fragments: 8–20 words,
2–5 s, auto-stored — emitted by scan/power/cut/extract/heist events from Steps
12–18. Ledger pages: title, image, 80–180 words, provenance links, no response
buttons. First story package: the five-page Cathedral thread, with the convoy→
capital-hull stitch written in (F-q13). **Image pipeline:** production-still prompt
discipline verbatim from depth 06 §6 (cinematic live-action casting portrait, 85mm,
documentary lighting, explicit excludes: no illustration/painted/cel/pulp/1950s/
anime/plastic skin), contact sheet → reject violations → select → consistent crop/
grade → store prompt/source/license/asset-ID → review **in the actual ledger UI**.
A generated image that reads as cartoon is a rejected artifact, not a style choice.
**What it looks like.** The black box pings; later, docked, you open the ledger and
the Cathedral's page is there — a photograph that looks like a film still, a route
map, 140 words, and your name in the recovery record.
**Forbidden shortcuts.** (1) Rebuilding the screen file. (2) Dialogue-choice trees
or "Continue"-button chains. (3) Shipping the first generated image (contact-sheet
rejection is mandatory). (4) Asserting "photorealistic" in the prompt and accepting
pulp output. (5) Fragments longer than 20 words. (6) Images reviewed outside the
ledger UI.
**Acceptance evidence.** Ledger reachable on the normal route (station + in-flight);
fragments fire from the operation events; first package complete with provenance
records; image review sheet showing rejects and the accepted direction;
`check:depth-program:a2` re-run at HEAD.
**Authority/lease.** Station-shell seam; save via mutex for page persistence; media
pipeline per `design/production/09_GENERATED_MEDIA_PIPELINE.md`.
**Model routing.** YES (narrative systems + image/visual review).

---

### STEP 21 (SF-31 → depth S1–S4) — Visual-family production pipeline + first accepted families

**Problem.** Visual sameness (B4) persists because assets arrive as one-offs with no
family discipline; the graphics checkpoint pins receipts but not *families*.
**Consequence.** Ships/stations read as palette swaps; "professional and beautiful"
stays unprovable.
**Why it's bad.** The beauty bar requires *repeatable* distinctness — a pipeline,
not a pile of assets.
**Proposed solution.** A family pipeline (silhouette-first, three-scale readability,
runtime identity) plus a small accepted wave: one ship family and one world/landmark
kit, admitted through the graphics checkpoint.
**Direction of how.** Family definition: silhouette hierarchy (identifiable at
1,000+ wu), material/lateral identity (not color swaps), three-scale readability
(far/mid/near per depth 03), behavior-consistent dressing. Pipeline: manifest →
runtime map → in-camera acceptance at all three scales in the normal game camera
(never Blender viewports/turntables — depth 01-J) → receipt pinned via
`check:graphics:asset-receipts`. All admission through
`08_GRAPHICS_OVERHAUL_CHECKPOINT.md` (FLAG 9 — verify the lease before touching
manifests). Depth S3/S4 assets re-verified at HEAD before reuse (Q24).
**What it looks like.** A Fulfillment hauler is unmistakable from a Vael skiff at
map zoom; the station kit reads as one culture's architecture, not five
borrowed models.
**Forbidden shortcuts.** (1) Acceptance from isolated renders. (2) Palette-swap
families. (3) Manifest edits outside the admission gate. (4) Family bloat (one ship
family + one kit first; replication is Wave-2). (5) Visual identity disagreeing with
collision/targeting identity.
**Acceptance evidence.** `check:graphics:asset-receipts` + `check:silhouette-roles`;
three-scale in-camera captures on the normal route; family spec docs admitted to
the checkpoint.
**Authority/lease.** Graphics/asset admission gate; `assets/ships/AGENTS.md`
pipeline.
**Model routing.** YES (strongest frontend/vision/3D agent; backend must not sign
acceptance).

---

### STEP 22 (SF-32 → R-family + VFX-language packet) — Physics HUD, VFX language, camera, accessibility consolidation

**Problem.** By this point the game has ~15 new visual signals (assist states,
preview brackets, release windows, fields, statuses, bands, heat, pursuit slot) with
no unified language — the N64 complaint (L1680) fixed per-feature would still read
as noise as a whole.
**Consequence.** Crowded scenes become unreadable; a11y debt accumulates per feature;
every later feature reinvents its telegraphing.
**Why it's bad.** "Professional" is a *coherence* property: one restrained language
or visual soup.
**Proposed solution.** One physics visual language: shared VFX toolbox usage,
semantic color/shape vocabulary, HUD consolidation, camera speed language, and the
merged a11y gates — single VFX owner (Q16).
**Direction of how.** Canonical spec = gravity 05 (laws, toolbox, gates). Vocabulary:
one meaning per channel — SDF brackets = targetability, ribbons = tension/constraint,
flow-fields = fields, shockwaves = impulses, vignette geometry = timing windows,
provenance-tinted speed streaks = momentum source. Massline per the layered redesign
(structural core + energy sheath + load packets + endpoint flare — the anti-"HTML
bloom" spec). HUD: non-diegetic per contract (no visor/cockpit motifs); the assist
cue, preview label, and release geometry share one restrained grammar; Surveyor's
Table aesthetic on the map side (warm black/brass/amber/teal). LOD law (F-q10):
density scales with camera scale, **layers never drop, defaults never lower**. A11y:
reduced-motion variants for every pulsing signal, colorblind-safe palettes,
keyboard/gamepad reachability, contrast gates. Camera: velocity zoom + release punch
final pass on the merged D7 result (FLAG 13).
**What it looks like.** In a 12-ship furball around the Cathedral you can still
read: what's targetable, what's tensioned, when to release, and how fast you're
going — and nothing pulses that shouldn't.
**Forbidden shortcuts.** (1) Per-particle Meshes or per-frame material creation.
(2) Neon-fog uniformity erasing semantic differences. (3) Color-only meaning.
(4) Quality reduction framed as LOD. (5) Screen-wide distortion. (6) One dynamic
light per particle (pooled, capped). (7) Cockpit/visor framing on the HUD.
**Acceptance evidence.** The ten VFX acceptance gates (gravity 05 §16) run as
checks: near+far captures, bright+dark, reduced-motion, colorblind-sim, stable
frame time (`check:perf`, `check:hitch-budget`), semantic sync tests, side-by-side
rejection of the old primitive effects; `check:ui-a11y`, `check:wcag-contrast`,
`check:camera:velocity-language`.
**Authority/lease.** Single VFX owner (Q16); HUD/ui seams; D7 camera seam; no
render-lease paths without checkpoint clearance.
**Model routing.** YES.

---

### STEP 23 (SF-23/24/25 → A03/A04 + A07/A09/A11 + A15/W17) — Asteroid-ops corridor slice (scoped)

**Problem.** The corridor (Step 24) requires one real survey/operation milestone and
one industrial consequence, but the full asteroid-ops depth (exteriorization, heat/
signature, transforming claim) is gated behind a render lease and is more game than
the corridor needs.
**Consequence.** Either the corridor ships with a hollow industry beat, or industry
scope eats the program.
**Why it's bad.** The user's "revenue streams for what?" (B5) is answered by verbs
and capabilities, not by three packets of machinery the corridor can't showcase.
**Proposed solution.** Corridor-minimal slice: progressive survey reveal on one
formation (A04 core), one industrial claim stage-1 (cold claim → repaired, supplied,
producing) — full exteriorization/heat/diagnostics continue in Wave-2.
**Direction of how.** Survey: signature → discovery reveal through the PURE A08
kernel (no `state.sites` writes — FLAG 5; consequences via A09 wiring). Claim:
repair-and-supply loop on the World Site kernel (Step 16) with exteriorized stage
changes (lights, traffic, storage pods — exteriorization law's cheapest three rows).
A03's render work stays `BLOCKED_BY_LEASE` until the graphics lane frees it (FLAG 9)
— do not force it; the corridor beat works on current formation rendering if the
lease holds.
**What it looks like.** You scan a formation and its structure resolves; you haul
two loads to a dead claim and its work lights come on; next visit, a courier pod is
waiting.
**Forbidden shortcuts.** (1) `state.sites` schema writes. (2) Forcing the render
lease. (3) "+X% yield" rewards (verbs/capabilities only — B5). (4) Menu-based claim
upgrades with no exterior change. (5) Rebuilding A06/A08/A10 (INTEGRATED).
**Acceptance evidence.** `check:scan-reveal`, `check:sensor-signatures`; claim
stage-1 on the public route with visible exterior delta; `check:save-schema` clean.
**Authority/lease.** A-family owners; save mutex; render lease gate.
**Model routing.** YES.

---

### STEP 24 (SF-33 → G17/G18) — Gold-corridor 30/90-minute integration

**Problem.** Dozens of green systems can still compose into a boring first hour
(SF-33's own problem statement).
**Consequence.** The whole program's fun claim stays unproven end-to-end.
**Why it's bad.** This is the acceptance bar for "fun": three careers, real routes,
held-out seeds, human-legible captures.
**Proposed solution.** Execute G17/G18 exactly as the roadmap intends, with the
SF-33 brief binding: thirty-minute career routes + representative ninety-minute
continuations containing the signature beats.
**Direction of how.** Per SF-33's brief (re-audit corridor, define journeys,
integrate tutorialization through action, calibrate from cohort runs, repair harness
drift, held-out seeds, browser+Electron). Required natural beats: one massline
acquire/orbit/release, one physics-weapon combo, one visible job loop, one sector
traversal with pockets, one survey/operation, one loss/recovery, one ledger
discovery, one industrial consequence, one heist *opportunity* (refusable — GTA is
a door, not a shove). Measured: time-to-understand, dead travel, retries, feature
usage.
**What it looks like.** A new player in each career reaches the Ceres pockets in 30
minutes having swung on a rock, shot someone into something, and read a fragment —
and can tell you what this game is.
**Forbidden shortcuts.** (1) Injected state or compressed timers to fake the route.
(2) Modal instruction walls. (3) Overfitting the known seed. (4) Declaring fun from
green checks alone — captures + vision review required. (5) New features to patch
route holes (fix the owning seam).
**Acceptance evidence.** `check:professional-travel:public-route` (+browser/
electron), `check:first-hour`, cohort metrics, capture review, integration report
splitting feature defects / content blockers / harness defects / unproven quality.
**Authority/lease.** G-family owner; no new feature scope.
**Model routing.** YES (integration/playtest + vision).

---

### STEP 25 (SF-35 → R12–R18) — Release closeout

**Problem.** A game that plays beautifully in dev can still ship broken: saves that
lie, Electron drift, unbounded memory, unknown reds buried under green subsets.
**Consequence.** Every earlier step's quality is destroyed at the one moment it is
judged — the player's first downloaded hour.
**Why it's bad.** Release is a feature: reproducibility, recovery, and honesty of
evidence are the difference between a shipped game and a good demo.
**Proposed solution.** Execute R12–R18 as the single release authority with the
SF-35 brief binding: one current revision proven as a reproducible candidate.
**Direction of how.** Save/migration/recovery proofs incl. corrupt-save recovery;
browser/Electron/package parity on the same commit; accessibility gates; perf/
memory budgets with long soak; licensing and honest store captures; the Q26
physics-membrane debt list closed or lead-waived; zero new physics-authority
violations as a hard gate; **no handheld gates** (FLAG 16). Runs after the Wave-2
re-plan, on the repaired broad `npm run check` (Step 0 makes that possible).
**What it looks like.** One named commit: install → play 30 min → quit → Continue →
same world; the evidence bundle says exactly what is proven and what is not.
**Forbidden shortcuts.** (1) Promoting milestones on prose or self-scores. (2) A
parallel release gate outside R12–R18. (3) Re-recording goldens to pass. (4)
Handheld/mobile gates (explicit non-goal). (5) Declaring parity from browser-only
evidence. (6) Shipping with an unowned red.
**Acceptance evidence.** `check:release-soak`, `check:m6:corrupt-save-recovery`,
`check:m6:packaging`, `check:launch-policy`, `check:save-resume-confidence`, broad
`npm run check` green on the release commit, evidence bundle bound to the SHA.
**Authority/lease.** R-family owner; lead-only status surfaces; save mutex.
**Model routing.** YES (release/integration + vision).

---

## Section C-2 — Wave-2 deferred briefs (compact; activate only at the corridor gate)

These units are deliberately **not** on the critical path (restraint, L1851). Each
gets a compact brief now so that activation at the corridor gate needs no re-plan;
the SF prompt of the same number carries the long form.

### W2-1 (SF-13 → T22 recommended) — Mass-coupling tactics: Inertial Shunt, Gravity Mark, Momentum Sink

**Problem.** Once impulse/fields land (Steps 8–11), there is no way to change *how
a target responds* to them — setup depth caps out.
**Consequence.** Combo play (the emergent-style fun source, L1688) stays shallow.
**Why bad.** Mark → Well → torpedo is the kind of player-invented combo that makes
the physics game sing.
**Solution.** Three status tools: Shunt-Lighten (higher impulse/angular response),
Shunt-Ballast (anchoring), Gravity Mark (increased artificial-field coupling),
Momentum Sink (damps velocity vs a chosen frame, capped force — never zero-write).
**How.** Separate multipliers (`impulseResponseMult`, `tetherResponseMult`,
`fieldResponseMult`, `angularResponseMult`, `propulsionResponseMult`) — **never
blindly change rigid-body mass** (gravity 03 caution). Statuses visible as SDF
brackets + ribbon tint shifts (F-q7 spec), never icon-only.
**Looks like.** Mark the hauler, drop a well, watch the whole escort drift into the
knot while the unmarked patrol shrugs.
**Forbidden shortcuts.** (1) Mass edits on the live body. (2) Generic "slow debuff."
(3) Icon-only status. (4) Set-velocity-to-zero sink. (5) Statuses that affect the
player without the player's consent verb.
**Evidence.** Status-coupling contract tests; combo route capture (mark → well →
payoff); determinism green. **Authority.** Combat/status seams via physics
authority. **Routing.** RECOMMENDED.

### W2-2 (SF-22 → W21 recommended) — Environmental machinery + timed hazard

**Problem.** The recomposed sector has pockets but no *machines* — nothing that
moves the world on its own clock.
**Consequence.** Physical puzzles and timed-access content are absent.
**Solution.** One environmental machine (debris current that moves traversable
hazards on a cycle) + one timed-access hazard in the graveyard pocket.
**How.** Hazards as trajectory changers, **not damage circles** (depth 03-VII);
state published with hysteresis; prediction shows the cycle; valuable content
behind timing, not behind HP checks.
**Looks like.** You ride the current's slack window into the Cathedral's shadow
berth; arrive late and you wait or fight the flow.
**Forbidden shortcuts.** (1) Damage circles. (2) Random cargo confiscation.
(3) Invisible cycles. (4) Hazards that can't be read from the predictor. (5) A
machine with no reason to exist in-fiction.
**Evidence.** Cycle determinism test; route capture using the window; a11y (cycle
readable without motion). **Authority.** World/physics seams. **Routing.** YES.

### W2-3 (SF-26 manufacturing half) — Acceleration ring + support structure

**Problem.** Industry builds things but never changes *travel*.
**Solution.** Manufacture and place one acceleration ring on a real route (a new
movement verb, not a percentage) plus one support structure (cargo catcher).
**How.** Ring = authored field corridor (pass-through impulse, bounded, provenance-
tagged) built from claim output; atlas connector updated so the route follower
knows it; Travel Burn interplay documented (atlas seam, Q17).
**Looks like.** The Helios run shrinks because *you built* the ring that shrinks it.
**Forbidden shortcuts.** (1) A speed buff in map UI. (2) Ring without atlas
registration. (3) Free placement (must cost claim output). (4) Teleport behavior.
(5) Rebuilding route-follower (atlas owns it).
**Evidence.** `check:atlas-integrity`; route time before/after; public route through
the ring. **Authority.** A-family + atlas seam. **Routing.** YES.

### W2-4 (SF-27 → T11/T12/T13) — Tractor, Elastic Whip, Frame Coupler

**Problem.** One spool does everything; specialized physics relationships don't
exist.
**Solution.** Three heads on the **same input grammar** (Step 2): Tractor (force-law
distance-keeping tow), Elastic Whip (spring-damper energy store/snap), Frame Coupler
(velocity-matching hitch).
**How.** `F = −Kp(d−d*) − Kd·vRadial` (tractor); `F = −K·ext − C·extRate` (whip);
velocity convergence without center-pull (coupler). One flag per head (F-q12).
Tune each in the lab per Q21's method. **Meteor Express stays deferred** — it
consumes the coupler post-release (Q12).
**Looks like.** Tow a dead ship home; whip-snap around an asteroid and slingshot
past yourself; couple to an express freighter and ride its wake.
**Forbidden shortcuts.** (1) New keys per head (keyboard tax). (2) Telekinetic
dragging (tractor is force-bounded). (3) Cloth-net/whip soft-body simulation.
(4) Heads before the baseline grammar is excellent. (5) One shared feature flag.
**Evidence.** Per-head lab matrices; tow/hitch/snap routes; determinism.
**Authority.** T-family + input lease. **Routing.** RECOMMENDED.

### W2-5 (SF-28 → T08/T09) — Monofilament sweep + transverse snare

**Problem.** The line is a tool, not yet a weapon surface.
**Solution.** High-tension swept segment damages light craft/components
(monofilament); a deployed transverse line catches crossing targets (snare) with
explicit eligibility and counterplay.
**How.** Damage only when tension > threshold ∧ sweep speed > threshold ∧ target
cooldown ∧ not-the-player; snare as a deployed line entity with wrap eligibility
from Step 7's collision. VFX: the layered massline redesign (Step 22) at high
tension.
**Looks like.** You sweep the arc through two lights and they come apart on the
line; the snare you laid across the channel eats the third.
**Forbidden shortcuts.** (1) Damage without tension/speed conditions. (2) Friendly
fire on the player's own hull. (3) A radial stun called a snare. (4) Line damage to
components that Step 14 can't describe. (5) Shipping before the swarm rebalance
proves base combat.
**Evidence.** Threshold contract tests; sweep/snare route captures; counterplay
characterization. **Authority.** T-family + combat. **Routing.** YES.

### W2-6 (SF-29 → T23 recommended) — Twin Bridle (object-to-object)

**Problem.** The player's favorite unbuilt idea (L1694): tether two *world* bodies
together and watch the system react.
**Solution.** Two-stage activation: first press attaches endpoint A (candidate
preview switches to B-mode), second attaches B; the pair gains mutual constraint —
spin-out, trap, relocation. **Object-to-object is binding; ship-between-two is a
forbidden shortcut.**
**How.** Max one active bridle, no cycles, color-coded endpoints, large bodies valid
as one endpoint never both (F-q9 resolved: a Mass Seed anchor is a valid single
endpoint). If released mid-setup, endpoint A persists ~10 s as a visible expiring
bridle anchor (F-q8). AI counterplay: heavy ships strain/cut.
**Looks like.** Bridle a cargo pod to a patrol wingman; they discover each other at
speed while you leave through the gap.
**Forbidden shortcuts.** (1) Ship-as-endpoint version. (2) Invisible mid-setup
persistence. (3) Bridling two stations (degenerate). (4) Constraint solving outside
physics authority. (5) Unbounded bridle count.
**Evidence.** Two-body constraint determinism; route capture (bridle → outcome →
counterplay); expiry test. **Authority.** T-family + physics authority; atlas seam
if a cross-sector case ever arises (FLAG in packet §2). **Routing.** RECOMMENDED.

### W2-7 (SF-34 → W12–W20) — Embodied story, ownership, endings

**Problem.** The corridor tells fragments; it doesn't conclude.
**Solution.** Execute roadmap W12–W20 as-is with the SF-34 brief binding: B0–B7
embodied, faction thresholds, three outpost specializations, thirteen role
progressions, five endings, post-ending sandbox — all through actors, places,
physical actions, and ledger evidence.
**How.** No dialogue-flag endings: each ending is a *world state* (what you built,
who owns Ceres, what the Cathedral became) rendered through the systems that
already exist. Ledger pages carry the retrospective.
**Looks like.** The ending is a place you fly through and recognize as yours.
**Forbidden shortcuts.** (1) Ending-by-cutscene. (2) Branch deletion. (3) Taxation-
menu governance. (4) Endings that ignore the site's persistent state. (5) A sandbox
that resets the world.
**Evidence.** W12–W20 packet checks; ending routes on public saves; ledger
completeness. **Authority.** W-family owner + save mutex. **Routing.** YES.

---

## Section D — Folded-in cross-references (absorption ledger)

| Source | Absorbed into | What survives of it |
|---|---|---|
| SF-00 | Step 0 + this REVIEW | The readiness mapping (Section A) |
| SF-01 | Step 0 | Graphics/perf baseline evidence requirements |
| Depth playbook 01 (foundations A–J) | Steps 7, 14, 15, 16 | The ten-foundation spine, data schemas |
| Depth playbook 02 (massline/combat) | Steps 1–6, 8, 9 | Control contracts, pursuit-slot math, weapon catalog, arena grammar |
| Depth playbook 03 (living world) | Steps 13, 19 | Pockets, jobs, sector seeds (as future content) |
| Depth playbook 04 (Wreck Cathedral) | Step 17 | Component roster, anti-placeholder list, task order |
| Depth playbook 05 (automation/endgame) | Step 23 + Wave-2 | Verb-unlock ladder, exteriorization law |
| Depth playbook 06 (story/images) | Step 20 | Three-layer story, anti-cartoon discipline, first package |
| Depth playbook 08 (three-agent waves) | Section B | The wave order (validated, kept with corrections) |
| Depth playbook 11 (prompting glossary) | Every brief | Named-technique + forbidden-shortcut + evidence pattern |
| Gravity package 01 (design bible) | Every brief | 8 laws, coherence-not-realism, 10 primitives |
| Gravity package 02 (control/targeting) | Steps 2–5 | Scoring weights, tap/hold grammar, orbit PD, release presentation |
| Gravity package 03 (weapons/heads) | Steps 8–11 + Wave-2 | Mass Seed modes, shunt/mark/sink, head specs, forbidden shortcuts |
| Gravity package 04 (planets/heists) | Steps 12, 18 | Bands, reentry stages, mass driver, sector archetypes |
| Gravity package 05 (VFX) | Steps 9, 11, 12, 22 | The 10-technique toolbox, 5 laws, 10 gates, massline redesign |
| Gravity package 06 (implementation) | Steps 1–11 | Phases, flags (now per-head), budgets, stop conditions, lanes |
| Atlas pack | Step 19 + ALREADY_SATISFIED travel | Canonical Atlas identity, Surveyor's Table, navigation contract |
| Roadmap T01–T18 | Steps 1–6, 8–11 | Integrated kernels consumed; PLANNED packets bound to SF briefs |
| Roadmap A01–A20 | Steps 15, 16, 23 | Integrated kernels consumed; design rulings (A08) binding |
| Roadmap W01–W20 | Steps 13, 18, 19 + post-corridor | Encounter phase work consumed; story packets deferred whole |
| Roadmap G17/G18, R01–R18 | Steps 22, 24, 25 | The integration and release authorities |
| Depth-program H1a/A2/W1/W2/S1–S4 | Steps 12, 17, 20, 21 | IDs survive; SF briefs bind; other 26 chunks retained FUTURE |
