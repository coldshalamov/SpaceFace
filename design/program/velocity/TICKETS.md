<!-- LIFETIME: VOLATILE -->
# VX work tickets — machine-checkable ledger

baseSha for all current tickets: `3713cd0923d0eebe5fe920df5da3accc1546c775` (master).
claimOwner: `devin-vx-lead` (this program's lead agent) unless reassigned by the Finish controller.
Shared-checkout note: `src/systems/combat.js` + `test/inf-room-end-cause.test.mjs` are foreign
uncommitted work; `src/systems/aiPorts.js` + `src/ai/perception.js` carry an active Sol CLI claim.
None are in any allowedPaths below.

---

## VX-01 — Stern view forward sight at speed

- id: VX-01
- baseSha: 3713cd0923d0eebe5fe920df5da3accc1546c775
- claimOwner: devin-vx-lead
- allowedPaths: `src/render/racingCameraBlend.js`, `src/systems/racingSteer.js`,
  `src/data/flightTuning.js`, `test/` (new VX tests only)
- forbiddenPaths: `src/render/camera.js` (shared; hunk-owner arbitration first),
  `src/systems/flightV3.js`, `src/core/physicsAuthority.js`, any file in foreign/active claims
- playerOutcome: In stern view at cruise/boost, the pilot sees the next bend/hazard early enough
  to choose a line (~1 s notice plus braking envelope); overhead view unchanged; nose stays
  visible at low speed; reduced-motion unchanged or better.
- sourceOwners: render/camera owner (presentation), racingSteer (rig policy)
- dependencyIds: []
- hypotheses:
  - H1: stern look lead `lookAhead + min(32, speed*0.05)` (cap ≈68 wu) is the binding constraint
    on forward legibility at 200+ wu/s; raising the speed-scaled cap measurably increases visible
    forward extent without pushing the hull off-frame.
  - H2: a per-hull envelope (lead ∝ min(v*t_look, stopping-distance fraction)) beats a flat cap;
    validated against starter/agile/heavy hulls in the feel lab.
- acceptanceChecks:
  - Fixed-seed before/after: camera pose + forward-visible-distance probe at 0/200/440/max wu/s.
  - `node --test` new VX camera test + `test/racing-render.test.mjs` + `test/camera-glide*.test.mjs` green.
  - Real boot `?dev=screen:flight&devseed=47` stern-view capture, ring geometry legible ahead.
- negativeControls: 30 Hz and 144 Hz frame cadence; toggle held during max-yaw turn; reduced
  motion on; photo/death/dock/pause paths; hull-swap mid-flight; settings sliders at min/max.
- testCommands: `node --test test/racing-render.test.mjs test/camera-glide.test.mjs
  test/camera-glide-integration.test.mjs test/vx-*.test.mjs`
- evidencePaths: `design/program/velocity/EVIDENCE.md`, `.devshots/` captures
- risks: look-point too far ahead shrinks near-field (misses pylon at hull); must keep
  `r*2.2` floor semantics; worker-lane pose transport unchanged.
- status: design-attack pending (G2)

## VX-02 — Free-Drive Ring "Cracker Run" (Helios)

- id: VX-02
- baseSha: 3713cd0923d0eebe5fe920df5da3accc1546c775
- claimOwner: devin-vx-lead
- allowedPaths: `src/data/vxFreeDriveRing.js` (new), `src/systems/world.js` (additive
  `_spawnFreeDriveRing` hook only, adjacent to `_spawnWorldOneOffs`), `test/` (new VX tests only)
- forbiddenPaths: `src/world/racingCorridor.js`, `src/data/raceLevels.js`,
  `src/data/racingSetPieces.js`, `missions.js` (VX-03 only), foreign/active-claim files
- playerOutcome: In ordinary Adventure flight (no race, no mission, no timer), a pilot departing
  station_helios sees a physical ring mouth, drives a ~3-minute loop — plaza → rib row (wide safe
  line vs tight inner gaps) → timed chute past the claim cracker → apron return — colliding only
  with real visible structure, and returns to normal space with nothing leased, scored, or changed.
- sourceOwners: world (sector dressing spawn), solidDressing census (collider truth)
- dependencyIds: []
- hypotheses:
  - H1: census-adopted place props auto-solid (`stampSolidDressing`) — pure authored data + the
    existing `_spawnPlaceProp` path yields real colliders equal to visible models.
  - H2: claim-cracker intake cone (warning 2 s / surge 3.5 s / calm 6.5 s, strength 720, radius
    100, half-angle 0.52) is the periodic machinery: its cone periodically sweeps the fast line;
    south apron is the always-open alternative. VERIFY cone world-direction on the live route
    before final layout.
  - H3: physicalBody one-off mass ≥ 240 t reads as immovable furniture at ship impacts while
    staying ropeable/tetherable (Massline legal anchor texture).
- acceptanceChecks:
  - Headless world fixture: ring props spawn in sector_helios_prime, expected count/positions/
    collider flags, deterministic across activate/deactivate, none inside station/field keepouts.
  - Real route: dev-boot to flight, fly the loop in stern view; ≥3 spatial decisions; capture.
  - `node --test` new VX ring test + world one-off/dressing regressions green.
- negativeControls: sector unload/reload (no dupes, no stranded rows); Continue/save mid-loop;
  approach ring in reverse direction; stop/reverse inside the rib row; heavy-hull swept fit
  through every mandatory gap at min and max legal speed; props vs POI exclusion radii.
- testCommands: `node --test test/vx-free-drive-ring.test.mjs test/world-one-offs.test.mjs`
- evidencePaths: `design/program/velocity/EVIDENCE.md`, `.devshots/`
- risks: prop placement colliding with seeded field scatter (must verify against multiple seeds);
  route unreadable without HUD arrows (mitigate: gantry mouth + buoy breadcrumbs + localmap POI
  if the owner exposes one); cracker cone may be too deadly for "harmless practice misstep" —
  refuge apron must be genuine.
- status: IMPLEMENTED (data + world.js hook + focused test green). G2 design attack (agent
  d5bf1602) landed four real findings, all re-authored before the first capture:
  (1) CRITICAL — the authored fast line at z-450 sat in the 24-wu mouth/anvil pinch, physically
      closed to a 28-wu hull; cone could threaten no legal E-W lane. Fixed: low road (z-525,
      always safe), anvil thread (x~676, northbound slot inside the cone's west tail — the timed
      committed line), open field (deliberately unreserved live scatter) — three honest lines.
  (2) CRITICAL — no stake: player is impact-damage/tumble-immune and cone force can't reach the
      anvil. Partial mitigation: thread-slot mistiming still drags the ship at the anvil (real
      momentum/time loss); cargo-at-risk is deferred to VX-03's carried package.
  (3) HIGH — rib row was a straight line with 160-wu gaps; bypass strictly shorter than weaving.
      Fixed: arc bowed NE with one ~45-wu needle gap (rib3/rib4) and a 250-wu forgiving entry.
  (4) HIGH — exit gantry overlapped the Spare Keg's live body (31.6 wu vs 48 combined) and its
      "fly under" text was a 2.5D lie. Fixed: gantry deleted; return leg is buoys west of the
      station approach.
  Remaining from attack: cone phase unreadable at approach distance (only `hazard:enter` fires)
  — deferred: needs a lane-light tell; mouth silhouette shares placeId with the Answering Buoy;
  onboarding-classroom mixing + sim-recording divergence need a sim compare before landing.
- verification so far: `node --test test/vx-free-drive-ring.test.mjs` 6/6 (props solid at
  authored radius, buoys ghost, low-road disc chain sealed, arranger re-seats every lane
  intruder through the real admission path, inert off-sector). Runtime dressing-table probe:
  PENDING (boot flaky under software-GL; see EVIDENCE).

## VX-03 — Blackout Courier pursuit (stage 2)

- id: VX-03
- baseSha: 3713cd0923d0eebe5fe920df5da3accc1546c775
- claimOwner: devin-vx-lead (not yet claimed; missions.js hunk needs owner arbitration)
- allowedPaths: `src/data/` (new authored contract file), `src/missions/` (new runtime file),
  `src/systems/missions.js` + `missionBoardOps.js`/`missionSpawningOps.js`/`missionStoryOps.js`
  (additive hooks, after diff+ownership check), `test/` (new VX tests only)
- forbiddenPaths: economy/heat/law internals (use existing intents/events only),
  `src/data/raceLevels.js`, foreign/active-claim files
- playerOutcome: From an ordinary station offer in sector_helios_prime, the player approaches a
  docked courier; it visibly departs and flees along a real route; the player intercepts by
  sustained-speed wide line OR rib shortcut (VX-02 geography), catches via matched-velocity hold
  or tether latch, receives one durable receipt (clean intercept vs damaged cargo vs escape
  trace), reports at a station; save/Continue mid-chase restores the exact phase.
- sourceOwners: missions (boards/phases/settlement), missionSpawningOps (pinned spawns/steering),
  traffic/npcJobs (departure), heat/law (tackle consequence)
- dependencyIds: [VX-02]
- hypotheses:
  - H1: escort-spawn + `_steerEscortee`-style intent steering + egressExit flee + cleanCylinder
    matched-velocity hold compose the chase with no new physics.
  - H2: authored-only offer (proceduralWeight 0, `_syncXOffer` board post like heist) keeps the
    type out of procedural RNG streams and satisfies terminalReceiptCount==1 arbitration.
- acceptanceChecks: two independent fixed-seed runs (wide line; shortcut) reach distinct honest
  receipts; fail/quit/leave-sector/save-reload at each phase boundary resolve once; no double
  payout; camera pref restored.
- negativeControls: ram the courier (heat/cargo consequence, not free capture); tether then cut;
  let it escape (trace remains); save during flee; duplicate mission event; reload boundary.
- testCommands: TBD at implementation (missions + new VX tests)
- evidencePaths: `design/program/velocity/EVIDENCE.md`
- risks: missions.js is a 93KB shared file — smallest additive seam mandatory; courier steering
  must use real intents (no pose/vel writes); escape must not strand mission state.
- status: gated — design spec drafted in this ledger; not started

## VX-04 — Rival legibility (later)

- id: VX-04 — strengthen Mira/Rook/Sable observable differences in a shared seeded circuit.
  status: backlog (after VX-02/VX-03 stable). Details: brief §4.

## VX-05 — Speed/course/turn cues (later)

- id: VX-05 — HUD/audio cue polish from real captured frames only. status: backlog.

## VX-06 — QA/perf harness

- id: VX-06 — negative-control automation + matched perf for ring scene. status: backlog;
  note: camera pose is absent from motionTelemetry — small trace-sampler extension needed for
  the feel laboratory (allowedPath: `src/testing/motionTelemetry.js` if claimed).
