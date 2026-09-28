# Frontend overhaul plan — every surface a mini-app (2026-09-25)

**Owner direction (2026-09-25, verbatim in spirit):** a modern professional 2026 frontend on every screen and
menu, each meticulously planned; advanced Magic-UI-type features and mini-apps over vanilla CSS or anything
generic; custom and online-sourced assets (codex can make transparent images; custom SVG); **no super-thin
wireframe look and no generic elements**; every screen is its own mini-app with a creative interaction distinct
to it; keep going until every surface is covered and approved.

This plan sits on top of `ORRERY.md` (the design law: instruments of light, one amber Hand, bone rest light,
ice/phosphor for readings and motion, red only for threat, no CSS material imitation) and
`ORRERY_HANDOFF.md` (the library, the loop, the traps). Where they disagree, the owner's direction above wins:
an ORRERY-correct screen that reads as a thin wireframe or has no signature interaction is NOT approved.

## 1. The approval bar (every surface)

A surface is approved when an independent critic (persistent, one per surface group) scores it at least
**8.0 overall with no axis under 7** (Composition, Hierarchy, Legibility, ORRERY fidelity, Craft, Interaction)
**and** answers both owner criteria YES:
- **(a) Weight, not wire.** No instrument reads as a hairline drawing. Structural rings, tracks and rulers are
  luminous bands with body; values are lit fills; objects are produced art. See §2.
- **(b) A signature.** The surface has ONE interaction the player does nowhere else (listed in §4), alive with
  Magic-UI-grade motion, reduced-motion safe, keyboard and gamepad reachable.

Shots at 1920×1080, 1280×720 and 2560×1440, plus the states the signature needs (a motion capture where the
signature is motion). The critic brief is `scratchpad/critic-brief.md` (§7 = the owner criteria).

## 2. The weight system (library-level, `src/ui/orrery/`)

The thin look comes from 1px strokes at 25–40% bone with nothing behind them. The library gets a weight scale
so every instrument inherits body:

| Role | Was | Becomes |
|---|---|---|
| Unlit track / structural ring | 1–1.2px line, bone .25–.4 | **band**: 6–8px at bone .07–.10 under a 1.5px edge at .5, soft 3px halo |
| Lit value / progress | 2px line | 3–4px core + 10px bloom at .25, filled **bead** at the value |
| Ruler / tape / scale | 1px line + 1px ticks | 2px line; minor ticks 1.5px; majors 2px × 10px; station beads 8–10px filled |
| Rim ticks on dials | 1px | 1.5px, majors 2px |
| Input rule (fields) | 1px | 1.5px rest, 2px lit on focus |
| Hover / focus | colour change | the element's band lifts (.10 → .18) + a spotlight under the pointer |

Implementation: weight tokens in `tokens.js` (`--orr-w-track`, `--orr-w-core`, `--orr-w-tick`, band alpha) and
two primitives — `band(d)` (a path drawn twice: wide faint body + thin edge) and `litValue(d)` (core + bloom +
bead) — used by every instrument (`hullRing`, `stopDial`, `routeOrrery`, `crestOrbit`, `ledgerTape`,
`chainBeam`, `arcRail`, `waveform`, station rails). Screens never set hairline widths themselves.

Produced art replaces line drawings wherever an OBJECT is shown: sector bodies on the chart, medals, codex
plates, research stars, emblem faces, crests (exist), hulls (exist). Codex generates transparent PNGs →
`assets/ui/generated/<surface>/*.webp`.

### 2.1 The measured bar (critics, 2026-09-26)
The library default `.orr-band` (7 px at alpha .085) renders at 1.16:1 against the glass — invisible — so a ring
drawn with it reads as its 1.5 px core: a wire. A band counts as body only at **>= 2:1** (about lum 70 at rest on
glass ~10; ~100 hover; ~130 active), set per instrument with `--orr-band-a` / `--orr-w-band` and measured on the
pixels. Grip and dial rings are best an inward **annulus** with ticks cut through it and labels riding inside.
Stock web shapes fail (a) too: round-thumb sliders, corner brackets, icon-in-box lists, tab grids, pills. And (b)
fails when the gesture drives nothing else on screen.

## 3. Magic-UI-grade life (shared, reduced-motion safe)

Number ticker (`rollTo`, exists) · beams that travel along a path (tether pulse, route pulse, chain beam) ·
shimmer across the one Lamp Key · a **spotlight** that follows the pointer under a list or instrument · staggered
arrival (rings draw, words rise) · orbiting bodies (the orreries) · magnification on the station tab rail
(dock) · text decrypt on reveal · a marquee ticker where prices stream (Market). Library owns each; screens
compose them.

