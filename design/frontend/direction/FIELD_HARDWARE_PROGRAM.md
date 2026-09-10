<!-- LIFETIME: DURABLE -->
# Field Hardware — the UI production program

**Status:** ADMITTED 2026-09-10. This file, the art direction in
[`packets/_COMMON/02_ART_DIRECTION.md`](./packets/_COMMON/02_ART_DIRECTION.md), and the rendered
frames under [`approved/`](./approved/) are the authority for every player-facing screen and the
HUD. **Frames outrank this prose; this prose outranks every other frontend document.** Queue:
`PQ-194`. Map: `build_map.md` §20.15.

**Owner directive, 2026-09-10, in the owner's words:** *"The frontend style is a bit generic and
simple for an A-list spaceship game … we've taken about 10 shots at this and it's equally bad each
time … agents will choose this sort of simple generic HTML/CSS UI because that's what they think
they can do in one session, and I'll complain, they'll wipe it and make another generic UI … all
the while they leave these instructions and docs and 'rules' docs in the repo saying 'this is the
style we use for UI' which is just poisoning the frontend development … I need a really creative
advanced A-list idea … plan out the development … try not to one-shot it … make packets of files
and instructions in a zip for different steps."*

---

## 1. Why ten passes converged on the same cheap screen

Not taste and not talent: **process**. Every pass was a coding agent styling text containers in
CSS inside one session, judged against a prose document written by the previous agent. The
mechanism had four parts, and each is reversed by this program:

| The failure | What it produced | The reversal |
|---|---|---|
| **No picture before code.** The target was words ("cinematic", "minimal", "no boxes"). | Words on black; agents interpreted the prose in the only way one session can execute: text and hairlines. | **Style frames first.** A rendered picture of each screen, made by an image-capable model from a self-contained brief, is approved before any code. Code is judged by comparison to the frame. |
| **No produced assets.** The UI had twelve image files, most in a dead refit. Everything else was CSS. | Every "material" was a border; every icon a line glyph; every list a column of words. | **Asset-first.** Plates, windows, controls, instruments, an icon family, marks, keyart tiles, 3D sets and hull renders are produced by the tools that can make them (image generation, SVG, Blender) and the code assembles them. A screen with no produced assets in it is not done. |
| **Prose as authority.** Each direction sheet's never-list banned the tools of the trade (gradients, glow, plates, icons in menus, chamfers) and its "minimal" licensed emptiness. | Agents read the complaint, checked the sheet, and concluded the complaint must be about something else. | **Frames as authority.** The prior sheets are void on aesthetics (§8). The two tests in the art direction (does it have the material and light truth of Asteroid Works; does it read as equipment a worker uses) replace the never-list. The floors that are not aesthetic (§7) are named so nobody "cleans them up" with the skin. |
| **One-shot per screen.** A screen was rebuilt in one packet, end to end, by one agent. | The agent chose what one session could finish. | **A multi-session series** of 28 right-sized packets (§4) across four lanes — frames, image assets, vector and 3D assets, code — each returning one durable artifact, each reviewed before the next depends on it. |

One more finding changed the engineering: **no screen in the game has a lit world behind it, by
explicit design** — any open screen freezes rendering, and the only 3D under a menu is a second
WebGL context that is refused outright on Intel GPUs. The committed title reference frame is pure
black. So "the world is the interface" never had the machinery to be true. Leaf zero of this program
builds it (P20).

## 2. The direction in one paragraph

