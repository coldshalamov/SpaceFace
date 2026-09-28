# SpaceFace frontend — handoff prompt for the next agent (2026-09-28)

> Paste everything below the line into a fresh agent session in `C:\Users\93rob\Documents\GitHub\SpaceFace`.
> It carries the design taste, the process, the exact state of every screen and the remaining plan of the
> ORRERY frontend overhaul, so the next agent can finish the job as if the same hand had kept going.

---

You are taking over the **ORRERY frontend overhaul** of SpaceFace, a Three.js top-down space game (fly, mine,
trade, fight, upgrade). The owner handed this lane one job: *bring a modern, professional 2026 frontend to the
whole game — every screen and menu meticulously designed, each one a distinct mini-app with its own creative
interaction, advanced "Magic UI"-grade motion and features, custom/produced art, and nothing generic, nothing
that reads as a thin wireframe.* Keep working until every surface is covered and **approved**. You own this
lane; the frontend is claimed for you (see §9). The owner does not read code: report in plain words, lead with
done / not done, never ask them to adjudicate technical choices.

Read, in this order, then stop reading and work:
1. `design/frontend/ORRERY.md` — the design law (the only frontend authority, with the plan below).
2. `design/frontend/OVERHAUL_PLAN_2026-09-25.md` — the approval bar, the weight system, the per-surface
   mini-app + signature table.
3. `design/frontend/ORRERY_HANDOFF.md` §2 (status board) and §5 (traps).
4. `design/frontend/review/BUILDER_BRIEF.md` and `design/frontend/review/CRITIC_BRIEF.md` — the briefs every
   builder and critic in this lane was given. Latest critic report per screen: `design/frontend/review/reports/`.
5. `AGENTS.md` (repo rules) and `docs/UI_VISUAL_ITERATION.md`.

Everything under `design/frontend/direction/**`, `design/FRONTEND_DIRECTION.md`, the Field Hardware program,
the old §11/§18/§20 build-map sections and packets PQ-162…PQ-194 is **SUPERSEDED history** — every one of those
files now carries a banner saying so. Never execute them, never "finish" them, never let their wording steer
you. Earlier frontend passes built from those instructions and the owner judged the result cheap and generic.

## 1. The taste — what "good" means here (internalize this; it is the whole job)

**The concept: an instrument of light.** Every 2D surface is a ship's instrument — an orrery of light over
deep glass: rings, arcs, scales, leader lines, beads, one moving hand. Not a web page, not a card grid, not a
HUD skin. The live game picture stays the bright thing; the instrument sits on it.

**The palette law (ORRERY §1–§4):**
- **Bone rest light** `rgb(236 230 216)` for structure and words.
- **One amber Hand** (`--dp-hand` #f2b950, hot #ffd98c) per screen — the arm/needle/blade that points at
  the player's current choice — **plus one amber Lamp Key** (the single commit verb: LAUNCH, BUY, LOAD,
  UNLOCK, ENGAGE ROUTE, TRACK…). Nothing else amber. Ever. Count amber marks in every still.
- **Ice / phosphor** `rgb(223 238 255)` only for readings and motion (pulses, live values, "cooled").
- **Red only for threat** (wanted, hostile, urgent clock, loss). If red appears on most things it stops
  meaning danger — keep it rare.
- Contrast floor 4.5:1 on the real composited pixels; smallest text 12 px (a check enforces it).
- Reduced motion (`html.sf-reduce-motion`) keeps every piece of information, drops the travel.

**The owner's two criteria — both required for approval, on top of the score:**
- **(a) Weight, not wire.** Nothing may read as a thin wireframe or a generic web element. *Measured bar:*
  a band counts as body only at **≥ 2:1 against the glass** (about luma 70 on glass ~8–10 at rest; ~100
  hover; ~130 active). The library default `.orr-band` (7 px at alpha .085) measures 1.16:1 — invisible —
  so set `--orr-band-a` / `--orr-w-band` per instrument (bone ~.26–.30 alpha) and **measure it on the
  pixels** (sharp `.raw()`). A ring whose only visible part is its 1.5 px core fails. Grip rings are best an
  inward **annulus** (12–16 px at 1920) with ticks cut through it and labels riding inside.
  Generic parts that fail (a) on sight: pill chips; tab grids of boxes; icon-in-a-box lists; boxed buttons
  (except the one Lamp Key's cut shape); underlines as focus or decoration (focus = a short **vertical light
  segment**); round-thumb range sliders (use a scale: square band, lit fill ending in a 2 px head, ticks);
  corner-bracket "viewfinder" frames; chevron fold-out rows; bordered key-cap boxes; bulleted lists;
  dark rectangular "label plates" (cut lines round words with a text-shaped, feathered mask instead);
  developer copy in the UI; stock pictogram icons (make produced art or drawn emblems).
