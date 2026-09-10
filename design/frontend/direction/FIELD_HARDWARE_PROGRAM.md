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
| **One-shot per screen.** A screen was rebuilt in one packet, end to end, by one agent. | The agent chose what one session could finish. | **Five development sessions** (§4), each a phased sprint that uses image generation, SVG, code and 3D together and returns one runnable artifact, with 28 phase specs beneath them and local engine lanes between them — each reviewed before the next depends on it. |

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
CODE assembles assets to match the frame (prototype in the session; port in the shared checkout)
     │
     ▼
CAPTURE with the world (--world) ──► side-by-side with the frame ──► memoryless vision review
     │                                                                        │
     └── iterate until it passes ◄────────────────────────────────────────────┘
     ▼
controller accepts ──► the owner looks at the game (veto) ──► next packet
```

Rules that make it hold:

1. **No screen is coded in the game before its frame is approved.** Sessions prototype screens
   outside the engine against their own frames — that is how a frame is proven buildable — but
   nothing lands in a game module until the frame is in `approved/`. A frame is a 1920×1080 picture using the
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

## 4. The five sessions (the hand-off unit) and the local lanes

The interface is produced in **five development sessions** with ChatGPT 6 Pro — each a multi-hour
sprint run from a self-contained zip, working phase by phase with a checkpoint zip after every
phase, using image generation, hand-written SVG, code and procedural 3D together, and returning one
coherent, runnable artifact. Between sessions, **local lanes** do what needs the engine. The 28
detailed briefs under [`packets/`](./packets/README.md) are the **phase specs** the sessions bundle;
they are never handed out alone. Full plan, sizing and the courier procedure:
[`sessions/README.md`](./sessions/README.md).

| Session | Returns | Unlocks locally |
|---|---|---|
| **S1 — The design system** | frames for the three hero screens (title ×3 shots, Crucible door, HUD resting + wanted), tokens, the surface/control/instrument kits, the icon family and the marks, motion and sound, **a kit page and the three hero screens as HTML prototypes** built from the produced assets | **L-A the stage** (P20): the main renderer draws a lit hangar behind the title, one GPU context, authored plate fallback |
| **S2 — The bench register** | frames and **prototypes** for docking, every station tab, THE SHIP, the chart, settings, load; keyart tiles and backdrop plates; procedural 3D drafts, Blender scripts and a preview page | **L-B Blender sets** (P16): hangar, berth and arena finished to the asset standard from S2's scripts |
| **S3 — The prototype app** | the remaining frames and screens; **the whole frontend navigable in a browser** with motion, sound, keyboard and gamepad, reduced motion, forced colours; an audit suite; the engine hand-off inventory | — |
| **S4 — The engine port** | the prototype ported into the game's own modules against a pinned commit: the kit runtime, every screen, the HUD sections, the chart shell, a stage draft; full files + patch + port map; the repository's static checks green | **L-C integrate** (P21 → P22 the title live = **the veto point** → P30–P38 surfaces) |
| **S5 — QA and the second pass** | live captures reviewed beside the frames; a punch list with exact fixes; assets v2; motion and sound corrections; the blind-comparison protocol and the reel plan | **L-D sweep and proof** (P40–P42) |

**Order.** S1 → (L-A starts) → S2 → (L-B starts) → S3 → S4 → L-C (the owner looks at the title
here) → S5 → L-D. The critical path is S1 → S2 → S3 → S4 → L-C. S1 is the largest session and
front-loads everything the others consume; S5 waits on L-C.

**Sizing rule.** One session = one conversation with its VM. The brief is a phased plan; image
generation is treated as the scarce resource (few generated masters, many assets derived by
script); every phase ends with an overwritten checkpoint zip and a `PROGRESS.md` entry; the session
never stops to ask. If a session runs out before its last phase, the checkpoint is still coherent
and the remainder becomes the next session's first phase. One follow-up turn may request exactly
the items `NOTES.md` lists as missing; after that the controller takes the rest locally.

**The session's environment.** The ChatGPT 6 Pro VM has internet (web search, fetch, curl, package
managers) and a GitHub connector that reads repository files by path and opens pull requests; it
cannot clone the ~20 GB repository. Session zips therefore carry what a session needs (prior
returns, a font baseline, libraries, a pinned source snapshot for S4/S5), sessions may fetch better
typefaces and libraries themselves under the bundling-licence rule, and S4/S5 return code as a pull
request as well as a zip.

**Phase specs by session.** S1: P01, P02, P10, P11, P12, P13, P14, P17 · S2: P03, P04, P15, P16 ·
S3: P05 · S4: P20, P21, P22, P30–P38 · S5: P40, P41, P42. Local lanes carry the same specs
(L-A = P20, L-B = P16, L-C = P21/P22/P30–P38, L-D = P40–P42) for the engine half of each.
## 5. Tool routing (from this repository's own dispatch evidence)

| Work | Tool | Why | The failure mode the packet must name |
|---|---|---|---|
| The five sessions: style frames, transparent-PNG kits, keyart, icon family and marks, motion/sound, HTML prototypes of every screen, the engine port against a pinned source snapshot, the QA pass | **ChatGPT 6 Pro** in the browser — its **native `image_gen` tool (GPT Image 2.5)** for every image, never an Adobe or other connector (observed defaulting to one; every brief and the hand-off prompt forbid it) — plus a VM to cut, align, alpha-clean, vectorise, script and zip | The only tool in the fleet that can render a finished picture and return a durable archive of assets in one turn | Words on black; concept art instead of the game's render; invented strings; a description instead of a file |
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

1. Say "build session S1" (or run `node scripts/build-ui-packet.mjs S1`). Hand the zip in
   `.devshots/ui-packets/` to ChatGPT 6 Pro with the prompt in [`sessions/README.md`](./sessions/README.md).
   Drop the returned zip into `.devshots/ui-packets/returns/`.
2. Say "review S1". The controller validates the return, opens the prototypes, judges frames and
   assets against the two tests and the guard, picks the title shot, commits what is accepted,
   starts the local lane it unlocks, and builds S2's zip (which carries the accepted S1 return).
3. Repeat for S2, S3 and S4. After S4 the local integration lane lands the port and the title goes
   live: **boot the game and look at it.** Say what is wrong in plain words, or say nothing. S5
   follows the integration captures.