**Field Hardware.** SpaceFace's interface is the manufactured, backlit, hand-worn equipment of a
working pilot, laid over a living world. Every screen is a lit shot of that world — the hull in its
rig, the berth, the arena, the sky — with instruments built from real materials sitting on it:
machined gunmetal plates with thickness and edge light, amber backlit legends, safety markings,
smoked-glass windows that look through to the scene. Type is big and confident, like stencilled
hull markings and film titles. Icons are one filled family. Numbers are instruments. Warm,
physical, modern — Hardspace: Shipbreaker's tactility, Control's editorial scale, Armored Core VI's
machined precision — and never a cockpit, never a hologram, never a web page. Three composition
registers keep screens from sharing a silhouette: **POSTER** (cinematic full-bleed moments),
**BENCH** (workbench instruments with live windows), **EDGE** (small instruments at the frame edges
in flight). The full direction, its two tests, materials, type, colour, temperature, motion and
sound: `packets/_COMMON/02_ART_DIRECTION.md`.

**Bones and skin, reconciled.** On 2026-09-06 the owner asked not to gut everything; on 2026-09-10
the owner said ten passes were equally bad. Both hold: the *bones* survive (screen manager and
screen memory, the three-anchor HUD and the Power Rail's slot contract, the station OS and its six
instruments, the instruments' verbs, the data wiring, entity links, the accessibility and
performance floors) and the *skin* is replaced entirely from produced assets. Nothing of the current
look is a reference for the new one.

## 3. The method — how a screen gets made

```
brief (packet zip) ──► STYLE FRAME (rendered picture, GPT-6 Pro) ──► controller picks ──► approved/
                                                                                              │
     ┌────────────────────────────────────────────────────────────────────────────────────────┘
     ▼
ASSETS from the frame:  IMG (transparent PNG kits)  ·  SVG (icons, marks)  ·  3D (sets, hull renders)
     │
     ▼
CODE assembles assets to match the frame (local agent, isolated checkout)
     │
     ▼
CAPTURE with the world (--world) ──► side-by-side with the frame ──► memoryless vision review
     │                                                                        │
     └── iterate until it passes ◄────────────────────────────────────────────┘
     ▼
controller accepts ──► the owner looks at the game (veto) ──► next packet
```

Rules that make it hold:

1. **No screen is coded before its frame is approved.** A frame is a 1920×1080 picture using the
   game's exact strings, delivered with a plate (the scene alone) and `kit-notes.md` (faces, hexes,
   thicknesses). It is made by an image-capable model that has never seen the current screens as
   a look reference.
2. **The controller picks; the owner vetoes in the game.** The owner is never asked to choose
   between options (standing ruling). Frame packets return variants so the controller can choose;
   the owner sees the chosen frame built and running.
3. **Acceptance is a picture comparison.** The live capture, with the world, beside the approved
   frame, judged by a reviewer that sees only those two images, the art direction's two tests and
   its anti-pattern guard. "Matches the sheet's words" is no longer a criterion.
4. **Asset coverage is a hard done-when.** Each code packet names the assets it consumes; a screen
   built from CSS borders, gradients and shadows instead of the produced assets is rejected by
   grep before it is rejected by eye.
5. **Every packet quotes the way it gets faked.** Evidence from this repository's delegation
   history: a worker is honest when the packet names the specific fake, and pads when it does not.
6. **Right-sized.** One packet = one conversation or one local lane in the shared checkout = one durable return
   (a zip or a branch), reviewed before anything depends on it. One correction turn; then the
   controller repairs or re-packets.

## 4. The packet series

All packets live under [`packets/`](./packets/); each folder's `PACKET.md` is the brief, and
`_COMMON/` (read-me, game dossier, art direction, conventions) is included in every zip. Build a
zip with `node scripts/build-ui-packet.mjs P01`; it lands in `.devshots/ui-packets/`.

