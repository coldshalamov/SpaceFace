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

## 3. Magic-UI-grade life (shared, reduced-motion safe)

Number ticker (`rollTo`, exists) · beams that travel along a path (tether pulse, route pulse, chain beam) ·
shimmer across the one Lamp Key · a **spotlight** that follows the pointer under a list or instrument · staggered
arrival (rings draw, words rise) · orbiting bodies (the orreries) · magnification on the station tab rail
(dock) · text decrypt on reveal · a marquee ticker where prices stream (Market). Library owns each; screens
compose them.

## 4. Every surface — its mini-app and its signature

Status as of 2026-09-25 late (scores are ORRERY-letter scores; none is yet approved against §1(a)/(b)).

| Surface (bench id) | Mini-app | Signature interaction (distinct) | Assets | Status |
|---|---|---|---|---|
| Title (`title`) | The emblem orrery behind the name | The Hand follows the pointer round the dial; the rings answer with parallax | — | 8.1 letter; weight pass due |
| Pause (`pause`) | Seven-stop dial over the held world | Rows as stops: the Hand steps row to row, left/right along a row | — | 8.0 letter; weight pass due |
| New Game (`new-game`) | The yard: the hull on a turntable ring | **Spin the yard**: drag the ring; each hull's mass sets its swing (heavy drags, light flicks); the stat arcs sweep between hulls; release settles with overshoot; hold LAUNCH runs light down the run's scale into the jump | new backdrop (done), Pelican poster to hero grade | 7.9; builder |
| Loading (`boot`) | The emblem spinning up | Real load stages as ticks lighting round the ring | — | to audit |
| Settings (`settings`) | Mixer + live HUD preview | Ride a slider and the miniature Cluster/mixer answers live | — | builder (wave 1) |
| Save/Load (`save-load*`) | Filmstrip on a curved rail | Scrub the rail; the chosen save's hull and facts decrypt in | poster hulls | builder (wave 1) |
| Game Over (`game-over`) | The cooled world | The cause decrypts; the career record is an instrument; restore = Lamp Key | — | builder (wave 1) |
| Codex (`codex`) | The archive | Scrub the ladder; plates reveal, locked entries decrypt as you pass | generated plates | builder (wave 1) |
| Mission Log (`mission-log`) | Tracing-beam timeline | Trace the beam; each mission lights along it | — | builder (wave 1) |
| Research (`tech-tree*`) | Constellation | Pan the sky with a lens; unlocking sweeps light down the link | generated stars per branch | builder (wave 1) |
| Achievements (`achievements`) | Ring grid of medal gauges | Turn the medal ring; each medal's arc fills to its progress | generated medal set | builder (wave 1) |
| Credits (`credits`) | Scroll reveal over the drift field | Scroll-driven reveal | — | builder (wave 1) |
| Help (`help`) | The controls rig | **Press anything**: the pressed key/pad button lights its verb on a ship-and-controller instrument (live input echo) | controller + ship silhouette art | wave 2 |
| Chart (`chart*`, `localmap`, `starmap`) | The galaxy as an orrery | Pan/zoom the orrery; a Lens under the pointer; drag a route and watch the amber beam lay itself; the inspector unfolds from the body | generated sector tokens (belt, gas giant, hub, gate, nebula…) — belt proven | wave 2 |
| Station shell | Tab rail + berth | Dock-style magnification on the tab rail | — | 8 letter; weight pass due |
| Market (`station-market`) | Price dial | Turn the quantity dial; the ledger ticker streams prices | — | 8 letter; weight pass due |
| Missions (`station-contracts`) | Route orrery + tether | Hold to accept: the tether pulse runs key → station → berth | — | 8.07 letter; weight pass |
| Shipworks (`station-shipworks`) | The jig / the sale disc | Drag the ring to turn the hull; the For Sale ghost of your own hull | posters, Pelican hero grade | 7.8; builder |
| Industry (`station-industry`) | Chain beam | Hold FABRICATE and the beam runs inputs → ring → output | — | 8.1 letter; weight pass |
| Factions (`station-factions`) | Crest orbit | Turn the orbit to a crest; its relation chords draw | crests (exist) | 8.0 letter; weight pass |
| Bar (`station-bar`) | The conversation | The voice arc speaks each line; replies as a dial | portraits (exist) | 8.1 letter; weight pass |
| Ledger (`station-ledger`) | The tape | Scrub the tape; stems rise, the purse sweeps | — | 8.1 letter; weight pass |
| Crucible door/draft/refit/results | (passed 09-23) | door swing, draft picks, slot jig, death dial | arena art (exist) | 8 letter; audit |
| THE SHIP (`ship`) | Fleet jig in flight | Explode the jig: sockets pull out along their leaders | posters | wave 2 |
| Footprint (`footprint`) | Heat / wanted | A heat dial that cools in real time; each source a sector of the dial | — | wave 2 |
| Range (`range`) | Handling course | Draw your line through the gates; the hull's turn radius previews on the line | — | wave 2 |
| Automation (`automation`) | The operation | Drones orbit the field on the instrument; income beams flow to the purse | drone/outpost tokens | wave 2 |
| Replay / Clips (`replay`, `clips`) | Filmstrip + timeline | Scrub the timeline; key moments are beads | — | wave 2 |
| Asteroid Works / Drill / Base | Machine sites | (per `asteroid-works-rebuild` design) | exist | wave 3 |
| Flight HUD (`orrery-flight`, `flight`), Power rail, Radials | Cluster, rail, radial | (passed Phase 0a) | — | weight pass must NOT regress frame time; audit |
| Sandbox (`sandbox`) | dev harness | — | — | last (dev-only) |

## 5. Order of work

1. **Wave 1 (running):** Settings/Credits, Save/Load/Game Over, Codex/Mission Log, Research/Achievements,
   Shipworks r14 — builders with the owner criteria; persistent critics.
2. **Weight system (§2)** in the library, proven on New Game + Missions + Title, then swept across every
   screen (station tabs, front door, Crucible), each re-shot and re-scored with the owner criteria.
3. **New Game "Spin the yard"** + the difficulty dial (fills the form column).
4. **Wave 2:** Chart (tokens first), Help, THE SHIP, Footprint, Range, Automation, Replay/Clips.
5. **Wave 3:** Asteroid Works, Drill, Base, Loading audit, Crucible re-audit, flight HUD weight (perf-gated).
6. Approval ledger: every surface's final report and score recorded in §4 here and in the handoff.
