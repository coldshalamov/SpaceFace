# SPACEFACE — MEDIA PIPELINE (images ↔ video, systematic)

*The explicit production process for every cinematic. Video models generate single-camera shots
and remember nothing. So: images are generated first and condition everything; each shot is one
setup with its own keyframes; cuts happen in the edit, not in the generation; all text is
composited in post. This document binds `ART-PROMPTS.md` (images), `VIDEO-CLIPS.md` (shot specs),
and `THE-STORYLINE.md` (voice) into one executable flow.*

*Law carried over: Vethari always off-frame. No Witness face. No Vale person. No Elroy body.
Protected dialogue exact. End on the number. No score.*

---

## 0. Principles (why it's built this way)

1. **Consistency is an image problem, not a video problem.** Video models can't hold a face or a
   hull across two generations. Image models can be conditioned. So every recurring visual gets a
   **reference asset** (character turnaround, environment plate, prop plate) generated *once*,
   approved *once*, and injected as conditioning into every downstream generation.
2. **One clip = one camera setup.** Video gen produces a single continuous shot. The cutscene's
   grammar comes from the **edit**: cut on the stamp, cut on the number, hold on the stencil.
   Never ask one generation to change angles.
3. **Keyframes bracket the motion.** For each clip, generate a **start frame** (always) and an
   **end frame** (when the shot has blocking change). Run image-to-video between them. The start
   frame of clip N+1 is either the extracted last frame of clip N (same setup continuation) or a
   new keyframe conditioned on the same anchors (new setup).
4. **Never generate text.** Models mangle strings. All diegetic text (manifests, killfeeds,
   graffiti, HUD stamps) is **composited in post** over clean plates. The exact string table in
   `VIDEO-CLIPS.md` is the source of truth. This also makes text fixes free.
5. **Minimize faces, minimize cost.** House style already favors hands, backs, silhouettes,
   helmet lamps. Keep it: it kills the lip-sync problem (only V-09 has sustained dialogue and it
   is staged side-on at distance), and it is *also* the correct aesthetic.
6. **Grain and grade unify everything.** Individual generations will differ. A shared LUT +
   film-grain pass in assembly makes 80 separate generations read as one film.

---

## 1. The five phases

```
PHASE 1  ANCHORS        Character turnarounds, environment plates, prop plates.
                        Approved via contact sheets. Recipes logged (seed/model/weights).
PHASE 2  KEYFRAMES      Per-clip start (and end) frames. Image-gen, conditioned on anchors.
PHASE 3  VIDEO          Image-to-video per clip: keyframe(s) + motion prompt. 4–9s each.
PHASE 4  ASSEMBLY       Edit per scene, LUT + grain, composite all text, lay in audio/VO.
PHASE 5  QC + INTAKE    Consistency checklist, story-beat check, export, manifest entry.
```

Each phase has a gate. Nothing proceeds to video with an unapproved keyframe. Nothing ships with
an uncomposited text burn-in.

## 2. Asset IDs and registry

Everything is keyed so a clip can name exactly what conditions it.

| Prefix | Asset | Example |
|---|---|---|
| `CR-<name>-<n>` | Character reference (angle/expression variant) | `CR-WREN-02` |
| `ENV-<set>-<n>` | Environment plate (camera-position variant) | `ENV-AIRLOCK-PIT-01` |
| `PR-<prop>-<n>` | Prop/artifact plate | `PR-GRID-01` |
| `KF-<scene>.<clip>-<A/B>` | Shot keyframe (A=start, B=end) | `KF-07.04-A` |
| `VC-<scene>.<clip>` | Generated video clip | `VC-07.04` |
| `SC-<scene>` | Assembled scene | `SC-07` |
| `TX-<scene>.<clip>` | Post-composited text card/overlay | `TX-07.04` |

Recipes live in `media/recipes/<asset-id>.md`: prompt, seed, model+version, reference images
used, weights, and the approval date. **Regeneration without the recipe is forbidden** — a
regen from scratch is how characters drift.

### 2.1 Anchor set (Phase 1 work order — delta on top of `ART-PROMPTS.md`)

`ART-PROMPTS.md` already specifies the master look. Phase 1 adds **turnaround discipline**:
every character that appears in 2+ scenes gets 4 angles (front, 3/4, profile, back/hands) at the
same light, same wardrobe, same session; every set gets 2–3 plates matched to the clip camera
positions.