- **(b) One signature interaction per screen.** Each screen is a mini-app with ONE interaction the player
  does nowhere else, alive with motion, reduced-motion safe, keyboard **and** gamepad reachable. It must
  **drive the hero object** — a gesture that lights a line but changes nothing else fails (b); a scrub
  control far from the thing it drives fails (b).

**Produced art over CSS.** No CSS imitating materials (no bevels, brushed steel, screws, LEDs, glassmorphism
cards). Objects on screen are produced renders or drawn emblems: hull posters (`assets/ui/renders/hulls/`),
sector tokens (`assets/ui/generated/chart/`), codex plates, medals, crests, station art. Codex (the CLI) can
generate transparent PNG art with its image tool — `codex exec -m gpt-5.5 -c model_reasoning_effort=low
--skip-git-repo-check -s workspace-write "<prompt>" < /dev/null`, run as its own background Bash call — it was
usage-locked until **2026-09-29**, which is why the sector tokens were made in Blender (§7). When art is weak
(e.g. the Pelican hull, ledger D72), fix the art; never shrink or hide it to pass a review.

**Composition instincts that the critics rewarded:**
- One hero instrument per screen, big, doing real work; reading column beside it; words hang off one spine
  with ticks (the "ladder"); the chosen row is a bead + arm; everything else quiet.
- Numbers are large thin numerals (Archivo, weight ~250) with small label-voice units; labels are Archivo
  caps with tracking; body is Instrument Sans.
- Every label sits against its own mark (≥ 20 px nearer its own mark than any other) or hangs on a leader;
  a name that cannot rest cleanly shows on hover — never drift, never sit between two objects.
- Empty fields are either deliberate negative space or filled with meaning (destination art as a stage floor,
  a record folded into the instrument) — never a hole.
- 1280×720, 1366×768, 1920×1080 and 2560×1440 all hold (the station shell zooms 1.25 at 1440 — see traps).
- Motion: arrivals staggered, counters roll, labels decrypt, beams draw with settle, springs with mass. One
  memorable beat per screen beats ten ornaments.

## 2. The process that converged (use it exactly)

**Builder + persistent critic per surface.**
- A **builder** subagent owns one surface (its files only), gets `BUILDER_BRIEF.md` + the surface's brief,
  builds, shoots stills at 1920/1280/2560 (+1366 for dense screens) plus the signature's mid-state, opens
  every picture itself, measures bands and contrast on pixels, walks every control (keyboard + gamepad),
  runs the tests that import its files, and commits **by exact pathspec**.
- A **critic** subagent (fresh eyes, never edits files) scores against `CRITIC_BRIEF.md`: 0–10 overall and
  six axes (composition, hierarchy, legibility, ORRERY fidelity, craft/detail, interaction clarity),
  PASS/FAIL on (a) and (b), amber count per still, blockers in order, and **the ONE structural change to land
  first**. **Pass = ≥ 8.0 overall, no axis < 7, (a) and (b) both PASS.**
- **Keep the same critic alive for a surface** (resume it by its agentId with SendMessage) — fresh critics
  re-rank from zero and the loop never converges. Land the critic's ONE structural change first, then the
  blockers in order, then craft. Resend with an exact claims list and still paths.
- **Review every builder's stills yourself before sending them to a critic** (owner rule: never relay a
  lane report as done). Read the diff when anything looks off.
- **Run at most ~4 agents at once.** More than that repeatedly hit the account's session limit and killed
  every agent mid-edit. When agents die: check `git status`, `node --check` their dirty files, `git add -N`
  new files, then resume each by its raw agentId with "continue where you stopped (…)".

**Shooting and measuring.**
- Shooter: `node tools/ui-review/ui-bench-eval-long.mjs <screen-id> "<async js expr>" <out.png> "[pre-js]"`
  with env `VW`/`VH` (viewport), `RM=1` (reduced motion), `SPACEFACE_PLAYER_STORE_DIR=''` for station screens.
  Screen ids: `node scripts/ui-bench.mjs --list` (title, pause, new-game, settings, save-load, game-over,
  codex, mission-log, credits, achievements, tech-tree, help, footprint, ship, range, chart, chart-galaxy,
  station-*, crucible*, asteroid-works, drill, base, automation, replay, clips, sandbox…).
