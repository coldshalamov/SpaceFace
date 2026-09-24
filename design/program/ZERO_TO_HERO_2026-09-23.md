<!-- LIFETIME: ACTIVE_PROGRAM -->
# Zero to hero — the A-list demo program: *see the body*

Owner, 2026-09-23: *"We have a lot of plans in the build map, I'm not convinced that they cover the
entirety of what we need to be an A-list game … take 3-5 tasks on the build map, see that it
collectively makes a sort of look or feel … look at the game and see what's weak about it and the
biggest rough edges, and write a plan to go through a long agentic build session that takes this
game from zero to hero … filling the plan out with all the things we missed."*

This is that plan. It adds no second queue: every phase names the existing packet, §22 row, or §23
campaign it springboards from, and marks only the genuinely missing work **NEW**. Defects found on
the way go to the one ledger ([`DEMO_READINESS_2026-09-20.md`](./DEMO_READINESS_2026-09-20.md) §6).
Build-map entry: [`build_map.md` §25](../../build_map.md#25-zero-to-hero--the-a-list-demo-program--admitted-2026-09-23).

---

## 0. What was looked at

- **Live frames**, headed Chromium on the owner's Intel iGPU, 1920×1080: title; New Game at 5 s and
  after 40 s of thrust; the docked Helios hub; the Crucible (seed 4242) at 10 s, 25 s, the first
  kill and kill + 400 ms.
- **Bench shots** of title, flight, Crucible HUD, Crucible door, results, station, pause, chart.
- **The queue.** Of the demo and finish packets, almost every leaf reads `done`: `PQ-210.00`–`.07`,
  all of `PQ-174`, `PQ-146`, `PQ-169`, `PQ-158`, `PQ-159`, `PQ-160`, `PQ-175`. The numbers passed.
  The frame still fails a stranger's first glance. That gap — packets closed on a number while the
  picture a player sees did not move — is what this program is for.

## 1. The diagnosis

> SpaceFace simulates bodies better than almost any game in its class, and then does not show
> them. At the shipping camera your own hull is a speck, the hostiles are specks, the kill is
> invisible, and the biggest, brightest things on the glass are field ribbons, planets and a
> paragraph of HUD.

| # | Finding | What the frame shows |
|---|---|---|
| **F1** | **You cannot find your own ship.** | Crucible at 166–168 WU/s: the player hull is a ~15–20 px chevron at 1080p, off-centre from the aim ring. Adventure at cruise: the hull is lost at the head of a ~600 px plume. Nothing in `FEEL_CONTRACT.md` or any packet measures how big the player's hull is on screen. **Measured and fixed the same day:** the drawn hull was 1–2 WU on a 28–32 WU collision body (4 px in the Crucible) because the micro-motion scale channel captured its base from the pre-swap substrate and flattened the authored radius fit on every hull admitted after first scan (introduced 2026-09-20). |
| **F2** | **The frame is louder than the fight.** | Crucible round 1: arena ribbons and violet ring segments cover a third of the frame; one frame holds a galaxy, a ringed gas giant, a blue planet and a nebula (space wallpaper). The near rocks read as beige clay with pink crystals. The actors are the smallest things on the glass — the exact "particle-effects showcase where the underlying event was boring" `VISION.md` forbids. |
| **F3** | **The kill does not read.** | 400 ms after the first Crucible kill there is no wreck, burst or moved body anywhere you would see it. The four channels fire (`PQ-210.04`); at this scale they land on a few pixels. |
| **F4** | **The HUD narrates.** | A permanent card, "Banking — primary fire (LMB) · recharging / Trap — Y · 6 remaining · armed"; a seven-line target card; "Bank St…" and "Concus…" cut off; a floating "Research unlocked gear."; the Massline's `CAN` state printed on a rock, where a stranger reads it as a cargo can; a nine-key tray as the teaching. The ORRERY flight cluster (v2–v4, landed an hour after these frames) replaces the card set with one ring instrument; the `CAN` word, the truncated band label and the truncated bottom-right legend were still on the glass after it. |
| **F5** | **Screens are spreadsheets and the demo path is not a path.** | Station, results and the Crucible door are tables and card grids. The title lists Crucible fourth. Launch to first control in the Crucible took 81 s on a loaded machine (cook ledger: rock pools 13.6 s, Crucible warm 12.9 s, post-opening pipelines 14.0 s, first-frame pool census 15.3 s) — re-measure quiet before quoting it, but no quiet reading will make it 10 s. There is no demo build, no end-of-demo card, no bridge from results into adventure. |
| **F6** | **On a busy machine the fight does not start.** *(found by the first stranger pass, 2026-09-23)* | 10–17 hostiles orbit the player at 180 WU for four minutes without firing, and after "Take it to the belt" the adventure opening paints only the sky. One cause: NPCs may fire and meshes may show only once their authored admission publishes, and that admission is one serial lane where ~50 jobs — Helios station furniture beside the arena included — queue ahead of the ships you are fighting. Load-dependent, so a quiet bench passes it. |

## 2. The look and feel: **see the body**

Five threads on the build map, taken together, are one feeling. None of them closes alone.

| Springboard | What it contributes to "see the body" |
|---|---|
| §23 **CV-GLASS** + `PQ-159` camera | The hull is on the glass, at a size you can steer, every frame. |
| §23 **CV-PAINT** + A2 lane (`AQ-LIGHT`, `AQ-SURFACE`) + §22 C6 | The world yields to the actors: one sky, dark enough for the action to explode on, substances that read. |
| §23 **CV-HAND** / **CV-AMMO** + `PQ-210.04` + §22 B3/B5/B9, F1 | What you did to a body is visible: it moved, it broke, it lit, it sounded. |
| §23 **CV-KIT** + [`ORRERY`](../frontend/ORRERY.md) Phases 1 and 3 | The instrument sits on the picture and stops talking over it. |
| `PQ-210.08` the fifteen-minute demo | The spine: title → Crucible → results → adventure → station, as one thing a stranger plays. |

**The law of the glass** (every phase is judged against this order of visual weight):
1 your hull → 2 the body you are acting on → 3 the consequence (moved mass, wreck, light) →
4 the threat → 5 the world → 6 the instrument → 7 the sky. If a lower rank is out-shouting a
higher one in a frame, that frame fails, whatever the numbers say.

## 3. The bars nobody had written down

Each is **NEW**. Each gets its instrument before its fix.

| Bar | Number (1920×1080, shipping camera, fixed seed) | Instrument |
|---|---|---|
| **Body scale** | Player hull on-screen length p10 ≥ **48 px** in calm flight, ≥ **36 px** in a Crucible fight, ≥ **28 px** at top earned speed. Hostile light hulls in frame: median ≥ **18 px**. | `npm run probe:body-scale` (adventure seed 47, Crucible seed 4242) |
| **Hull never hidden** | The player's plume or any VFX covers the hull's screen centre in **0 %** of samples. | same probe |
| **The fight still fits** | `FEEL_CONTRACT` B3b holds: hostile in frame ≥ 80 % of a fight **or** edge-marked (§22 G4). Body scale may not be bought by losing the fight. | same probe + B3b |
| **The sky yields** | At most **one** hero celestial body per sector/arena profile; sky plate luminance below muzzle and engine (§22 C6). Arena field visuals at rest are thin lines; they brighten only when a body is on them. | data fixture over `sectorVisualProfiles` / arena profiles |
| **The kill reads** | Within 250 ms of `entity:killed`, the kill site holds at least two wreck bodies that keep the victim's momentum and a light event, at ≥ the victim's own on-screen size. | Crucible bench seed 4242 + the event bus |
| **HUD quiet** | In flight: **0** persistent sentence cards; no primary label truncated at 1280×720 or 1920×1080 (extends §22 G5); the Massline bracket state reads as a shape, never as a word a stranger mistakes for an object. | `ui-bench --shot=flight,crucibleHud` + layout fixture |
| **Load** | Launch to first control, quiet machine: Crucible ≤ **15 s** (target 10), New Game ≤ **10 s**. | `probe:smooth-flight` launch line, quiet host |
| **Stranger pass** | The fifteen-minute path (`DEMO_READINESS` §5) plays with no frame over 100 ms, and the lead opens a frame from every step and names nothing that fails the law of the glass. | `PQ-210.08` scenario + frames looked at in session |

## 4. The phases

Phases 1–4 run in parallel, one agent per lane, because their files are disjoint. Phase 5 starts
when Phases 1 and 4 each have a visible slice; Phase 6 after Phase 5's demo flag; Phase 7 last.
Each phase ends with a **stranger pass** (the §3 row) — a look at the real frames, not a green check.

| Lane | Phase | Owns (exact files decide; check `NOW.md` first) |
|---|---|---|
| Body | 1 | `src/render/partsLibrary.js` ship build paths, `src/render/camera.js` zoom terms, plume sizing in `src/render/thruster/` |
| Frame | 2 | `src/render/spaceBackground.js`, `src/data/sectorVisualProfiles.js`, arena presentation, `src/render/industrialMaterialFamilies.js` |
| Hit | 3 | `src/systems/aftermathWrecks.js`, `src/render/vfx.js`, `src/render/feel.js`, `src/ui/screens/crucible.js` replay |
| Instrument | 4 | `src/ui/orrery/`, `src/ui/hud.js`, `src/ui/masslineHud.js`, Crucible screens (the live ORRERY lane) |

### Phase 1 — THE BODY *(camera and hull presentation)*

*Springboards:* CV-GLASS, `PQ-159`, §22 G4, `FEEL_CONTRACT` B3b.

1. **Instrument.** `probe:body-scale`: per 250 ms, the applied zoom and each term that fed it, the
   player hull's projected length and screen offset, hostile sizes and in-frame counts, plume
   occlusion. Baseline both routes before any change.
2. **Zoom policy: fit the fight without losing the hull.** Speed zoom and combat composition may
   not push the player hull under the floor. A threat the floor pushes out of frame is carried by
   an edge marker (§22 G4), not by zooming out further.
3. **Plume grammar.** Plume length and brightness scale with hull size and zoom; the hull is always
   in front of its own fire.
4. **Silhouette by light.** A real key/rim light on the player and the active target so the hull
   reads against nebula and rock. Light, not an outline card.
5. **Hostile readability.** Role silhouettes and engine colour make a light hull readable at 18 px
   (`PQ-161`).

*Wrong:* scaling the drawn hull away from its collision body (the picture lies about where you
are); a halo, ring or sprite standing in for the ship; turning off sky, bloom or draw distance;
zooming so close the fight leaves the frame.

### Phase 2 — THE FRAME *(visual hierarchy)*

*Springboards:* CV-PAINT, `AQ-LIGHT` (in flight), `AQ-SURFACE`, §22 C6, `PQ-190.01`.

1. **One sky.** One hero celestial body per sector and arena; the rest of the plate is dark enough
   that muzzles and engines are the brightest things in frame (C6's luminance numbers).
2. **The wakes and the rings.** Attributed 2026-09-23 by hiding objects and diffing pixels: the
   sweeping blue arcs are the player's round wakes (`SF_WeaponRibbons`, 24 recorded heads, 90–500
   WU long) and the violet ring segments are the kill/impact structural beats
   (`SF_ArcadeStructuralFx`, ~700 per fight). Neither is arena decoration. The wakes must match the
   round's sim path exactly (a wake that bends while the round flew straight lies about the shot);
   then both families are sized and weighted under the hierarchy — a wake is a thin line behind the
   round, a ring beat never out-shouts the body it marks.
3. **Substances.** Common rocks from beige clay to painted industrial stone (`AQ-SURFACE`); NPC
   plumes at parity with the player's.

**Owner ruling (2026-09-23, later):** *"the background isn't really bad per se, I think there's a
risk of denoising the background into nothing."* The sky, plates, nebulae and starfields stay rich
and authored. Phase 2 is not a dimming pass: no further hero-body cuts, no plate darkening, no
starfield or nebula removal. What remains here is the rocks' substance and the weight of the
effect families (wakes, ring beats) relative to the bodies they mark.

*Wrong:* a global grade; deleting the arena's readability; glow as substance; a photo texture on
a hull; dimming or thinning the sky to win hierarchy.

### Phase 3 — THE HIT YOU CAN SEE *(consequence legibility)*

*Springboards:* CV-HAND, CV-AMMO, `PQ-210.04`, §22 A7 (muzzles move), B3 (wrecks persist), B5
(slam ≠ nudge), B9 (kill replay), F1 (release ghost), F5 (near miss).

1. A kill is **bodies**: the victim becomes wreck pieces that keep its momentum, lit, at a size you
   can see — then those pieces are grabbable (B3).
2. A slam and a nudge differ on every channel (B5).
3. The throw shows its future without steering it (F1).
4. Round end can replay the last kill for five seconds from the seed (B9).

*Wrong:* more particles, camera shake with no moved mass, a damage number, a combo meter.

### Phase 4 — THE INSTRUMENT *(ORRERY Phase 1 and Phase 3)*

*Springboards:* ORRERY Phase 0a (landed), CV-KIT, §22 G1, G3, G5, G7, G8, G13, G14, ledger D14.

1. Flight HUD at rest: hull ring, speed, power ring. The status card, the seven-line target card and
   the floating sentences go (their facts move to the lock ring on the target, the power ring, and
   receipts).
2. The Massline bracket state is a shape on the target (G1), never a bare `CAN`.
3. No truncated primary label at either resolution.
4. Crucible door, refit and results rebuilt from the ORRERY library. Results is the kill replay,
   the stunt names and **Again** — not a table.
5. The demo end card (`src/ui/screens/demoEnd.js`, landed on the plain kit) moves onto ORRERY
   with the rest: the Hand on **Keep playing**, the three facts as rolling counters.

*Wrong:* a token rename, restyling the same boxes, anything under `approved/` treated as law.

### Phase 5 — THE DEMO PATH *(front door to end card)* — mostly **NEW**

1. **Demo build.** One flag on the same game path (never a fork): `IS_DEMO` in
   `src/core/demoMode.js`, set by a bundle define (`build-bundle --demo`) and, on the dev server
   only, by `?demo=1` so the default route stays testable. In the demo the title's primary verb is
   **Crucible**, New Game reads **Adventure**, Load is hidden; Continue still appears when a save
   exists. Crucible results gain **Take it to the belt** (starts Adventure). Nothing is locked or
   timed. Build: `node scripts/build-bundle.mjs --demo` (or `SPACEFACE_DEMO=1`); dev server:
   `?demo=1`; bench: `node scripts/ui-bench.mjs --demo --shot=title`. URLs for Feedback and the
   store page live in `src/data/demoConfig.js` (blank hides the word).
2. **Live title.** The title plays a deterministic Crucible replay behind the menu (the replay ring
   buffer of `PQ-160` exists), instead of a still with drift. Determinism at the front of the house.
3. **Round zero teaches by doing.** The first 45 s of the first Crucible run hands the player three
   bodies — a rock worth throwing, a light hull worth shoving, a well worth dropping — before the
   pack arrives. No modal, no paragraph.
4. **Load.** Crucible launch to control inside the §3 bar; the long cook stages (rock pools,
   Crucible warm, post-opening pipelines, first-frame census) are overlapped with the door, the
   draft and the countdown, never deleted.
5. **End card.** Once per save, after the adventure beat (first module fitted and the ship
   undocked with it): what you did (best stunt, credits earned, the module you fitted), **Keep
   playing** (the default), **Feedback** and a store link — both read from build config and hidden
   when blank — and Main menu. No nag, no lock.
6. **The path, scripted.** `PQ-210.08` plays end to end.

*Wrong:* a second entry point or build; a tutorial modal; a loading screen that hides a cut picture.

### Phase 6 — THE WORLD ON THE WAY *(the adventure five minutes)*

*Springboards:* CV-DAY, CV-QUIET, §22 A1–A6, ORRERY Phase 4 (hub and market only for the demo).

The opening neighbourhood shows one working chain within two screen-depths; the first raid is
already happening; the first station reads as a place; one upgrade is felt on the way out (A6).

### Phase 7 — SHIP THE DEMO

*Springboards:* `PQ-033.02` (min-spec floors, `--next` today), `PQ-033.03` store remainder, §22 E1
(pad six verbs), E8 (iGPU preset), `PQ-167`.

Electron demo package; crash reporting on; store screenshots retaken in photo mode (the five on the
page are stand-ins); **NEW:** a sixty-second trailer cut from deterministic Crucible replays;
**NEW:** a local, opt-in demo funnel (boot → Crucible → round 3 → results → adventure → end card).

## 5. What the plans were missing

Everything else in this program already had an owner. These did not:

1. A **body-scale bar** — no number anywhere measured the player's hull on the glass.
2. **Hull never hidden** behind its own plume or effects.
3. The **law of the glass** as a visual-weight order a frame can fail.
4. **The kill reads** at the shipping camera, as bodies.
5. A **HUD sentence budget** for flight.
6. A **Crucible load** bar (only boot and New Game were measured).
7. A **demo build flag** and an **end-of-demo card**.
8. A **live, deterministic attract** on the title.
9. **Round zero** of the Crucible teaching by doing.
10. A **trailer from replays**.
11. A **stranger pass** closing every phase — a look at frames, because forty closed leaves did not
    move the frame.
12. **Admission follows the law of the glass.** The bodies you are fighting load before the
    dressing, and a mode never admits a sector it is not in. Found only by walking the path on a
    busy machine (F6).

## 6. How agents get this wrong

- Closing a phase on a green number while the frame still fails the law of the glass. This program
  exists because that happened.
- Answering "I cannot see my ship" with a marker, halo, glow or sprite.
- Drawing the hull bigger than its collision body.
- Turning off sky, bloom, shadows or draw distance to fix hierarchy.
- Re-opening a `done` packet to re-derive it instead of looking at what it put on screen.
- Taking a later phase because it is more fun while an earlier one has no visible slice.

## 7. Next, in order (after the first session, 2026-09-23)

The first session closed Phase 1's body scale, most of Phase 3, the Phase 4 Crucible sentence
card, Phase 5's demo flag and end card, and F6. What the stranger pass still showed, in the order a
stranger would notice it:

1. **Load** (Phase 5.4): Crucible launch → control is still 47–108 s on a busy host. Take a quiet
   reading first; then the ~14 s of fixed bootstrap waits and the first-frame census.
2. **Belt tail** (F6 follow-up): after the bridge, ~8 bodies still compiling at 10–20 s on a busy
   host — throughput, not ordering. Order what the opening frame shows first.
3. **The rocks and the sky** (Phase 2.3, 2.1): beige-clay rocks with pink crystals; a galaxy plate
   plus a ringed giant in one Crucible frame. `AQ-SURFACE` and C6's luminance numbers.
4. **`CAN`** (Phase 4.2): the latch state is still a bare word beside the body.
5. **Round zero** (Phase 5.3) and the **live title** (Phase 5.2): not started.
6. **The honest death** (Phase 5.6): the stranger pass reached results through the run's end API
   because the fight never killed the player in four minutes; re-walk it after F6 and take the
   `PQ-210.08` scripted path end to end.

## 8. Progress

One line per slice that landed: phase, what a stranger now sees, the number, the commit.

| Phase | Slice | Number | Commit |
|---|---|---|---|
| 1 | `probe:body-scale` built: drawn hull, collision body, zoom terms, plume, hostiles per 250 ms | baseline: player hull p50 12 px (adventure) / 4 px (Crucible) on a 167 / 103 px body | `dbcc1d4e1`, `64d481cb8` |
| 1 | Ships draw at the size of their body again (every hull admitted after the micro-motion tracker's first scan had been drawn at ~1/20 scale) | player hull p50 **12 → 175 px** adventure, **4 → 63 px** Crucible; Crucible hostile median **5.5 → 65 px**; pinned by `test/ship-hull-scale-swap.test.mjs` | `cc0ea72ca` |
| 3 | A Crucible kill leaves the ship's body: the arena has no sector, so every swarm kill had been rejected before a wreck existed. Now one latchable body per kill at the victim's pose, size and real momentum, eight kept (the farthest retires), still there after the shop | swarm-kill wrecks **0 → 1 per kill**, radius 9 → victim radius, at-kill speed kept up to 600 WU/s; `test/crucible-wreck-body.test.mjs` | `e01a87854` |
| 3 | The wreck is the ship you killed: a kill hulk resolves the same authored hull file the victim drew (a swarmer's hulk is its dart), lights out, fitted to its body | hulk identity **generic aftermath piece → victim's own hull** (live: 11/11 meshes dead-stamped, drawn 19.2 WU on a 21 WU body); `test/wreck-hulk-body.test.mjs` | `958eb44f7` |
| 3 | A fresh kill still glows: the dead hull carries an ember that cools to cold over its first six seconds of sim time, so the consequence reads before it settles into terrain | ember 1.5 at the kill → 0.375 at 3 s → 0 at 6 s; no program re-key | `80f6830b9` |
| 4 | The Crucible stops narrating the fight: the permanent "Banking … / Trap … remaining · armed" card is gone (the ordnance ring carries the trap count), and a hint with nothing to point at ("Research unlocked gear.") arrives as a receipt instead of hovering over your hull | persistent sentence cards in Crucible flight **1 → 0**; strings anchored to the player hull **1 → 0** | `aea22be1b`, `0ad761241` |
| 3 | Checked: the sweeping blue wakes are true — every player round's wake sits on its sim path (banked rounds really curve) | ribbon vs sim path deviation **0.00 WU** over 12 rounds; `test/weapon-ribbon-frame-truth.test.mjs` | `81cf8d982` |
| 5 | The demo build: one flag on the one game path. The title lights Crucible, New Game reads Adventure, Load is hidden; results offer **Take it to the belt**; after the first upgrade is fitted and flown out of the dock, a once-per-save end card with **Keep playing** | `test/demo-mode.test.mjs`, `test/demo-path.test.mjs` (14 pins); bench shots `title --demo`, `demoEnd` | `d0453e19f`, `9210ff7b7` |
| 5 | The Crucible starts cooking when you open its door, and stops compiling the same program twice: the roster warm begins behind the menu, duplicate compile issues (~2 800 per cook) are skipped, already-linked materials leave the queue | launch → control on a loaded host **85 / 112 / 87 s → 87 / 78 / 61 s** (median −10 s); `live.cook` **34 → 10–22 s**. **Still far from the 15 s bar**: what remains is real coverage (~660 unique programs, warm-root uploads, first-frame census) plus ~14 s of fixed bootstrap — the next cut is a quiet-host reading and the bootstrap waits, never the wave prewarm | `2685e58b8` |
| 3 | A kill's hulk no longer links a shader mid-fight: the dead-hull clone keeps its program key, and one exemplar of each roster hulk is warmed before wave 1 | post-launch program links in a Crucible round with kills **+4 → 0** (four kill-containing runs, 0 draw-time links); `probe:smooth-flight:crucible --with-kill` | `e680c9116`, `d84fb8f45` |
| 1 | The fight starts on time on a busy machine (F6): a hostile ship inside the fight-fit range takes the admission lane ahead of station furniture and the queued hub, and a Crucible run stops admitting Helios dressing it cannot show | wave-1 materialization → first hostile shot at 77–85 % host load **never in 240 s → 0.3–1.3 sim-s**; belt-bridge hull painted by 5 s on every run; `test/authored-upgrade-policy.test.mjs`, `test/authored-critical-admission-order.test.mjs` | `100d9dbb9` |
| 1 | Far scenery waits during a Crucible fight only when it could not be on the glass: the defer asks the renderer's own glass classifier (lead-shifted frame, skirt, body radius) instead of a distance | scenery on the glass left pending by the defer **possible → 0**; on-glass pending (wave-2 ships, fresh hulks) 0 by ~25 sim-s on a 60 % host — throughput, next item 7.2 | `3e8e48269` |
| 2 | The sky yields a single camera-visible planet or wormhole; the authored plates and starfields remain, and a departed landmark can hand off its place as you fly. The arena, sky luminance and substances are still open. | concurrent hero limit **up to 3 → 1**; four live sector captures: Helios 1, Ceres 0, Pallas 1, Veil 1; 28 focused tests and the public flight route passed | `88a91dff0` |
| 5 | The Crucible launch warm pays only the wave it can field: ship exemplars and (file × palette) subjects scope to the launch wave's eligibility (`swarmEligibleEnemyIds`) instead of the whole roster plus boss packages, and each later wave's newcomers run the same exemplar → compile → residency recipe during the armory dwell. The launch control reads "Readying the field…" until the batch settles; a skipped draft still warms through `run:wavePlanned`; a mid-run re-cook scopes to the restored wave | live probe (86 % host CPU): launch ship cohort **~13 kicks → 2** (`wasp_swarmer` + player, both `authored-root` at flight), in-round **shaderLinks +0 / bufferFullUploads +0** across a kill-containing sample; fixed sleeps on the launch path **0** (the ~14 s earlier readings were bounded races on real readiness, not timers); launch→flight 386 s is host-starved, not a bar reading — quiet-host re-measure still owed; `test/swarm-deferred-warm.test.mjs` (7) + 25-test warm suite | pending |