| # | Packet | Lane · tool | Returns | Depends on |
|---|---|---|---|---|
| **P01** | Style frames: Title (3 variants) + Crucible door | FRAMES · ChatGPT 6 Pro | 4 frames, plates, crops, kit-notes | — |
| P02 | Style frames: flight HUD resting + wanted | FRAMES · ChatGPT 6 Pro | 2 frames, layers, crops | P01 |
| P03 | Style frames: docking arrival, Market, THE SHIP | FRAMES · ChatGPT 6 Pro | 3 frames | P01 |
| P04 | Style frames: chart, Settings, Load | FRAMES · ChatGPT 6 Pro | 3 frames | P01, P03 |
| P05 | Style frames: Crucible results, game over, missions log, codex | FRAMES · ChatGPT 6 Pro | 4 frames | P01, P03 |
| P10 | Surface kit: plates, windows, legends, stripes, wear, grain | IMG · ChatGPT 6 Pro | ~45 alpha PNGs @1x/@2x | P01–P03 |
| P11 | Control kit: keys, toggles, sliders, steppers, inputs, lights, focus ring | IMG · ChatGPT 6 Pro | ~120 state sprites | P10 |
| P12 | Instrument kit: gauges, bars, radar face, sockets, badges, tapes, reticle | IMG+SVG · ChatGPT 6 Pro | PNG bezels + SVG geometry | P02, P03, P10 |
| P13 | Icon family: 80 glyphs × 3 sizes, sprite, canvas paths | SVG · ChatGPT 6 Pro or Codex | 240 SVGs + sprite + JSON | P01, P02 |
| P14 | Marks: logotype, 14 crests, mode/arena marks, insignia | SVG · ChatGPT 6 Pro | ~40 SVGs | P01 |
| P15 | Keyart: arena/mode/difficulty tiles, backdrop plates | IMG · ChatGPT 6 Pro | 14 tiles + 6 plates | P01, P05 |
| P16 | 3D sets (hangar, berth, arena) + hull render harness | 3D · Codex + Blender (local) | GLBs, .blend, scripts, hull tiles | P01, P03 |
| P17 | Motion library + sound recipes, demo pages | CODE · ChatGPT 6 Pro | motion.js, recipes.json, specs | P01–P03 |
| P20 | The UI stage: lit world behind every screen, one context, plate fallbacks | CODE · local | branch + receipt | P01 |
| P21 | The kit runtime: fonts, tokens, asset loader, asset-built components, motion, sound, lab | CODE · local | branch + receipt | P10–P14, P17 |
| **P22** | **The Title live — the veto point** | CODE · local | branch + side-by-side | P20, P21, P14 |
| P30 | Crucible door/draft/refit/results/lab | CODE · local | branch + receipt | P22, P15, P16 |
| P31 | Flight HUD part one: instruments | CODE · local | branch + receipt | P22, P12 |
| P32 | Flight HUD part two: sensors, law, wanted temperature | CODE · local | branch + receipt | P31 |
| P33 | Station: arrival, shell, Market, Ledger | CODE · local | branch + receipt | P22, P20, P16 |
| P34 | Station: Contracts, Factions, Industry, Bar | CODE · local | branch + receipt | P33, P14 |
| P35 | THE SHIP, Shipworks, Footprint, Range | CODE · local | branch + receipt | P22, P20, P12, P16 |
| P36 | The chart | CODE · local | branch + receipt | P22, P13, P15 |
| P37 | Shell: Load, Settings, Pause, Game over, Credits, Photo | CODE · local | branch + receipt | P22, P11, P16 |
| P38 | Reading screens + Asteroid Works chrome | CODE · local | branch + receipt | P22, P10, P13 |
| P40 | Motion pass, thirteen clips | CODE · local | branch + clips | P30–P38 |
| P41 | Sound pass, the mute default | CODE · local | branch + receipt | P40 |
| P42 | Sweep (dead skin deleted, baselines reshot) + proof (blind tally, reel) | CODE · local | tally + reel | P40, P41 |

**Order and parallelism.** P01 first; P02–P05 after P01's pick (they match its materials);
P10–P17 in parallel once their frames exist; P20 and P16 as soon as P01 is approved (they do not
wait for the kits); P21 when the kits are back; P22 gates every surface; P30–P38 in parallel by
mutex; P40–P42 last. The critical path is **P01 → P10/P11/P14 → P21 → P22**.