**Characters (turnarounds required):**
- `CR-WREN-01..04` + `CR-WREN-HELMET` (helmeted, lamp on) — see ART-PROMPTS §1 Wren; add:
  *"same man, same worn charcoal flight suit, same session, four angles: front, three-quarter,
  profile, back-with-hands; 60% spectrum key from camera-left; chalk-gray seamless backdrop;
  documentary still, film grain."*
- `CR-KESSLER-01..04`, `CR-CALLUM-01..04`, `CR-DREE-01..04`, `CR-SLATE-01..04` (mask up + down),
  `CR-QUINN-01..04`, `CR-SUMP-01..04`, `CR-IVO-01..04`, `CR-WITNESS-01..03` (back/shoulders/hands
  only — **never generate a face plate**), `CR-VOSS-01..03`, `CR-ROOK-01..03`, `CR-CLERK-01..03`,
  `CR-SPENCE-01..02`, `CR-WEX-01..02`, `CR-LIEN-01..02`, `CR-ELROY-01` (one living portrait,
  used nowhere on-screen except a file photo — he is never a body).
- **Faces-minimized rule:** Wren's default in-cockpit asset is `CR-WREN-HELMET`. Use it wherever
  the clip allows.

**Environments (plates per camera position):**
- `ENV-HELIOS-DOCK-01/02` (security-cam wide; berth level)
- `ENV-PIT-DOCK-01/02` (sodium wide; berth-fee window)
- `ENV-AIRLOCK-PIT-01` (interior, helmet-lamp angles — the graffiti wall, blank; text in post)
- `ENV-TESSERA-EXT-01..03` (3/4 bow, profile, docked; see ART-PROMPTS §4)
- `ENV-TESSERA-COCKPIT-01/02` (over-shoulder; helmet-lamp)
- `ENV-SCALE-TYCHO-01/02`, `ENV-MERIDIAN-FLOOR-01/02` (booth side angle — V-09's locked side),
  `ENV-CLEARING-01/02` (board; clerk desk), `ENV-CINDER-BOOTH-01`, `ENV-OUTPOST9-BAR-01/02`,
  `ENV-GATE3-01/02`, `ENV-ANNEX-DRAWER-01`, `ENV-BAY7-01/02` (warehouse; rack close),
  `ENV-ASHFALL-CORRIDOR-01`, `ENV-LEDGER-ROOM-01/02` (wide; over-shoulder at desk),
  `ENV-IRONMAW-EXT-01`, `ENV-SHAFT7-01`, `ENV-VALE-OFFICE-01` (empty, warm, signature pad).

**Props:**
- `PR-MANIFEST-01` (blank terminal — text in post), `PR-GRID-01` (12.4t grid, dusty, on rack),
  `PR-LEDGER-01` (open, handwriting, blank-ish pages for post text), `PR-CHIP-01`,
  `PR-CHITS-01` (drawer contents), `PR-TICKET-01` (maintenance terminal, blank fields),
  `PR-CALENDAR-01` (14-years-old booth calendar), `PR-WAIVER-01` (carbon slip).

### 2.2 Contact-sheet gate (end of Phase 1)

Every character/set gets a contact sheet (all angles on one sheet) reviewed against the casting
descriptions in `CREATIVE-DIRECTION.md` §4 and the look in `ART-PROMPTS.md`. Approval is binary
and recorded in the recipe file. **No Phase 2 work starts for a scene until its anchors pass.**

---

## 3. Per-shot production line (the systematic unit)

Every clip in `VIDEO-CLIPS.md` gets a production line:

```
VC-<scene>.<clip> | <dur> | KF-A: <prompt + refs> | KF-B: <prompt + refs or "extract VC prev">
                  | REFS: <anchor IDs> | MOTION: <camera + action, 1 line>
                  | TEXT: <TX ids — composited in post> | AUDIO: <diegetic note> | CUT: <cut-on>
```

**Motion prompts are one line and physical**: "locked camera, subject crosses left-to-right,"
"slow 10cm lateral dolly," "handheld drift, breathing." No emotional language — the model needs
verbs, not vibes.

---

## 4. Scene matrices — priority path (fully specced)

### SC-00 PROLOGUE (3 clips)
| Clip | KF-A (refs) | KF-B | Motion | Text (post) |
|---|---|---|---|---|
| VC-00.01 | macro blank terminal in dim cockpit (ENV-TESSERA-COCKPIT-02) | — | locked | TX-00.01: `SLOT01 TITANIUM ALLOY 12400KG` |
| VC-00.02 | extract VC-00.01 | — | locked | TX-00.02: `SLOT99 UNCLASSIFIED COMPOSITE 3.1 KG [PERSONAL EFFECTS — DO NOT TRANSFER]` |
| VC-00.03 | empty cockpit, harness swinging (ENV-TESSERA-COCKPIT-01) | — | slow pull back | TX-00.03: `TESSERA / VHL-4471-T` |

### SC-01 COLD START (6 clips)
| Clip | KF-A (refs) | KF-B | Motion | Text |
|---|---|---|---|---|
| VC-01.01 | TESSERA at Helios berth, loading arm attached (ENV-HELIOS-DOCK-01 + ENV-TESSERA-EXT-03) | arm retracted | locked sec-cam | TX-01.01: dock log `LOAD COMPLETE 06:14:02` |
| VC-01.02 | WREN over-shoulder at controls (CR-WREN-HELMET, ENV-TESSERA-COCKPIT-01) | hand on throttle | slow settle | TX-01.02: `CONTRACT 47-A ACCEPTED…`; auth lines |
| VC-01.03 | TESSERA in black, distant flashes (ENV-TESSERA-EXT-01) | debris field glint | grainy drift | TX-01.03: killfeed 4 lines, sequential |
| VC-01.04 | TESSERA docking, Pit clamps (ENV-PIT-DOCK-01) | WREN silhouette unstrapping | clamp push-in | TX-01.04: `RETURN VECTOR SET` |
| VC-01.05 | airlock interior, blank wall screen (ENV-AIRLOCK-PIT-01) | — | helmet-lamp sway | TX-01.05: `SLOT01 … 00000KG`, `CONTRACT 47-A CLOSED`, `PAYMENT WITHHELD` |
| VC-01.06 | stencil wall, blank (ENV-AIRLOCK-PIT-01 alt angle) | hold | lamp finds wall, 3s hold | TX-01.06: **THEY KNEW THE MASS.** (+ Sump through glass: CR-SUMP-03, composite or in-frame) |

### SC-04 FIRST BLOOD (6 clips)
| Clip | KF-A | KF-B | Motion | Text |
|---|---|---|---|---|
| VC-04.01 | cockpit HUD dark (ENV-TESSERA-COCKPIT-01) | — | locked | TX-04.01: `TARGET ACQUIRED. TAG: UNKNOWN` / `IFF: —` |
| VC-04.02 | TESSERA external, muzzle flash (ENV-TESSERA-EXT-02) | target shields drop | distance static | none |
| VC-04.03 | HUD frame with civilian line (composite TX over HUD plate) | — | **one dropped frame; hard cut; total silence** | TX-04.03: `CIVILIAN VESSEL — REGISTERED` (≤0.5s) |
| VC-04.04 | same HUD plate as 04.01 | WREN still | locked | TX-04.04: `BOUNTY COLLECTED` / `TARGET NEUTRALIZED` |
| VC-04.05 | side terminal blank (ENV-PIT-DOCK-02 detail) | — | locked | TX-04.05: `They were carrying medicine.` → glitch → `Contraband detected.` + `PAYMENT CLEARED` |
| VC-04.06 | airlock stencil wall (ENV-AIRLOCK-PIT-01) | — | lamp slide off, 3s | TX-04.06: **THEY WERE CARRYING MEDICINE.** |

*Note: the flicker (04.03) is a post effect — the civilian line is composited for exactly the
frames it lives. Never ask a video model to do a half-second identity.*

### SC-07 THREE DOORS + DOUBLED CONTRACT (6 clips)
| Clip | KF-A | KF-B | Motion | Text |
|---|---|---|---|---|
| VC-07.01 | concourse wide, three board entries (ENV-CLEARING-01) | WREN reflection in board glass | slow dolly | TX-07.01: three door entries |
| VC-07.02 | records terminal blank (ENV-CLEARING-02) | second screen beside it | lateral slide | TX-07.02: `ADMINISTRATOR: V. DIRECTOR, ACTING / GOVERNANCE: REF 44-C` + customs docket `REG 44-C` |
| VC-07.03 | clerk at desk (CR-CLERK-01, ENV-CLEARING-02) | stamp down | locked | TX-07.03: `MEDICAL SUPPLIES — HUMANITARIAN RELIEF` on chit |
| VC-07.04 | board close, blank line (ENV-CLEARING-01) | WREN hand rising into frame | 8s hold, breathing | TX-07.04: `INTERDICTION — PRIORITY CLIENT. TAG: HOSTILE (REGISTERED CIVILIAN — FILED AS HOSTILE). FEE: DOUBLE STANDARD.` |
| VC-07.05 | TESSERA external fires on survey hull (ENV-TESSERA-EXT-02) | hull gone | static, hard cut | TX-07.05: `BOUNTY COLLECTED — PRIORITY` / `FEE: DOUBLE` |
| VC-07.06 | bare airlock wall (ENV-AIRLOCK-PIT-01) | WREN left hand still at side | lamp hold 3s | TX-07.06: **YOU READ THE TAG.** |

### SC-09 THE REUNION (6 clips)
Locked side two-shot for all dialogue (ENV-MERIDIAN-FLOOR-02 + CR-CALLUM-01/02 + CR-WREN-02).
Side-on framing kills lip-sync risk; VO laid in post. Clip-per-line-block per `VIDEO-CLIPS.md`
V-09.01–V-09.06; keyframes: KF-09.01-A (booth wide), KF-09.02-A (two-shot), KF-09.05-A (hands
below counter), KF-09.06-A (Callum back to futures). Text: none on screen except ticker glyphs
(TX-09.01 ambient board). Audio: protected dialogue VO + exchange murmur.

### SC-13 SMELL TICKET (4 clips)
| Clip | KF-A | KF-B | Motion | Text |
|---|---|---|---|---|
| VC-13.01 | warehouse wide, grid racked (ENV-BAY7-01 + PR-GRID-01) | dust line close | slow pan | TX-13.01: `RECEIVED YEAR 3 / INSTALL PENDING` |
| VC-13.02 | tag macro (PR-GRID-01 detail) | boot print in dust | macro hold | TX-13.02: `ISSUED YEAR 17 — WEEK OF 47-A` |
| VC-13.03 | terminal blank (PR-TICKET-01) | — | locked | TX-13.03: ticket + `CLOSED — NO ACTION REQUIRED` + `WEX` |
| VC-13.04 | rack empty space (ENV-BAY7-02) | — | slow pan out | none |

### SC-15/16 DEEP REACH + LEDGER ROOM (10 clips)
Anchors: ENV-IRONMAW-EXT-01, ENV-ASHFALL-CORRIDOR-01, ENV-LEDGER-ROOM-01/02, CR-WITNESS-01..03,
CR-WREN-HELMET, PR-LEDGER-01. All Witness shots conditioned on back/hands plates only. Key beats:
KF-15.02-A (breath visible corridor), KF-15.03-A (recognition close — the only Wren face beat in
the act; use CR-WREN-01), KF-16.01-A (room wide), KF-16.02-A (over-shoulder ledger), KF-16.06-A
(coordinates slip). Text: ledger lines, mutter subtitles optional (prefer no subtitles — the
mutter is allowed to be half-heard), `COORDINATES — 0.01t — FORMAT: UNKNOWN`.

### SC-18 LOOP (5) / SC-19 NEXT RUN (4) / SC-20 EPILOGUE (3)
Per `VIDEO-CLIPS.md`. Critical composites: TX-18.03 (dock date unchanged), TX-18.05
(`CONTRACT 47-A: STATUS: PENDING` + `+1 UNKNOWN`), TX-19.01 (`1,200 CR`), TX-20.02 (`THE COUNT
NEVER ENDS.` ghosting through wet paint — composite with paint-layer blend, not generation).

## 5. Interludes (scene-level work orders)

V-02, V-03, V-05, V-06, V-08, V-10, V-11, V-12, V-14, V-17: produce per the same line format
when scheduled. Anchors already listed in §2.1. Key requirements only:
- V-02: scale terminal is a blank plate (TX in post); Kessler thumb double-press is the motion.
- V-03/V-20: paint-over effect = gray plate + text composite under translucent paint layer.
- V-06: Slate's chalk column is a set piece (PR) — the year-3 entry must be composited, not generated.
- V-09.05 chip hand-off: hands-only keyframe (CR-WREN-04 + CR-CALLUM-03 hands variants).
- V-11.02 waiver: PR-WAIVER-01; the seventeen-year fine column is a post text column.
- V-14.03: Spence's eyeline to the false bottom — locked camera, no face emphasis.

---

## 6. Assembly, grade, audio

1. **Edit** per scene on the cut-on notes. Cuts are the grammar: cut on the stamp, the number,
   the flicker. Hold 3s on every stencil. Never dissolve.
2. **Grade:** one LUT for the whole project (coolant-teal shadows, sodium highlights, lifted
   grain) + uniform 35mm grain overlay. This is what makes 80 generations one film.
3. **Text pass:** all TX cards composited (terminal mono / stencil fonts per `SYMBOLISM-MOTIFS`
   typography note), tracked to plates where the camera moves.
4. **Audio:** room tone per set (dock rumble, recycler-wrong hum, exchange murmur); VO only for
   V-09 (protected dialogue), V-15.04/V-16.05 (Witness lines), V-17 (Vale's one line), V-19.01
   (courier line). No score. Sump's distant whistling is the only music.

## 7. QC gates

**Per clip (Phase 3 exit):** wardrobe/hair match to CR sheet; hull decals match ENV-TESSERA;
light direction matches scene plate; palette within LUT; no generated text artifacts (any baked
text = fail, regenerate clean, composite in post); no uncanny hands in focus (reframe or accept
only in silhouette).

**Per scene (Phase 4 exit):** story beat lands with zero reading (the minimal-text rule);
protected dialogue verbatim; ends on the number; zone law respected (no jokes in terminal
scenes; V-13 is the only comedy and it is a form).

**Per batch:** three-person watch — one who's never read the docs. If the new viewer can retell
the beat, it ships. If they can't, the scene fails no matter how good it looks.

## 8. Failure modes → fixes

| Symptom | Fix |
|---|---|
| Character face drift across clips | Recondition on CR turnaround; raise reference weight; fall back to helmet/hands staging |
| Text baked in, garbled | Regenerate clean plate; composite TX in post (always) |
| Lighting mismatch between setups | Grade to LUT; re-generate the offender keyed to the scene plate |
| Motion uncanny (melt/morph) | Shorten clip to 4s; add KF-B end frame; reduce motion prompt to one verb |
| Ship decal inconsistency | ENV-TESSERA plates as hard conditioning on every exterior |
| Scene reads as "pretty" | It's failed. Re-shoot to the house style block; pretty is the enemy |

## 9. Export & intake

- Masters: ProRes/H.264 1080p24 per scene (`SC-07.mp4`); game builds: **WebM VP9 1080p24**,
  clips both as scene assemblies and as individual `VC-*` files (engine may re-cut for branching).
- Manifest: `media/manifest.json` — `{ id, scene, trigger (V-07 → B4), files, duration, textless:
  bool }`. Triggers match the CLIP ORDER table in `VIDEO-CLIPS.md`; the cinematic fence
  (`src/ui/cinematicInputFence.js`) gates input during playback.
- Textless masters kept for localization (all text is post, so localization is a TX swap).

## 10. Work order (what to build first)

1. Phase 1 anchors for the minimal-text path (V-00, 01, 02, 04, 06, 07, 09, 13, 15, 16, 17, 18,
   19, 20) — ~14 characters, ~16 sets, ~10 props.
2. Pilot scene: **SC-01 end-to-end** (6 clips) to prove the pipeline, then **SC-04** (the
   flicker — hardest post beat) and **SC-09** (dialogue/VO proof).
3. Contact sheets reviewed → recipes logged → Phase 2/3 for the pilot batch.
4. Only then scale to interludes.

> **Canon refs:** `VIDEO-CLIPS.md` (shot specs + exact strings), `ART-PROMPTS.md` (look),
> `THE-STORYLINE.md` (voice standard), `CREATIVE-DIRECTION.md` (R1–R15, comedy law, casting).