- Put shots under `.devshots/ui-review/`. To LOOK at a picture, copy it to a new filename first (the image
  reader caches by path) and open it with the Read tool. Crop and measure with sharp
  (`tools/ui-review/crop.cjs`; `require(process.cwd()+'/node_modules/sharp')`).
- The bench can only software-render: live 3D models draw a few frames a second, so a "missing" hull in a
  still may just not have drawn yet — wait longer before calling it a bug.

## 3. Status of every surface (2026-09-28)

**APPROVED (≥ 8.0, both owner criteria) — 13** (the 11 below + Chart + Help, listed after the table):

| Surface | Score | Signature | Open polish (non-blocking) |
|---|---|---|---|
| New Game | 8.2 | **Spin the yard** — drag the hull turntable; each hull's mass sets its swing; stat arcs sweep between hulls; LAUNCH lights the run's beads | form column empty band; Pelican art (D72) |
| Shipworks | 8.1 | **Turn the hull on a bezel you grip** (mass-weighted spring, detents, 3 views) + Fleet's **Exploded Schematic** | r17 landed (2334d326d: port/starboard views, every hull centred, un-filled view tag, module glyph, turn cost ~10x lower); not re-scored since the pass; Pelican art (D72) |
| Settings | 8.1 | **The beam lands on what the setting drives** (mixer ring, HUD part, key dial) | 1280 mini-HUD small; gamepad paragraph |
| Credits | 8.2 | **Scrolling turns the orrery** — sections are planets under a fixed Hand | 1280 planet numbers on the lit orbit |
| Save/Load | 8.1 | **Scrub the filmstrip** of berths; the hull lands on the big berth | — |
| Game Over | 8.2 | **The last sortie as a black box you drag through**; the career ring answers | — |
| Codex | 8.1 | **Turn the plate's ring** — every entry an arc, the Hand a blade | scroll marker crosses the text edge at 1280/1366; Ledger rows need a spine |
| Mission Log | 8.0 | **Trace the beam** — a two-lane band compares the traced contract with the chosen one | trace floor art 15% → ~22–25%; abandon as a hold ring |
| Research | 8.0 | **The unlock ignites** — light runs the Hand into the star, sweeps wake the next stars | Fire Control label at 1920; name open stars at 1280 with a tick; branch-completion flash |
| Achievements | 8.1 | **Turn the orrery** — four nested orbits, each turned by its category, under a fixed Hand | the struck-medal flight |
| Footprint (F3) | 8.2 | **Trace a source** on the Heat Dial + **drag the heat needle to scrub time** (tier drops ahead) | hide the hint on empty; proof pips instead of bullets; hub band to L70+ |