**Sizing rule for ChatGPT 6 Pro packets.** One conversation per packet; the zip carries
`_COMMON`, the brief, at most six current captures and the approved frames it must match; the
return is one zip with a manifest; at most four frames or ~120 files per return; one correction
turn. If a return is partial, `NOTES.md` says what is missing and the controller decides whether to
re-packet the remainder or take it locally.

## 5. Tool routing (from this repository's own dispatch evidence)

| Work | Tool | Why | The failure mode the packet must name |
|---|---|---|---|
| Style frames; transparent-PNG kits; keyart; logotype exploration; the motion/sound demo | **ChatGPT 6 Pro** in the browser (image generation + a VM to cut, align, alpha-clean, vectorise, script, zip) | The only tool in the fleet that can render a finished picture and return a durable archive of assets in one turn | Words on black; concept art instead of the game's render; invented strings; a description instead of a file |
| Icon family, marks (alternate) | ChatGPT 6 Pro or **Codex** | Hand-written SVG is code; both write it well; Codex can also run it against the repo's checks | Line icons; inconsistent weights; arrows for everything |
| 3D sets, hull render harness | **Codex with Blender**, locally, under the repo's material-truth preflight | Codex is the fleet's strongest 3D author; the standard needs repo access and exact-source evidence | Primitive boxes named "gantry"; screenshots of the live game as "renders" |
| Code packets (stage, kit runtime, screens) | **Codex gpt-5.6/gpt-6** or **cursor Grok 4.6 xhigh** in the shared checkout, isolated by write set and mutex (no worktrees) | Bounded implementation with named traps is where these land; Grok is honest when the packet quotes the specific fake | CSS-styled components instead of asset-built; a static PNG as "the stage"; restyled text boxes |
| Frame-versus-capture review | **Gemini 3.8 Flash via `agy`** (verified: it truly sees a PNG named in the prompt) or a fresh ChatGPT thread as adversarial reviewer | Memoryless, sees only the two images and the two tests | A reviewer that is told what it should see |
| Integration, acceptance, the pick, the receipts | **The controller (Claude)** | Repo authority, collision awareness, taste | Accepting a description; accepting a headless capture with a black world |
| Local single-image generation when the browser round-trip is too slow | `node .grok/skills/spaceface-blender-material-truth/scripts/request_imagegen_reference.mjs` (Codex's built-in image generation, fail-closed, one PNG) | Exists and is proven; too narrow for kits | — |

The delegation protocol (isolated checkouts, packet on disk, ledger, receipts, the
`implemented → focused_green → route_accepted → integrated` vocabulary) is the repository's
existing one: `docs/AGENT_OPERATIONS.md` and the `delegate-llm-work` skill. This program adds no
status system.

## 6. Acceptance — what "done" means at each level

- **A frame** is approved when the controller has judged it against the two tests and the guard,
  picked among variants, recorded why in `approved/DECISIONS.md`, and committed it under
  `approved/` with its plate and kit-notes.
- **An asset kit** is accepted when every file the packet names exists at the stated sizes and
  states, the manifest validates, the conventions' quality checks are recorded, and the assets
  composited over the approved frame reproduce it.
- **A screen** is accepted when its `--world` capture at 1920 beside its frame passes the vision
  rubric (materials · type · lit dimensional world · reading order · not a web page), its named
  checks are green, its floors hold (§7), the asset-coverage grep passes, keyboard and pad reach
  everything, and the receipt carries the captures and the reviewer's verdict verbatim.
- **The Title (P22)** is additionally the owner's veto point: nothing after it starts until the
  owner has looked and not objected. If the owner objects, the words are recorded verbatim, the
  frame is revised (a new P01 variant round), and P22 is redone.
- **The program** is done when P42's blind tally meets its target (chosen every time against the
  genre baseline, at least half the time against A-list frames) and the sweep leaves one token
  layer and zero injected style nodes.

