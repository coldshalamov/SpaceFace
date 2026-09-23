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
| **F1** | **You cannot find your own ship.** | Crucible at 166–168 WU/s: the player hull is a ~15–20 px chevron at 1080p, off-centre from the aim ring. Adventure at cruise: the hull is lost at the head of a ~600 px plume. Nothing in `FEEL_CONTRACT.md` or any packet measures how big the player's hull is on screen. |
| **F2** | **The frame is louder than the fight.** | Crucible round 1: arena ribbons and violet ring segments cover a third of the frame; one frame holds a galaxy, a ringed gas giant, a blue planet and a nebula (space wallpaper). The near rocks read as beige clay with pink crystals. The actors are the smallest things on the glass — the exact "particle-effects showcase where the underlying event was boring" `VISION.md` forbids. |
| **F3** | **The kill does not read.** | 400 ms after the first Crucible kill there is no wreck, burst or moved body anywhere you would see it. The four channels fire (`PQ-210.04`); at this scale they land on a few pixels. |
| **F4** | **The HUD narrates.** | A permanent card, "Banking — primary fire (LMB) · recharging / Trap — Y · 6 remaining · armed"; a seven-line target card; "Bank St…" and "Concus…" cut off; a floating "Research unlocked gear."; the Massline's `CAN` state printed on a rock, where a stranger reads it as a cargo can; a nine-key tray as the teaching. |
| **F5** | **Screens are spreadsheets and the demo path is not a path.** | Station, results and the Crucible door are tables and card grids. The title lists Crucible fourth. Launch to first control in the Crucible took 81 s on a loaded machine (cook ledger: rock pools 13.6 s, Crucible warm 12.9 s, post-opening pipelines 14.0 s, first-frame pool census 15.3 s) — re-measure quiet before quoting it, but no quiet reading will make it 10 s. There is no demo build, no end-of-demo card, no bridge from results into adventure. |

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

Order is law: a phase starts when the one before it has shipped a slice a stranger can see. Each
phase ends with a **stranger pass** (the §3 row) — a look at the real frames, not a green check.

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
2. **Arena lines at rest.** Arena field and ricochet visuals re-cut as thin instrument lines that
   brighten only when a body rides them. The arena stays readable; it stops being the subject.
3. **Substances.** Common rocks from beige clay to painted industrial stone (`AQ-SURFACE`); NPC
   plumes at parity with the player's.

*Wrong:* a global grade; deleting the arena's readability; glow as substance; a photo texture on
a hull.

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

*Wrong:* a token rename, restyling the same boxes, anything under `approved/` treated as law.

### Phase 5 — THE DEMO PATH *(front door to end card)* — mostly **NEW**

1. **Demo build.** One flag on the same game path (never a fork): the title opens on **Crucible**
   first, non-demo surfaces are hidden, and saves are separate from the full game.
2. **Live title.** The title plays a deterministic Crucible replay behind the menu (the replay ring
   buffer of `PQ-160` exists), instead of a still with drift. Determinism at the front of the house.
3. **Round zero teaches by doing.** The first 45 s of the first Crucible run hands the player three
   bodies — a rock worth throwing, a light hull worth shoving, a well worth dropping — before the
   pack arrives. No modal, no paragraph.
4. **Load.** Crucible launch to control inside the §3 bar; the long cook stages (rock pools,
   Crucible warm, post-opening pipelines, first-frame census) are overlapped with the door, the
   draft and the countdown, never deleted.
5. **End card.** After the adventure beat: what you did (stunts, the ship you fitted), feedback,
   and a store link slot. No nag.
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

## 6. How agents get this wrong

- Closing a phase on a green number while the frame still fails the law of the glass. This program
  exists because that happened.
- Answering "I cannot see my ship" with a marker, halo, glow or sprite.
- Drawing the hull bigger than its collision body.
- Turning off sky, bloom, shadows or draw distance to fix hierarchy.
- Re-opening a `done` packet to re-derive it instead of looking at what it put on screen.
- Taking a later phase because it is more fun while an earlier one has no visible slice.

## 7. Progress

One line per slice that landed: phase, what a stranger now sees, the number, the commit.

| Phase | Slice | Number | Commit |
|---|---|---|---|
| 1 | Body-scale probe built; baseline taken | see the probe's first readings | pending |