**Also APPROVED since the table was written:**
- **Chart / galaxy map** — **APPROVED 8.1** (round 4, 07d6a3d05): square-root SYSTEM dial, one anchored
  label placer (`chartLabels.js`), 24 Blender sector tokens, **Lay the line** (drag from your ship; the amber
  beam previews the game's own route; release locks it in and the ship rides the line). Polish: the 1280 scale
  note clips ("NOT LINEAF"), a 1280 leader dot touches GOAL, the long "Vesta Forge" leader in the all-sectors
  view, the foot strip still teaches only double-click; next structural step (optional): orbital tracks + a
  lens under the cursor. Report: `review/reports/chart-r4-critic.txt`.
- **Help** — **APPROVED 8.0** (round 4, 347d587d5 + 2ef883624). Signature: **Press anything** on the Controls
  Rig (the hull's plan view, every verb on a leader to the part it drives; a key/mouse/pad press lights the verb,
  runs a beam and the part reacts; pad input swaps to pad glyphs; never fires game actions). Tabs: Loops ring,
  Ships comparison dial (pin a hull with C), Commodities price ring, Ores scale, Factions orbit (lowest, 7.4 —
  add "hold a crest, pulses run to allies/rivals"). Polish: the key glyphs sit on short underline bars (close to
  the banned underline — make them the cut key shape or drop the bar); the livery orange on hull renders competes
  with the one amber; the Mule render is flat; six hull models render blank in Blender. Report:
  `review/reports/help-r4-critic.txt`.

**PASSED ONLY THE OLD LETTER — must be re-scored under the owner criteria (a)/(b):**
- Station tabs (weight sweep landed, all bands measured ≥ 2:1 — commits 73b5a87aa…138988b43): Market,
  Missions (hold ACCEPT → the tether pulse), Factions (turn the crest orbit, chords draw), Industry (hold
  FABRICATE, the chain beam runs), Bar (the voice arc speaks each line), Ledger (scrub the tape), and the
  station shell. Their critics were started and cut off by the usage limit; last reports in
  `review/reports/{missions-r13,industry-r14,bar-r13,factions-r10,ledger-r9}-critic.txt`.
- Title / main menu (8.1) and Pause (8.0) — arc-rail dial; `frontdoor-r6-critic.txt`.
- Crucible door / draft / refit / results (8/10 letter, 2026-09-23) — re-audit with weight.

**NOT STARTED (the plan's wave 2/3 — each needs a builder + critic; mini-app + signature from the plan §4):**
- **THE SHIP (F2)** — the flight host of the Shipworks stage: *Explode the jig* (sockets pull out along their
  leaders). Reuse Shipworks' bezel/jig library.
- **Range** — *Draw your line through the gates*; the hull's turn radius previews on the line.
- **Automation** — drones orbit the field on the instrument; income beams flow to the purse.
- **Replay / Clips** — filmstrip + timeline; key moments are beads you scrub.
- **Asteroid Works / Drill / Base UI** (the world-art units PQ-130/131 belong to their own campaign).
- **Loading / boot** — the emblem spinning up; real load stages as ticks round the ring; no developer copy.
- **Comms / radials / confirm dialogs / toasts** — audit each with the same eye (a hold ring instead of
  confirm modals where a test allows; the trade toast overprinted UNDOCK at 1280 once).
- **Flight HUD** weight pass — **performance-gated** (never regress frame time; measure with
  `node scripts/probe-frame-solid.mjs`); claim the §22.9 HUD rows G1/G3/G5/G7/G8/G12/G13/G14.
- **Sandbox** — last (dev-only).

**Asset jobs:**
- **Ledger D72:** the Pelican starter hull's model and posters are blockout (grey/orange boxes) — visible at
  hero size on New Game, Shipworks, Save/Load. Build a produced Pelican with Forge (`tools/blender/forge/FORGE.md`,
  skill `forge-graphics`), then re-render its posters with `tools/art/render_hull_posters.mjs`.
- From **2026-09-29**, codex imagen returns: generate produced plates for Codex Comms / Graffiti / Discoveries
  (today they reuse station art and stills) and consider codex versions of the weakest sector tokens.

## 4. Library and files (compose — screens never hand-roll boxes)

`src/ui/orrery/` is the ORRERY library: `tokens.js` (weight primitives `.orr-band .orr-edge .orr-lit
.orr-lit-bloom .orr-bead .orr-tick`), `arcRail.js` (title/pause dial), `hullRing.js`, `yardCarousel.js`,
`stopDial.js`, `routeOrrery.js`, `crestOrbit.js`, `ledgerTape.js`, `chainBeam.js`, `waveform.js`,
`lampKey.js`, `saveFilmstrip.js`, `saveBerth.js`, `saveSortieTape.js`, `archiveInstruments.js`,
`constellation*.js`, `footprintDial.js`, `chart*.js`, `help*.js`, and per-screen composition sheets
(`screenLayouts.js`, `stationTabsLayouts.js`, `stationLayouts.js`, `settingsLayouts.js`, `saveLayouts.js`,
`archiveLayouts.js`, `footprintLayouts.js`, `chartLayouts.js`, `shipworksLayouts.js`…). Screens live in
`src/ui/screens/` and `src/ui/station/screens/`; the chart is `src/ui/galaxyMap.js` (9.6k-line canvas — work in
its presentation layer only; never build a second route model).

## 5. Tools you inherit

- **Sector tokens (Blender):** `assets/ui/deckplate/tools/render_sector_tokens.py` renders all 24 sectors
  (archetypes: belt, hub+moon, gate junction, forge, volcanic, icy dwarf, nebula, anomaly) under one light
  (warm key from screen-left with a terminator, cool rim from behind), **two passes** (transparent film +
  over black), then `node assets/ui/deckplate/tools/finish_sector_tokens.mjs <dir> assets/ui/generated/chart
  <sheet.png>` merges (alpha = max(coverage, brightness)) → 256 px webp named by sector id.
  Blender: `"/c/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b --factory-startup -P <script> -- args`.
- **Backdrops:** `assets/ui/deckplate/tools/render_title_backdrop.py` (+ `bare` for New Game) and
  `finish_title_backdrop.py`.

## 6. Traps that each cost a round (read before touching code)

- **Glow on transparent film → grey:** a near-transparent emissive saved to straight-alpha PNG clips to
  white/grey (use the two-pass merge). AgX also rolls bright saturated colour to white — keep emissive
  crystal glow ≤ ~1–2; clear-glass shards render as white sticks.
- **1440p shell zoom:** the station shell is `zoom:1.25` at 2560×1440, so `getBoundingClientRect` returns zoomed
  px while style lengths / SVG viewBoxes from `clientWidth` are css px. Divide rect offsets by
  `rect.width / el.offsetWidth` before mixing (fixed in Missions tether and Bar voice arc).
- **Deckplate stacking:** `.dp-frame__head` and `.dp-frame__body` are sibling stacking contexts at z 1 — lift
  the head to z 2, not the title.
- **Replaced elements:** a canvas/img needs explicit width and height; `inset:0` alone leaves 300×150.
- **Layout settles after mount:** an element positioned from a measured box must re-measure (a
  ResizeObserver does not see a *move*; watch the anchor's rect for ~2 s or re-layout after fonts load).
- **`!important` beats animations:** a rest style set `!important` cannot be animated — set the lit state
  `!important` under a class and *transition* it.
- **Label plates:** knocking lines out behind words with rectangles reads as boxes — use a text-shaped,
  dilated, feathered mask.
- **CRLF files** (e.g. `src/ui/screens/stageHull.js`): patch with `\r\n`-aware scripts; count bytes before
  commit. Shell heredocs can mangle backslashes — write patch scripts with the Write tool.
- **Headless test DOM stubs** lack `Element.after` etc. — guard with a `parentNode.insertBefore` fallback.
- **Bench is not the game:** the bench loads its own shell; verify a surprising layering bug in the real route
  before "fixing" it.

## 7. Repo rules you must keep

- Commit **by exact pathspec**: `git add -- <paths>` then `git commit -m "…" -- <paths>`, then read
  `git show --stat HEAD` (a file you never touched in that list is a revert — restore it). Never `git add -A`,
  `commit -a`, stash, reset, checkout or clean; never delete `.git/index.lock`. `git add -N` new files at once.
- Other lanes edit the same tree: `git diff -- <file>` before editing, keep every foreign hunk, commit only
  yours. Collisions are repaired by content, never by reverting someone.
- Never edit `test/*.expected.json` to pass. A test that fails because another lane *deliberately* changed
  behaviour (prove it from the commit) may have its expectation updated with a comment citing that commit.
- Total-fix mode: small defects you see — fix now; medium — a subagent; big/unknown — ONE row in
  `design/program/DEMO_READINESS_2026-09-20.md` §6. No 45-minute-plus runs.
- End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (or your own model's line).

## 8. How to finish

1. Land the Chart and Help polish (small; their critics already passed them).
2. Land the Shipworks r17 polish; re-score the station tabs, Title, Pause and Crucible under (a)/(b) and fix
   what fails (keep ≤ 4 agents at once).
3. Build wave 2/3 surfaces in the plan's order: THE SHIP, Range, Automation, Replay/Clips, Loading, Comms/radials
   /dialogs/toasts, Asteroid Works/Drill/Base UI, then the perf-gated flight HUD, then Sandbox.
4. Asset jobs: the Pelican (D72); codex plates from 2026-09-29.
5. Keep the records true as you go: `OVERHAUL_PLAN_2026-09-25.md` §4 (per-surface status),
   `ORRERY_HANDOFF.md` §2, and a memory note if you learn something non-obvious.
6. When every surface in the plan's §4 table is APPROVED: release the claims (§9) and tell the owner, in plain
   words, that the frontend is done.

## 9. The claim (why no other agent should collide with you)

On 2026-09-26 the owner had the frontend marked as in progress: `design/program/roadmap/program-queue.json`
packets PQ-162/168/180–185/187/188/192/194 and their open units are `claimed` (owner `orrery-frontend-overhaul`);
each packet, `build_map.md` §1.1/§11/§18/§20/§22.5 C1–C4/§22.9 HUD rows/§25 Phase 4/§27 THE INSTRUMENT,
`FINISH_LANES.md` lane 7, `AGENTS.md` and `CLAUDE.md` carry CLAIMED notes; 74 old frontend docs carry
SUPERSEDED banners. On 2026-09-27 the owner nuanced it in `AGENTS.md`: other agents may make *minimal,
task-needed* edits in `src/ui/**` / `styles/**` and land them — read their diffs when you return and work them
in; the lane still owns the *redesign*. Release the claims (queue states back to done/integrated with receipts,
banners removed) only when the lane closes.