## 4. Every surface — its mini-app and its signature

Status as of 2026-09-28. **APPROVED** = passed §1 including (a) and (b) — 29 surfaces. Other scores are critic scores under the owner criteria unless marked "letter" (scored before the criteria existed). Latest critic report per surface: `design/frontend/review/reports/`.

| Surface (bench id) | Mini-app | Signature interaction (distinct) | Assets | Status |
|---|---|---|---|---|
| Title (`title`) | The emblem orrery behind the name | The Hand follows the pointer round the dial; the rings answer with parallax | — | **APPROVED 8.3** (frontdoor-r2, T-S1 verified live; Pause unregressed) |
| Pause (`pause`) | Seven-stop dial over the held world | Rows as stops: the Hand steps row to row, left/right along a row | — | **APPROVED 8.3** (frontdoor-rs1); polish carry-over: 0% gauge weight, 1280 LOCAL MAP touch, brief/RESUME tie |
| New Game (`new-game`) | The yard: the hull on a turntable ring | **Spin the yard**: drag the ring; each hull's mass sets its swing (heavy drags, light flicks); the stat arcs sweep between hulls; release settles with overshoot; hold LAUNCH runs light down the run's scale into the jump | new backdrop (done), Pelican poster to hero grade | **APPROVED 8.2** (r7, 5d855f9cc + follow-ups) — (a) yes, (b) yes |
| Loading (`boot`) | The emblem spinning up | Real load stages as ticks lighting round the ring | — | to audit |
| Settings (`settings`) | Mixer + live HUD preview | Ride a slider and the miniature Cluster/mixer answers live | — | **APPROVED 8.1** (setcr-r3) |
| Save/Load (`save-load*`) | Filmstrip on a curved rail | Scrub the rail; the chosen save's hull and facts decrypt in | poster hulls | **APPROVED 8.1** (sav-r3) |
| Game Over (`game-over`) | The cooled world | The cause decrypts; the career record is an instrument; restore = Lamp Key | — | **APPROVED 8.2** (sav-r3) |
| Codex (`codex`) | The archive | **Turn the plate's ring**: every entry on the ring, the Hand a blade that swings as you drag; plates reveal, locked entries decrypt | generated plates (8 story; Comms/Graffiti/Discoveries pending codex imagen 09-29) | **APPROVED 8.1** (archive-r4) |
| Mission Log (`mission-log`) | Tracing-beam timeline | Trace the beam **and it drives a route band** that previews the traced contract's route and clock | — | **APPROVED 8.0** (archive-r4) |
| Research (`tech-tree*`) | Constellation | Pan the sky with a lens; **the unlock ignites**: light runs the Hand into the star, sweeps down each new link, lights the next stars | generated stars per branch | **APPROVED 8.0** (con-r5) |
| Achievements (`achievements`) | Ring grid of medal gauges | **Turn the orrery**: medals on four orbits round a hero gauge; a category turns its ring under the Hand | generated medal set | **APPROVED 8.1** (con-r5) |
| Credits (`credits`) | Scroll reveal over the drift field | Scroll-driven reveal | — | **APPROVED 8.2** (setcr-r3) |
| Help (`help`) | The controls rig | **Press anything** + drag the price ring + pin to compare | controller + ship silhouette art | **APPROVED 8.0** (help-r4); r9 follow-ups landed (2ef883624) |
| Chart (`chart*`, `localmap`, `starmap`) | The galaxy as an orrery | **Lay the line**: drag from your ship; the planner's route previews as the one amber line; release locks the course | 24 sector tokens rendered in Blender (`assets/ui/deckplate/tools/render_sector_tokens.py` → `assets/ui/generated/chart/<sector id>.webp`) | **APPROVED 8.1** (chart-r4); r5 polish landed (849a0a0dd) |
| Station shell | Tab rail + berth | The needle rides the ruled rail to the tab; UNDOCK the shared verb | — | **APPROVED 8.0** (station3-r1, zero margin); rail .30 + UNDOCK/MUNITIONS fixes owed |
| Market (`station-market`) | Price dial | Turn the quantity dial; the spin drives the counter, hold arc and price-impact ghost | — | **APPROVED 8.0** (market-r1) |
| Missions (`station-contracts`) | Route orrery + tether | Hold-to-charge the route: light runs key → station → berth with the hold, retracts on early release | — | **APPROVED 8.2** (missions-r16) |
| Shipworks (`station-shipworks`) | The jig / the sale disc | Turn the hull on the disc (For Sale); **Exploded Schematic** (Fleet) | posters, Pelican hero grade (D72) | **APPROVED 8.1** (sw-r16); r17 landed (2334d326d), not re-scored |
| Industry (`station-industry`) | Chain beam | Hold FABRICATE: the bezel IS the hold ring, pulses leave the inputs, stocks drain, the product lights | filled pictograms (`industryGlyphs.js`) | **APPROVED 8.5** (industry-r16) |
| Factions (`station-factions`) | Crest orbit | Turn the orbit to a crest; its relation chords draw | crests (exist) | **APPROVED 8.1** (factions-rs1) |
| Bar (`station-bar`) | The conversation | Replies as a dial on the voice arc: focus previews the reply's envelope against her voice | portraits (exist) | **APPROVED 8.4** (bar-r17) |
| Ledger (`station-ledger`) | The tape | Scrub the tape; stems rise, the purse sweeps | — | **APPROVED 8.1** (station3-r1) |
| Crucible door/draft/refit/results | door scales, draft ladder + fit preview, refit slot jig, kill-orrery results | arena Orbit Carousel, fit-preview leader beam, exploded hardpoint schematic, death diagram + run timeline | arena art (exist) | door **APPROVED 8.2** / draft **APPROVED 8.1** / refit **APPROVED 8.3** (crucible-r2) / results **APPROVED 8.3** (crucible-rs1) — suite fully approved |
| THE SHIP (`ship`) | Fleet jig in flight | Pick a slot on the hull, preview compatible hardware | posters | 6.8 NOT PASSED (shiprange-r1): S1/S2/S3/S6/S7 closed but hull missing at 1280 + no selection state — r2 owed (SH1-SH7), builder running |
| Footprint (`footprint`) | Heat / wanted | A heat dial that cools in real time; each source a sector of the dial | — | **APPROVED 8.2** (footprint-r2) |
| Range (`range`) | Handling course | Fly the rehearsal: the course draws as a beam, progress rides the gates | — | 7.6 NOT PASSED (shiprange-r1): R1-R7 closed, (a)+(b) pass — polish owed (foot instrument, blooms, numerals RG1-RG4), r2 builder running |
| Automation (`automation`) | The operation | Conduct the machine: asset-flow strip pulses income into the purse | drone/outpost tokens | **APPROVED 8.0** (automation-r2, on the line); carry-over: flow-link bodies to ~3.1:1, rail follows conducted ring, research-verb contrast margin, tab focus light segment, purse roll |
| Replay / Clips (`replay`, `clips`) | The tape / the reel | Ride the tape (scrub time); pull a moment open (trim windows) | — | Replay **APPROVED 8.1** / Clips **APPROVED 8.0** (replayclips-r1); carry-over: dormant band to 3.5:1, world exposure, ghost sub to 16px (12 effective), ghost glyph bloom; populated stills when bench can stage |
| Asteroid Works / Drill / Base | Machine sites | (per `asteroid-works-rebuild` design) | exist | wave 3 |
| Flight HUD (`orrery-flight`, `flight`), Power rail, Radials | Cluster, rail, radial | (passed Phase 0a) | — | weight pass must NOT regress frame time; audit |
| Sandbox (`sandbox`) | dev harness | — | — | last (dev-only) |

## 5. Order of work

1. **Wave 1 (done 2026-09-28):** all meta screens approved — Settings 8.1, Credits 8.2, Save/Load 8.1,
   Game Over 8.2, Codex 8.1, Mission Log 8.0, Research 8.0, Achievements 8.1 — plus New Game 8.2,
   Shipworks 8.1, Footprint 8.2, Chart 8.1, Help 8.0, shell 8.0, Ledger 8.1 — and the station gates:
   Missions 8.2, Industry 8.5, Bar 8.4, Factions 8.1, Market 8.0 (the station is fully approved).
2. **Weight system (§2)** in the library, swept across the station (commits 73b5a87aa…138988b43);
   Market never got the sweep — its structural rebuild is the largest job left.
3. **Station gates (done 2026-09-28).** Remaining: Title/Pause re-scores, Crucible re-audit.
4. **Wave 2:** THE SHIP, Range, Automation, Replay/Clips.
5. **Wave 3:** Asteroid Works, Drill, Base, Loading audit, flight HUD weight (perf-gated), Sandbox last.
6. Approval ledger: every surface's final report and score recorded in §4 here and in the handoff.