## 7. Floors that are not aesthetic (keep) versus bans that were (reversed)

**Keep, always** (these are accessibility and performance, enforced by scripts today): the 12 px
type floor including canvas text (`check-type-floor`); WCAG AA contrast (4.5:1 body, 3:1 large and
UI); reduced-motion and flash-reduce honoured, every `pulse/sweep/shimmer` guarded; forced-colours
(inline SVG and `currentColor` survive it, CSS background images do not); keyboard and gamepad
reachability with a visible focus ring; icon-only controls labelled; no idle `requestAnimationFrame`
and no unparked loops (`check-ui-frame-sleep`, `check-ui-effects`); ≤ 2 ms UI frame per open
surface and ≤ 1,500 DOM nodes per surface (`check-ui-budgets`); no `backdrop-filter` in flight;
colour literals as tokens so high-contrast can remap them (`check-colour-tokens`); the simulation
untouched; determinism goldens untouched.

**Reversed** (these were prose in `styles/menu.css` and the direction sheet, never a script): the
bans on gradients (allowed as light), glow (allowed as backlight baked into assets), plates and
frames (required, as manufactured objects), icons in menus (required), tiles and grids of imaged
things (required), chamfers and cut corners (one signature angle allowed), ambient motion (allowed
only on paused screens with reduced motion off), a second display voice (the display face has
width axes; that is one family). The `FRONTEND_DIRECTION.md` §9 rule "an image made elsewhere
proves nothing about the build" is reversed outright: the image made elsewhere is the *target*; the
build proves itself by matching it.

**Engineering facts the packets rely on** (audited 2026-09-10): `assets/ui/**` is already a bundled
root, so new UI assets need no admission work; `styles/kit.css` is the token file but is *not* in
the type-floor or colour-token lint lists (P21 adds it); the infinite-animation lint reads only 16
screen JS files, not stylesheets; `check-ui-budgets` stales on any `src/ui` edit and must be reshot
headed and alone; the visual-regression matrix is a long headed run and is reshot once, at P42; the
HUD's CSS is a 1,346-line template literal plus six injected nodes (P31/P32 move it to
`styles/hud.css`); 36 `src/ui` modules inject their own `<style>` (P42 ends that); the second WebGL
preview context is refused on Intel GPUs (P20 replaces it with a main-context stage and authored
plate fallbacks); the game ships muted by default (P41 raises the question).

## 8. What this supersedes

On aesthetics — type, colour, tone, composition, imagery, motion, sound, what "polished" means —
this program voids: `design/frontend/direction/DIRECTION_SHEET.md` ("Cinematic Minimal", including
its never-list and review checklist), `KIT_SPEC.md`, `tasks/TASK_A–D`, `HANDOFF_PROMPTS.md`,
`design/FRONTEND_DIRECTION.md` §5 and §13, `design/frontend/INSTRUMENT_GRAMMAR.md`'s identity
sections, and the memory that "refined shadcn-like surfaces" are the taste bar. They remain valid
for engineering facts (what exists, which seams are shared, which checks run) and for the measurable
floor. `build_map.md` §20.14's task series is closed; its units are recorded as implemented under
the old direction and are superseded by `PQ-194`. `REFERENCE_BOARD.md` stays as a reading list.

## 9. How the owner uses this

1. Say "build the UI packet P01" (or run `node scripts/build-ui-packet.mjs P01`). Hand the zip in
   `.devshots/ui-packets/` to ChatGPT 6 Pro with the one-line prompt in
   [`packets/README.md`](./packets/README.md). Drop the returned zip back in the same folder.
2. Say "review P01". The controller unpacks it, judges the frames, picks, commits the pick to
   `approved/`, and builds the next packets that depend on it.
3. Repeat. The only moment that needs the owner's eyes is P22: boot the game and look at the title.
   Say what is wrong in plain words, or say nothing.
