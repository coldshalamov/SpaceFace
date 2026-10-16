# UI polish review — living doc for the `ui-polish` PR

Branch worktree: `/workspace/spaceface-scratch/ui-polish` · stacked on `master`.


This file tracks the stacked visual polish of every shootable 2D screen (`node scripts/ui-bench.mjs --list`). Seeded from `design/frontend/UNIFICATION_LEDGER.md` where useful; **this REVIEW is the authority for this PR**, not the ledger.

Owner bar: consistent, high-detail, creative, interactive, non-generic. Design authority: Deckplate (`--dp-*` / `.dp-*`) + ORRERY composition (light, scales, ladders, the Hand). Screen placement lives in `deckplate/screens.js` / orrery layouts; no new token root.

## Remaining work — top priority (ui-polish-6)

- **(a) Race board:** oversized, stacked labels at 1280×720 and 960×540. **Fixed** — `raceBoardLayouts.js`: the board's children were auto-placed into the kit `.k-screen` grid's zero-height rows, so 30px `.k-word` selects/buttons spilled over the cards. Now a scrolling document: labelled fit rail, three course cards (amber primary Race, outlined story contracts), paint + recognition two-up. Same sheet fixes the Physics board, which shares `.race-board`. Bench can now mount `raceBoard`. (#329)
- **(b) Adventure combat HUD clicks (agreed with Code Work):** during Adventure combat, while weapons are hot, primary clicks go to the game and HUD buttons must not open menus. Build on #327's approach, which only covers Crucible. **Fixed in #330** — `hudCombatLock.js` makes the HUD row inert for 4s of sim after the player fires or is hit; keyboard blur only on pointer clicks (`ev.detail > 0`).

## Design direction (this PR)

| Axis | Direction |
|---|---|
| **Palette** | Bone / hot bone on void (`--dp-void`); one amber Hand (`--dp-hand` / `--dp-lamp`); ice only for data-in-motion; phos for live readings |
| **Type** | Display title once per screen; label face (Archivo stretch) for instruments; thin numerals for values; read face for prose |
| **Spacing** | Anchored three-column / ladder geometries; instruments dense on purpose; menus breathe; no floating near-misses |
| **Components** | Ladders + Hand, graduated Scales, switch-word pairs on a rail, bind dials, live previews (mixer / Cluster / keys) |
| **Custom elements** | SVG instruments (arcs, ticks, beams with 45° cuts); produced art where an object is shown |
| **OSS assets + licenses** | Existing Deckplate / ORRERY faces and kit textures only this session — no new third-party packs added |

## Status vocabulary

- `SURVEYED` — photographed / known defects; not composed this PR yet
- `IN PROGRESS` — being polished on this branch
- `DONE` — walked, before/after under `docs/ui-polish/`, judged improved
- `SKIP` — deferred (off-limits, harness-owned, or not mountable)

---

## Screen ledger (bench ids)

| Screen (bench id) | Status | Notes / prioritized issues |
|---|---|---|
| **`title`** / **`mainMenu`** | **DONE** | Tab order + logo clear of the orrery rings on ui-polish-5 (§ Main menu below) |
| `motionAsk` | SURVEYED | Inherits title |
| **`new-game`** / `newGame` | **DONE** | See § New Game below — this session |
| **`pause`** | **DONE** | See § Pause below — ui-polish-6 (moved off #325) |
| **`new-game`** / `newGame` | **DONE** | See § New Game below; yard/loadout fixes on ui-polish-5 (§ New Game yard fixes) |
| `pause` | SURVEYED | Ledger DONE; keep selectors stable for player-truth |
| **`settings`** | **DONE** | See § Settings below — this session |
| **`save-load`** / `saveLoad` / `save-load-empty` / `save-load-live` | **DONE** | See § Save/Load below — this session |
| **`help`** | **DONE** | See § Help below — this session |
| **`codex`** / **`codex-record`** | **DONE** + **phone** (ui-polish-22) | Desktop DONE; phone portrait stack + landscape hang\|reader; review1+review2 fixes in § Phone Codex |
| **`mission-log`** / `missionLog` | **DONE** (+ narrow desktop, ui-polish-43) | See § Mission Log; § Missions on a narrow desktop (ui-polish-43) |
| **`credits`** | **DONE** | See § Credits below; phone / ≤900 ladder fixed in ui-polish-30 |
| **`achievements`** | **DONE** | See § Achievements below — this session |
| **`statistics`** | **DONE** | See § Statistics below — this session |
| **`game-over`** / `gameOver` | **DONE** | See § Game Over below — this session |
| **`tech-tree`** / `techTree` / `tech-tree-progress` | **DONE** (+ phone / narrow / short desktop, ui-polish-40; Industrial Mining label @960, ui-polish-44) | See § Tech Tree below, § Research on a phone… (ui-polish-40), and § Research Industrial Mining label (ui-polish-44) |
| `flight` / `power-rail` | SURVEYED | Off-limits for threat markers (PR #300); polish chrome only later |
| `mobile-flight` / `mobile-stick` / `mobile-boost` / `mobile-brake` / `mobile-wheel` / `mobile-wheel-pinned` | SURVEYED | |
| `crucibleHud` | SURVEYED | |
| **`crucible-results`** | **DONE** (ui-polish-5) | See § Crucible results below |
| `orrery-flight` | SURVEYED | |
| **`comms-radial`** | **DONE** (phone: fan lifted clear of the HUD cluster) | See § Comms fan — phone sky band (ui-polish-28). Desktop 960: a world-projected doctrine tell (FLYBY) can sit behind ROUTE depending on camera; tell placement is hud.js threat-tell territory, left alone |
| **`wingman-radial`** | **DONE** (hub stack) | See § Wingman radial hub stack — ui-polish-28 |
| **`ship`** | **DONE** (ui-polish-27) | See § THE SHIP flight host below — blurb off gauges; heroes two-up ≤1100 |
| **`footprint` / `footprint-marked` / `footprint-clean`** | **DONE** (960 reading column + phone stack) | See § Footprint — 960 reading column, phone stack (ui-polish-28) |
| **`range`** | **DONE @960×540** (ui-polish-17), **@1280 / mid-height + phone** (ui-polish-23) | See § Proving Range @960 and § Proving Range @1280 + phone below; 1920 unchanged |
| **`chart`** / `galaxyMap` / `chart-galaxy` / `chart-route` / `chart-local` | **DONE** (desktop shell + phone sheet, ui-polish-34) | See § Chart on a phone below |
| `station` / `station-dock` + tabs (`market`, `shipworks`, `industry`, `contracts`, `factions`, `bar`, `ledger`) | IN PROGRESS | Berth shell DONE (#333); phone berth + phone Market DONE (#335); Market/Contracts/Shipworks @960 + SPREAD done; Industry/Factions/Bar @960 done (ui-polish-13); Ledger already fit; Shipworks callouts @960 DONE (ui-polish-15); Ledger purse @800 DONE (ui-polish-45); one-line callouts @801–1100 × ≤460 (ui-polish-46); chooser head CARGO · S / COMPATIBLE (ui-polish-47) |
| **`crucible` / `crucible-door`** | **DONE** (Encounter / door) | See § Crucible door below |
| **`crucible-draft`** / armory | **DONE** | See § Crucible Armory below |
| **`crucible-rearm`** | **DONE** | Alias of armory / `crucible-draft` — no separate polish |
| **`crucible-refit`** | **DONE** | See § Crucible Refit below |
| **`crucible-results`** | **DONE** (ui-polish-27 ≤600 tall + ui-polish-28 phone sticky foot) | LAST 5 HITS kept at ≤600 tall desktop (#374); phone dial clears docked foot (polish-28) — see § Crucible results |
| **`demoEnd`** | **DONE** (960/1280 one-line chain + phone stack) | See § Demo end — register at full width, phone stack (ui-polish-28) |
| `asteroid-works` / `drill` / `drill-claimed` / `drill-build` | SURVEYED | Own design law |
| **`base` / `base-claimed`** | **DONE** (phone + narrow + 960 slot rail) | See § Base screen — phone module list, narrow spine, one slot rail (ui-polish-28) |
| `loading` | SURVEYED | |
| **`automation`** | **DONE** (761–1100 ui-polish-27, ≤760 desktop window ui-polish-36) | See § Automation in a narrow desktop window below; phone sheet lives in `mobileScreenLayouts.js` |
| **`replay`** | **DONE** (ui-polish-27) | Empty-tape line wraps on phone instead of ellipsizing — see § Clips reel empty state below |
| **`clips`** | **DONE** (ui-polish-27) | Empty reel fits every width; see § Clips reel empty state below |
| **`sandbox`** | **DONE** (ui-polish-24) | Launch no longer buries Combat Lab / Hull / Hornet; phone tiles no longer stack — see § Sandbox Launch below |
| `localmap` / `localmap-legacy` | SURVEYED | |
| `starmap` / `starmap-legacy` | SURVEYED | |

---

## Automation in a narrow desktop window — session notes (2026-10-15, ui-polish-36)

**Before (master cc906667e6):** below 761px wide (a desktop window, not a phone) the board kept its 270px column and the five-node strip beside the gauge. At 600–700 the DRONES / TRADERS / OUTPOSTS words printed over each other and the rung stats ran under THROTTLE; at 390 the strip, CLOSE and the throttles were off the frame, the board's cost sat on its sentence and the summary's ASSETS / NET FLOW tangled (bench: 6 findings at 600/700, 17 at 390, on every tab).

**After (`src/ui/screens/automationPanel.js` only, `html:root:not([data-sf-mobile="1"])` under `max-width: 760px`):** the strip takes its own row as wrapping steppers (ring, count and beam on one axis, the word under them, five across at 700, three at 390); the board stacks over a four-column summary (two under 520); each purchase rung keeps its name, wraps its stats and puts THROTTLE and the research verb under them. Under 520 the purse and CLOSE share the row under the title. Bench is 0 findings on all four tabs at 390×844, 480×800, 600×900 and 700×800. 761+, 960, 1280, 1920 and the real phone (390×844, 844×390) are pixel-identical apart from the route-beam pulse.

Shots: `ui-shots/polish36/{before-tabs,after1,after2}/` plus `compare-*.png`.

## Save / Load reading clears the filmstrip — session notes (2026-10-13, ui-polish-26)

**Before (master 9ee2924f04):** the filmstrip spanned both columns under the reading, so the reading ran into it. At 960×540 the hull record, NAME, LOAD / SAVE HERE / DELETE and the QUICK / SLOT 1 labels printed on top of each other, and LOAD sat on EXPORT. At 1280×720 and 1920×1080, LOAD and the name field sat on the Quick slot's berth and the beam.

**After (`src/ui/orrery/saveLayouts.js` only, desktop only via `html:root:not([data-sf-mobile="1"])`):**
- The grid areas become `"title stage" "page stage" "page hang" "foot foot"`. The reading has the whole left column, and the filmstrip stands under the hull, where the beam already ran. `saveFilmstrip.js` re-lays the stations from the host width (ResizeObserver), so no JS changed.
- At ≤1100px wide the reading column is `minmax(356px, 38%)`, the context line fits on one line (10px, .12em), and a slot's badge (CURRENT) takes its own line under its name.
- At ≤1100×≤640 the credits numeral is 48px×scale and the hull record reads in two columns, with keys sized to their words, so LOAD ends 30px above the foot.
- 1280 and 1920 change only in the grid areas. Phone (portrait and landscape) is untouched. The empty slot (`save-load-empty`) is clean at every size. Selectors and IDs are unchanged.

Shots: `ui-shots/save-load/{before,after}/` (960×540, 1024×768, 1280×720, 1920×1080, phone), iterations in `iter1`–`iter6`. Bench note: the readings' decode animation is sometimes caught mid-scramble (for example "03:4█ &3"); that's the capture timing, not the layout.

## Station berth — session notes (2026-10-12, ui-polish-10)

**Before (960×540):** `station.css` still reserves a 292px right gutter (228px under 900) for the legacy corner crown, but the ORRERY crown sits in the head grid, so a third of the screen was empty. The vitals strip is capped at 326px and nowrap, so it spilled left over the mechanic's note. The tab rail clipped at FAC, and every tab body was squeezed into 636px. At every size, the word reading CREDIT LINE OPEN crossed the Ledger's empty ring. At ≤800px tall, the `/ 100` denominators sat on the dial ends.

**After (`src/ui/orrery/stationLayouts.js` only):** at 651–1100 the gutter is gone. At 901–1100 the head is a 280px note column plus the vitals strip, the next-step title stays on one line with its sentence under it, and the foot's seven destinations, Comms/Help and Undock fit on one line. Word readings hide the empty ring under them. Short-screen dials are 80px with tighter denominators. Selectors and IDs are unchanged.

**Still open after berth:** tab bodies (addressed in § Station tab bodies below).

---

## Station tab bodies — session notes (2026-10-12, ui-polish-10)

**Market body @960×540 (≤1100×≤800):** body height ~192px. Legend and the find share one line (the find's rule is that line's foot, no longer through the filters). The eight families are a vertical ladder beside the register, so all stay visible and the names get the width (fixed BUY/SELL/STOCK columns). Analysis: price keeps "you pay · one unit now", readings sit two-up, SPREAD sits on one line above its bracket. Console: 96px dial with QUANTITY under the number, FEWER/MORE/MAX under the ring, total, collapsed **Quote breakdown** (fees one click away), BUY + SELL on one row. The hold arc sleeps here (the berth head carries HOLD). A pending market decision (e.g. the hull repair) stays on the board: a ruled block right under the analysis with its sentence and one line per verb and its terms, while the console keeps the full height. At ≤640px tall the four readings yield while it waits so the trace keeps its floor; at 1024×768 they stay. With no decision the layout is unchanged.

**Contracts dossier @960×540 (≤1100×≤800):** ACCEPT is in flow, never sticky. The dossier wraps into two columns without new markup (`::after` is the column break): kind, title, client, reward and ACCEPT on the left; the risk sentence (risk, pay, standing gain and loss) and the terms (time, collateral, follow-up, readiness) on the right. The scales and route map sleep at this size (their words would be ~5px); the risk sentence says the same readings. Board: legends close up, the posted list fades out instead of slicing a row, and the tracked job is one line with TRACKED beside it.

**Shipworks verbs @960×540:** `seatVerbs` pinned a fixed row onto the nameplate/rail on short dock stages. Bail to `--unseated` when stage height &lt; 300; CSS absolutely fills the 192px grid cell and pins the verb row to the panel foot (clear of the destination rail). Handling stats hide at this size (they were sitting on the rail).

**Market SPREAD @1280×720:** `.orr-mkt-spread__v` sat at 50% of the bracket and crossed the price trace. Label now sits just above the bracket (`translateY(-100%)`).

**Code:** `marketLayouts.js`, `stationTabsLayouts.js`, `shipworksLayouts.js`, plus a one-line bail in `shipworks.js` `seatVerbs`. Selectors/IDs unchanged.

**Follow-up (not in #333):** Shipworks slot callouts (Utility/Drive/Cargo) sit on the hull at 960 — they are placed by the jig in JS. **Fixed in ui-polish-15** (see § below).

## Shipworks callouts @960 — session notes (2026-10-12, ui-polish-15)

**Before (960×540):** Wave 2 S1 clamped the solver's label region to screen x=560 so left cards clear the prose at ≤1366. On the short dock stage (~162px tall) that same clamp parked Cargo/Weapon/Mining on the hull poster (leaders gone). Utility/Drive/Cargo sat on the silhouette.

**After:** skip the x=560 clamp when stage height &lt; 300; on short stages grow `reserveX` / keep-out pad and pass a wider solver `gap` so both columns sit in clear air (~55px off the ink) with leaders restored. `calloutLayout.place` never lets a bounds clamp shove a card into the hull keep-out. 1280×720 pixel-identical; 1920×1080 unchanged for callouts. Shots in `/workspace/spaceface-scratch/ui-shots/shipworks-callouts/` (not committed).

**Code:** `shipworks.js` (clamp gate + short-stage keepOut/gap) + `calloutLayout.js` (hull-safe place). Selectors/IDs unchanged.

**Still open:** (SWORN ENEMY / HATED at 1024×768 fixed on ui-polish-27, see § Factions scale and ring.) Phone Shipworks callouts fixed on ui-polish-27 (see § below). Shipworks "Starter / systems fitted" @960 fixed on ui-polish-27 (see § below).

### Industry / Factions / Bar @960×540 (ui-polish-13)

**Before:** each body is ~192px at 960×540. Industry's 240px chain fell under the foot rail (second input, ring, output and FABRICATE gone; the reason ran off the top). Factions' 330px ring lost its south half and the standing scale. Bar's name wrapped to two lines, her line ran under the voice arc, and the replies fell off.

**After (`stationTabsLayouts.js` ≤1100×≤800 and ≤1100×≤640, plus `crestOrbit.js`):**
- **Industry:** the blueprint tier sleeps (the ladder head says T1), and the chain is 170px. Its right side is one column: why it can't run, then the yield, then FABRICATE. Input labels close up so three materials fit in the 50px pitch. The ladder head reads in two lines (process, then why it's shut).
- **Factions:** at ≤640 tall a ring of 14 crests would be ~27px a crest, so the powers stand on the ladder, like every other tab's index. The reading's head is one band (authority and name on the left, standing and watermark on the right), with the scale full width and the next rung under it. At 1024×768 the ring stays, and the west names no longer clip.
- **Standing scale (all sizes):** on a staggered scale a tier name may use two bands before it splits, so SWORN ENEMY is one line at 1280. The end names sit flush with the rule's ends. The name width estimate is 9.4px a glyph (8.4 let neighbours touch).
- **Bar:** the name is one 24px line, the words stop 330px short of the bay's right edge, and the portrait is capped at 300px at the right edge, so the arc and reply dial never cross her line. At ≤640 tall the three replies stay on glass (the 1–3 hint sleeps; the dial carries the numbers).

At 1280, 1920 and phone (portrait and on its side), Industry, Bar and Ledger are pixel-identical to master; Factions changes only in its scale names. The rules are desktop-only (`:not([data-sf-mobile="1"])`). Shots: `ui-shots/tabs960/`.

### Factions standing labels @1024×768 (ui-polish-16)

**#340 merged** into master (Industry/Factions/Bar @960). Open: #341, #342.

**Before:** at 1024×768 the standing scale is ~460px wide; SWORN ENEMY still split under stagger and its top line sat ~2px from HATED's raised baseline.

**After (`crestOrbit.js` only):** when a flush end name would need two lines, force stagger; when an even tier still splits under stagger, lift the odd row (rise 24 + 12px headroom) so SWORN ENEMY clears HATED. 960×540 (≤640 ladder) and 1280×720 pixel-identical to master; 1920 gets the same end-name stagger so the flush label no longer shares a baseline with HATED. Shots: `/workspace/spaceface-scratch/ui-shots/factions-standing/`.

## Codex @960×540 and 1024×768 — session notes (2026-10-13, ui-polish-19)

**Before:** at 960 and 1024 wide the seven unlock dials (about 600px, no wrap) ran over the subtitle, so it printed on top of STORY. The plate (34vw) took the stage's right half, leaving the reading about 150px wide, so the entry title broke into three words and the lore fell below the fold. At 960×540 the plate's top met the ENDGAME dial label, and LEDGER sat on CLOSE.

**After (`src/ui/orrery/archiveLayouts.js`, Codex CSS only):** at 801–1100px wide the dials are 44px on 64px columns, the plate is `min(300px, 48vh, 29vw)` and sits a little lower, and the hang column is 316px. The reading has about 250–300px, with a 44px numeral, a 22px title and 14px lore, and record rows stack label over line. At ≤640px tall, section rungs are 22px and the search and foot close up, so LEDGER clears CLOSE. Selectors and IDs are unchanged. 1280, 1920 and phone portrait don't match the query. A phone on its side (844×390) is better but still has the scale over CLOSE, which is a follow-up. Shots: `ui-shots/codex960/`.

## Shipworks nameplate vs callouts @960 — session notes (2026-10-13, ui-polish-20)

**Before:** at 960×540 the dock stage is 162px tall, and the left callout column shared it with the nameplate (title, then DOCKED, then the rename field) and the camera words. `nameplateInkRect` read text nodes only, so the field's "Name this hull" placeholder was no obstacle: Utility / Shield Capacitor M printed on it, and the column's overflow ran Drive and Cargo onto LEFT · CENTER · RIGHT.

**Fix:** `nameplateInkRect` now adds the rename field's value or placeholder, measured in its own font from its content edge (`shipworks.js`). `shipworksLayouts.js`, `@media (max-width:1100px) and (max-height:640px) and (hover:hover)` only: DOCKED rides the title's line, the field is one compact 12px line, and the live stage's camera words sit at the right end of the verb row under the stage. The left column gets ~85px instead of ~15px, so three cards fit between the field and the verbs.

**Checked:** 960×540, 1024×576, 1100×640, stock and longest-name injected, live hull and render; no card touches the field or the camera words. 1024×768, 1280×720, 1920×1080, 390×844 and 844×390 don't match the query: field box unchanged and screenshots match master. Shots: `ui-shots/shipworks-nameplate/{before,after2}/`.

## Proving Range @960×540 — session notes (2026-10-13, ui-polish-17)

**Before:** the title block (180px) and the foot (338px: a five-row rule ladder, the dossier and a 64px run gauge) plus the 48px kit row gap outgrew 540px. The stage, which holds the course itself, was squeezed to 0px, and RULES / BESTIARY / CLOSE and the run instrument fell below the frame.

**After (`src/ui/screens/range.js`, local style block only, `@media (max-width:1100px) and (max-height:640px)`, desktop only):** frame padding 20/40/12 and an 8px row gap, the corner count moves up with the title (40px), and the lamp key is 34px tall. The ladder words are tracked tighter, with 5px ticks and a 12px gap, so the 16 rules take four rows. The dossier and the run row close up, and the gauge is 40px. The course keeps ~146px (~110px when a long rule name wraps to two lines). The whole foot is on glass, and RULES and BESTIARY open their drawer over the stage. Type stays on the grammar scale. Selectors and IDs are unchanged. 1024×768, 1280, 1920 and phone don't match the query. Shots: `ui-shots/range960/`.

## Proving Range nits, Shipworks place() and menu clicks @960 — session notes (2026-10-13, ui-polish-18)

**#346 nits (`src/ui/screens/range.js`, same `≤1100×≤640` desktop query only):**
- **RULES / BESTIARY drawer is glass:** 280px wide (was 360px), tinted (`rgb(10 12 16 / .34→.66)`), 1.5px blur, a bone hairline on its left edge and an 18px fade at its foot to show the list scrolls. Its words carry a shadow. The course box makes way by the same 280px. BRUISER and its gate now sit clear of the drawer, and the gate ticks show through it.
- **Ladder ticks:** 7px × 2px at .74 (the old ticks were 5px × 1.5px at .52), inside the same 9px foot, so the four-row ladder and the ~146px course are unchanged.
- 1024×768, 1280, 1920 and phone don't match the query; their computed drawer box and fill are unchanged. Shots: `ui-shots/range960-nits/{before,after}/`.

**#342 place() check (no code change):** at 960×540, 1024×576 and 1100×640, with the longest fitted names injected (Gimbal Thruster Array L, Industrial Massline Spool, Pale-Coil Warp Drive), the right column ends at 882 / 942 / 1030px. The stage edges are at 928 / 992 / 1068px, so nothing clips off screen. **Open:** at 960, the widest left card (Regular Mass-Shifter) prints over the nameplate's "Name this hull" placeholder. `nameplateInkRect` reads text nodes only, so an input placeholder is not an obstacle. Shots: `ui-shots/shipworks-place/`.

**Menu clicks (live boot, `?dev=screen:mainMenu`, 1280×720 and 960×540):** Archive opens Codex (~1.2s), Achievements opens (~1.3s), and Esc returns to the menu. Quit is hidden in the web build (`li[hidden]`, 0×0), so there is no dead button. No console errors. Evidence: `ui-shots/menu-clicks/live2-{1280,960}/report.json` + PNGs. **Open:** at 960×540 the Codex subtitle runs into the unlock dials, GATE APPROACH clips, and LEDGER sits on CLOSE.

## Proving Range @1280 + phone course — session notes (2026-10-13, ui-polish-23)

**Before (master c8f43e53ee):** at 1280×720 the course (`.k-stage`) was ~85px; the 64px top pad, two 48px kit row gaps, a four-row ladder at ~42px a row and the 64px gauge took the rest. On phone 390×844 the course was **0px**: the 40px title ran four lines, the kit's title padding (it reserves the corner's width) squeezed every title line to 182px, and the 16 rules wrapped into a ten-row ladder (44px touch rows), so the foot alone was 641px. On phone 844×390 the course was also 0px.

**After (`src/ui/screens/range.js` only, local style block plus one small helper):**
- **Mid-height desktop** — `@media (min-width:1101px) and (max-height:900px), (min-height:641px) and (max-height:900px)`, desktop only. The top pad is 40px and the row gaps 22px; the ladder rows are ~34px with 6px ticks; the dossier and run row are 14px; the gauge is 48px. Course: 1280×720 **85→224px**, 1024×768 115→250, 1440×900 251→398. 960×540 still matches the short-frame block (146px, unchanged) and 1920×1080 is past 900px (385px, unchanged).
- **Phone portrait** (`data-sf-mobile`): the ladder is one row that scrolls sideways. The spine is a `background-attachment: local` rule so it travels with the words, the right edge fades, and `_keepRungInView` scrolls the live rung into view when NEXT RULE (or anything other than a tap on the ladder) changes it. The title drops the kit's corner padding: only the rule keeps 88px for the corner, at `var(--k-fs-menu)` (30px on phone). The score is 22px, the run gauge 36px, the gaps 12px, and the course row has a 200px floor. Course at 390×844: **0→384px**, and the foot (ladder, dossier, RULES / BESTIARY / CLOSE, run gauge) ends at 824. The longest rule ("A sheet collects loose mass onto the line") still fits without scrolling, with 330px of course.
- **Phone landscape (≤500px tall)**: the course takes the right 44% at full height (350×306, below the score), and the title sits over the foot on the left. Course at 844×390: **0→306px**.
- Drawer width is capped at the stage on phone. Type stays on the grammar scale (12/13/14/15/22 plus the kit token), and selectors and IDs are unchanged.

Shots: `ui-shots/range-course/before/`, `after/` (all sizes), `checks/` (drawer open, NEXT RULE ×6 rail scroll, longest rule).

**Live-build check (Code Work's ask, 06:10 ET):** the real game (`?dev=screen:range`, then Esc and the real F4 key) matches ui-bench at 960 (146px), 1280 (224px) and 1920 (385px). On a real touch phone the coarse pointer gives AGAIN / TRY IT EMPTY 44px rows, so NEXT RULE wrapped to its own row and the 390×844 course was 314px, not 384. Under `(pointer: coarse)` the verbs now share one row (10px gap, phone-sized lamp key, as on the phone Market): course 390×844 **314→364**, 375×812 285→335, 360×740 217→267; 844×390 is 318. The drone's name (BRUISER) is now painted last on a small void plate, so the gate rung and turn ring that pack under it on the narrow course no longer cut through the letters. Shots: `ui-shots/range-course/live/` (before) and `live/after3/`.

## Credits + Automation @960 — session notes (2026-10-13, ui-polish-27)

- **Credits** (`settingsLayouts.js`, 901–1100px only): the 80vh orrery reached into the reel, so its MADE BY label sat on the blurb at 960×540 and the whole emblem covered the TYPE rows at 1024×768. The emblem is now `min(80vh, 38vw)`, parked 30% off the right edge, and the reel is 420px wide with a 38ch sentence; the current body name is 28 SVG units so it stays legible. Under 600px tall the reel-progress dial (decoration) is hidden because it fell onto ‹ BACK.
- **Automation** (`automationPanel.js`, 761–1100px only): CONDUCT THE MACHINE takes its own row under the gauge, so DRONES/TRADERS/OUTPOSTS no longer run under the next ring. The board card's "4,000 cr starter" sits on its own line above the button, the body gets a third line, and the drone bay rungs put range and upkeep on a second line so "upkeep" isn't clipped by THROTTLE at 1024.
- 1280×720, 1920×1080, and the phone are unchanged; the only pixel differences are the animated drift field and beads. Shots are in `ui-shots/leftovers27/{before,after2}/`.
- **Mission Log route** (`archiveLayouts.js`, 761–1100 wide and ≤640 tall): the stage was a 235px column under a four-line title, so the FROM → TO route band started at y≈437 and the stage cut it off. The hang is now 312px and the dial is 140px in a 190px side column (so OPEN ON THE CHART fits). The title is 21px over two lines, the terms use a 104px label column so their values don't wrap, and the route discs are 44px, so the whole lane, its clock, and both faces sit in frame.
- **Station Ledger purse** (`stationTabsLayouts.js`, 761–1100 wide and ≤640 tall): the ~192px body held the 176px tape and put the reading and the purse below it, so the purse was clipped. With no receipts that cut BOUGHT/SOLD/NET · CR; with receipts it also cut the whole reading. The right column is now a grid. The purse (220px, so its ring clears NET · CR as at 1280) stands beside the tape at full height. The reading is one band (kicker, then the figure beside what/where) that rises into the tape's empty leader strip, and the leader is hidden at this size. The left column is 40% wide with a 24px heading. ~~Still in the tape's JS geometry at every size: when entries are close together, CYCLE labels and the −750/−480 figures collide.~~ Fixed on ui-polish-35, see § Ledger tape labels.
- The ledger with receipts was shot with a scratch script that seeds `player.tradeLedger`, because the bench catalog only has the empty ledger. 1280/1920/phone ledger shots are pixel-identical before and after, and mission-log differs only by beam-pulse noise, which matches the noise between two runs of the same code. Shots are in `ui-shots/leftovers27b/{before,after}/` plus `compare-*-960.png`.

## Phone station berth — session notes (2026-10-12, ui-polish-11)

**Before (390×844):** the berth was one long scroll (~2180px). Title and mechanic scrolled off; vitals alone were ~454px (44px min-height on every act); destination tabs sat at y≈1810 under the whole tab body; Munitions spanned the vitals grid.

**After:** `mobileScreenLayouts.js` + `systems/mobile/styles.js`. Identity, tape, vitals and a wrapped destination foot stay on glass; the tab body is the only scroll. Selectors/IDs unchanged.

**#335 HOLD fixes (Code Work, 19:55):** `mobileScreenLayouts.js` only.
1. Market decision (`.sx-mkt__decision`) is laid out under the trade as full-width 44px option rows. It is no longer hidden.
2. Find a service stays as a 44px search key beside the tape (its label is kept for screen readers).
3. Mechanic, station event and story ledger are two-line cards in a swipeable tape. The hull reading leads and the next card peeks in.
4. REPAIR/INSURE/DRAW/REARM are dense two-line keys, each with a measured 44–45px `::after` hit box that does not overlap another control.
5. Crown: five vitals sit on one gutter-aligned row (a word reading takes the dial's slot). The purse moves to the right end of the title band.
6. The body grows from ~283 to ~384px of 844 and the dead band is gone. Buy/Sell is on glass when Market opens.
7. Market: the order is commodity, trade (128px dial | total, Buy/Sell, breakdown), decision, then trace, then register. Nothing overlaps. Fewer/More read as −/+.
8. Tab badges are amber pills after their own word. The tabs sit on a 4-column grid.
Bonus: a phone on its side (≤560px tall) scrolls the berth as one page with the foot pinned. Desktop 960×540 is pixel-identical; at 1280×720 only the animated rule differs.

**Still open on phone:** (Shipworks callouts fixed on ui-polish-27 — see § below.) Desktop Shipworks callouts @960 fixed in ui-polish-15. Market decision @≤1100×≤800 fixed in #337. Industry/Factions/Bar @960 done in #340.

**Leftover:** ~~Contracts TRACKED badge can sit off-frame~~ — on-frame at every size now (see § Phone Missions dossier, ui-polish-28). ~~filter search bury "Raw & rare" at 960~~ — fixed in ui-polish-28. ~~Shipworks left-rail "Starter / systems fitted" clip at 960~~ — fixed on ui-polish-27.

## Decision terms @960 + phone-on-its-side foot — session notes (2026-10-12, ui-polish-14)

**Before:** at 960×540 (≤1100×≤640) each decision verb kept its terms on one nowrap line, so "Pay 22 cr. Hull 86 → 100, armor 2…" lost the armor reading. On a phone on its side (844×390) the pinned foot was two rows (tabs, then Comms/Help and Undock), 91px of 390.

**After:** `marketLayouts.js`: at ≤1100×≤640 the two verbs sit side by side, each with its terms wrapping under it, in about the same height (59px vs 55px); every term reads in full. #339's wrap at 641–800 tall is untouched. `mobileScreenLayouts.js`: at ≤560px tall the foot is one opaque row, with the tabs, then Comms/Help, then Undock, at 51px. The tabs keep 44px hit boxes, and on phones narrower than 800px they slide sideways under a right-edge fade. 1024×768, 1280×720, 1920×1080 and 390×844 match master (only the animated tape differs). Selectors/IDs unchanged.

---

## Settings — session notes (2026-10-12)

**Before:** measured clean; composition already ORRERY (ladder + scales + live mixer/HUD/dial). Still read flat: switch words had weak affordance, row hierarchy competed with numerals, preview glass was thin, beam and foot read soft.

**After (2 visual iterations):**

1. **Pass 1** — brighter label hierarchy; roomier rows; switch/choice pairs sit on a rail with a lit underline on the pressed word; thicker scale fill + hotter cursor; stronger category ladder contrast; deeper preview glass veil + brighter legend/beam.
2. **Pass 2** — focus-within row wash; larger/brighter value numerals and select values; BACK foot rail; preview stage corner ticks + foot rule.

**Walk:** `node scripts/ui-bench.mjs --shot=settings --walk` — exit 0; all 19 controls exercised; no tangled/buried/cut-off/offscreen; selectors/IDs unchanged.

**Artifacts:** screenshots are attached to PR #322 rather than committed (kept out of the repo per review).

**Code touched:** `src/ui/orrery/settingsLayouts.js`, `src/ui/orrery/settingsPreview.js` only. No loadout data, audio systems, flight HUD threat markers, or engine/render changes.

**Next after settings was:** `save-load` — now DONE (see below).

---

## Save/Load — session notes (2026-10-12)

**Before:** live-boot Load empty (`docs/ui-polish/before/03-load-*.jpg` / `save-load-before*.png`) — title emph and empty body too dim on void; vacant hero word washed out; empty filmstrip names/subs faint; foot was plain `BACK ESC` (no ‹ / keycap), unlike settings.

**After (2 visual iterations, CSS-only in `saveLayouts.js`):**

1. **Pass 1** — emph/detail/context contrast raised toward bone (≥ ~0.88–0.94); vacant word brighter + soft glow; open berth rim brightened (`filter` + floor wash); empty filmstrip names/subs less washed; foot rail matched settings (`‹ BACK` + ESC keycap box + underline); mild 1.12 composition zoom at 1800–2199×≥1000 (720p untouched).
2. **Pass 2** — emph/detail/filmstrip empty contrast nudged further; context line hierarchy clearer.

**Walk:** `SF_CHROMIUM=… node scripts/ui-bench.mjs --shot=save-load-empty --walk` — exit 0; 5 controls exercised; no tangled/buried/cut-off/offscreen. Also `--shot=save-load` and `--shot=save-load-live` measured clean. Selectors/IDs unchanged. Game-over block untouched.

**Artifacts:** screenshots are attached to PR #322 rather than committed (kept out of the repo per review).

**Code touched:** `src/ui/orrery/saveLayouts.js` only. No loadout data, audio, flight HUD threat markers, engine/render, or game-over style changes.

**Next after save-load was:** `help` — now DONE (see below).

---


## Help — session notes (2026-10-12)

**Before:** ORRERY Help already strong (ladder + Hand, Controls Rig, readings). Gaps vs the polished settings/save-load stack: CLOSE foot was a display-size word + Esc glyph (not the `‹ … ESC` keycap rail); section ladder / reading / search rested too dim on void; search rule CSS was broken (duplicate `background` + stray `}) !important`); no shared foot language with settings.

**After (2 visual iterations, CSS-only in `helpLayouts.js`):**

1. **Pass 1** — foot rail matched settings/save-load (`‹ CLOSE` + ESC keycap box + underline); section-ladder and reading contrast raised (tabs/names/kickers/terms/lore/empty ≥ ~0.82–0.92); fixed search lit-rule CSS; deeper reading shade pool.
2. **Pass 2** — kept foot `min-height:44px` so the stage row doesn't collapse; left 1080p zoom off Help (EVERY KEY + rebound footnote already dense; 720p had a pre-existing measure tangle unrelated to this pass).

**Walk:** `SF_CHROMIUM=… node scripts/ui-bench.mjs --shot=help --walk` — exit 0; measured clean at default 1920×1080; 26 controls exercised; selectors/IDs unchanged. `--viewport=1280x720` still reports a pre-existing EVERY KEY / rebound-footnote bounding-box tangle (present on master before this pass).

**Artifacts:** screenshots are attached to PR #322 rather than committed (kept out of the repo per review).

**Code touched:** `src/ui/orrery/helpLayouts.js` only. No loadout data, audio, flight HUD threat markers, engine/render, or selector/ID changes.

**Next after help was:** `credits` — now DONE (see below).

---


## Credits — session notes (2026-10-12)

**Before:** ORRERY Credits already strong (reel + orrery Hand + drift). Gaps vs the polished settings/save-load/help stack: BACK foot was plain `‹ BACK ESC` text (no keycap box / underline); subtitle / ladder / notice / row-sub copy sat too dim on void; "0% READ" read as a loading bar; at 720p orrery body nums 03/04 clipped their discs.

**After (2 visual iterations, CSS + one label string in `settingsLayouts.js`):**

1. **Pass 1** — foot rail matched settings/save-load/help (`‹ BACK` + ESC keycap box + underline); progress label `Read` → `Of reel`; title/ladder/notice/row-sub/end contrast raised (≥ ~0.78–0.92); short-window hide of orrery body nums; 1.12 zoom @1080p band.
2. **Pass 2** — ladder rest/current contrast nudged; title rule and row ticks brighter.

**Walk:** `SF_CHROMIUM=… node scripts/ui-bench.mjs --shot=credits --walk` — exit 0; measured clean at 1920×1080 and 1280×720; 14 controls exercised; selectors/IDs unchanged.

**Artifacts:** screenshots are attached to PR #322 rather than committed (kept out of the repo per review).

**Code touched:** `src/ui/orrery/settingsLayouts.js` (CREDITS_CSS + `createReelProgress` label only). No loadout data, audio, flight HUD threat markers, engine/render, or selector/ID changes.

**Next:** `codex` / `codex-record` — now DONE (see below).

---

## Codex — session notes (2026-10-12)

**Before:** ORRERY Codex already strong (section ladder + entry rail + plate dial + unlock gauges). Gaps vs the polished settings/save-load/help/credits stack: CLOSE foot was plain `‹ CLOSE ESC` text (no keycap box / underline); subtitle, index labels, section tabs, locked cipher, filed/meta, empty notes, and search placeholder sat soft on void; no 1.12 composition zoom in the 1080p band; ladder/search rails and ticks read thin.

**After (2 visual iterations, CSS only in `archiveLayouts.js` CODEX_CSS):**

1. **Pass 1** — foot rail matched settings/save-load/help/credits (`‹ CLOSE` + ESC keycap box + underline); secondary copy contrast raised (≥ ~0.78–0.94); plate engraving brighter; 1.12 zoom @1080p band (1800–2199 × ≥1000).
2. **Pass 2** — search rule + lens, section scale, entry rail, row ticks, wedge edge, and measure rule nudged brighter.

**Walk:** `node scripts/ui-bench.mjs --shot=codex --walk` — exit 0; measured clean at 1920×1080 and 1280×720; 13 controls exercised (tabs, next, close); selectors/IDs unchanged. `codex-record` re-shot after the same CSS.

**Artifacts:** screenshots are attached to PR #322 rather than committed (kept out of the repo per review).

**Code touched:** `src/ui/orrery/archiveLayouts.js` (CODEX_CSS only). No loadout data, audio, flight HUD threat markers, engine/render, or selector/ID changes. Mission-log CSS in the same file left alone this session.

**Next after codex was:** `mission-log` — now DONE (see below).

---


## Mission Log — session notes (2026-10-12)

**Before:** ORRERY Mission Log already strong (tracing beam + dial + route lane). Gaps vs the polished settings/save-load/help/credits/codex stack: BACK foot was plain `‹ BACK ESC` text (no keycap box / underline); story line, section caps, kickers, row-subs, empty notes, dial/clock secondary, and terms labels sat soft on void; no 1.12 composition zoom in the 1080p band; beam / lane / dial ticks read thin.

**After (2 visual iterations, CSS only in `archiveLayouts.js` MLOG_CSS):**

1. **Pass 1** — foot rail matched settings/save-load/help/credits/codex (`‹ BACK` + ESC keycap box + underline); secondary copy contrast raised (≥ ~0.78–0.94); beam + dial ticks brighter; 1.12 zoom @1080p band (1800–2199 × ≥1000).
2. **Pass 2** — SHOW/verb chevrons and word-subs nudged; lane band / hop ticks / route face ring / clock ticks / career diamond / completed hollow nodes brighter.

**Walk:** `SF_CHROMIUM=… node scripts/ui-bench.mjs --shot=mission-log --walk` — exit 0; measured clean at 1920×1080 and 1280×720; 6 controls exercised (SHOW×2, track, local map, abandon, close); selectors/IDs unchanged.

**Artifacts:** screenshots are attached to PR #322 rather than committed (kept out of the repo per review).

**Code touched:** `src/ui/orrery/archiveLayouts.js` (MLOG_CSS only). Codex CSS in the same file left alone this session. No loadout data, audio, flight HUD threat markers, engine/render, or selector/ID changes.

**Next after mission-log was:** `achievements` — now DONE (see below).

---

## Achievements — session notes (2026-10-12)

**Before:** ORRERY Achievements already strong (medal orrery + read dial + word-scale filters). Gaps vs the polished settings/save-load/help/credits/codex/mission-log stack: BACK foot was plain `BACK · ESC` (no keycap box / underline / ‹); subtitle, filter rest words, kicker/of/status, locked glyph, dial ghost/ticks, stage tracks/labels sat soft on void; no 1.12 composition zoom in the 1080p band.

**After (2 visual iterations, CSS only in `constellationLayouts.js` ACHIEVEMENTS):**

1. **Pass 1** — foot rail matched settings/save-load/help/credits/codex/mission-log (`‹ BACK` + ESC keycap box + underline); secondary copy contrast raised (≥ ~0.78–0.94); read-dial ghost/ticks/glyph brighter; word-scale rule/counts brighter; 1.12 zoom @1080p band; optional 1440p/4K zoom rules (`1.25` / `1.85`) matching archive screens.
2. **Pass 2** — filter rest bumped again; stage orrery tracks / ring names / hub of / medal labels brighter under achievements-only selectors; read dial chrome nudged once more.

**Walk:** `SF_CHROMIUM=… node scripts/ui-bench.mjs --shot=achievements --walk` — exit 0; measured clean at 1920×1080 and 1280×720; 28 controls (24 exercised: medals, Back, ALL); selectors/IDs unchanged.

**Artifacts:** screenshots are attached to PR #322 rather than committed (kept out of the repo per review).

**Code touched:** `src/ui/orrery/constellationLayouts.js` (ACHIEVEMENTS only). RESEARCH CSS in the same file left alone this session. No loadout data, audio, flight HUD threat markers, engine/render, or selector/ID changes.

**Next after achievements was:** `statistics` — now DONE (see below).

---

## Statistics — session notes (2026-10-12)

**Before:** kit `k-screen--stage` list with fh title; amber primary Back (no ‹ / ESC keycap); group caps / row hairlines / secondary copy soft on void; no ORRERY composition sheet; no 1.12 zoom in the 1080p band; LAW rows fell under the fold at 720p.

**After (2 visual iterations + short-frame tighten):**

1. **Pass 1** — new `statisticsLayouts.js` ORRERY sheet scoped to `.orr-statistics`: foot rail `‹ BACK` + ESC keycap + underline; title/subtitle contrast; shade pool under the reading; group caps + row names ≥ ~0.84–0.94; phos numerals; brighter hairlines; scrollable stage; 1.12 zoom @1080p (+1440/4K archive zoom).
2. **Pass 2** — group caps get a soft rule; row/numeral contrast nudged; stage bottom pad so LAW clears the foot; short-height (≤820px) tighten so Status + Heat stay on first paint at 720p.

**Walk:** `SF_CHROMIUM=… node scripts/ui-bench.mjs --shot=statistics --walk` — exit 0; measured clean at 1920×1080 and 1280×720; 1 control (Back); selectors/IDs unchanged.

**Artifacts:** screenshots are attached to PR #322 rather than committed (kept out of the repo per review).

**Code touched:** `src/ui/orrery/statisticsLayouts.js` (new), `src/ui/screens/statistics.js` (inject + `orr-statistics` + `sf-back` on Back only). No loadout data, audio, flight HUD threat markers, engine/render, or selector/ID changes.

**Next after statistics was:** `new-game` — now DONE (see below).

---

## New Game — session notes (2026-10-12)

**Before:** ORRERY New Game already strong (yard carousel + hull ring + Lamp Launch). Gaps vs the polished settings/save-load/help/credits/codex/mission-log/achievements/statistics stack: BACK foot was plain `BACK ESC` text (no ‹ / keycap box / underline); field labels (~.55), difficulty rest words, route caps, loadout copy, and fine print sat soft on void; loadout size letters trailed with a · and no shared column edge (P2); no 1.12 composition zoom in the 1080p band.

**After (2 visual iterations, CSS overlay in `newGameLayouts.js`):**

1. **Pass 1** — foot rail matched settings stack (`‹ BACK` + ESC keycap box + underline); secondary copy contrast raised (≥ ~0.78–0.94); loadout size letter column (no · separator); 1.12 zoom @1080p band. Launch Lamp Key untouched.
2. **Pass 2** — loadout name column fixed-width so size letters share one edge; LOADOUT kicker brighter; short-width name column tighten.

**Walk:** `SF_CHROMIUM=… node scripts/ui-bench.mjs --shot=new-game --walk` — exit 0; measured clean at 1920×1080 and 1280×720; 12 controls exercised; selectors/IDs unchanged. Loadout item DATA untouched.

**Artifacts:** screenshots are attached to PR #322 rather than committed (kept out of the repo per review).

**Code touched:** `src/ui/orrery/newGameLayouts.js` (new), `src/ui/screens/newGame.js` (inject only). No loadout data, audio, flight HUD threat markers, engine/render, or selector/ID changes.

**Next:** `game-over` — now DONE (see below).

---

## Game Over — session notes (2026-10-12)

**Before:** ORRERY after-action already composed (red-cooled rays, cause as headline, career ring, black-box tape). Gaps vs the polished stack: at 1280×720 the action rail wrapped (MAIN MENU / LOAD dropped to a second line); the secondary verbs were 11px words with a dim `›` and no affordance; an unavailable *Load latest* (no save yet) looked exactly as live as the others; the ring hub (`NO RECORD` / time flown) sat straight on the hull plan view; hero labels, coverage lines, ring stations, ring title and the black-box legend sat at ~.6–.7 bone; no lift in the 1080p band.

**Bench note:** `ui-bench --shot=game-over` photographs before the screen's 400 ms death slide ends (a JS timer, not a CSS animation, so `settleAnimations` can't finish it) and shows only the backdrop. Shots this session came from a bench page held ~1.2 s past ready, plus a career-populated variant (playtime, contracts, kills, trades, profit) to load the ring stations.

**After (2 visual iterations, CSS overlay in `gameOverLayouts.js`):**

1. **Pass 1** — verbs on one non-wrapping rail with an underline that lights with the Hand (720p gets a tighter gap); verbs 12.5px bone; hub shaded with a soft void disc and the hull dimmed under `NO RECORD`; contrast raised on sub/coverage/hero labels/stations/units/tape legend; CAREER RECORD title flanked by rules; `--sv` 1.1 in the 1080p band.
2. **Pass 2** — red kicker one step larger; `aria-disabled` verbs (Load latest with no save) rest at .46 bone with a faint rule.

**Walk:** `node scripts/ui-bench.mjs --shot=game-over --walk` — exit 0; measured clean; 4 controls exercised (Load save → saveLoad, Load latest disabled, New Game asks, Main menu → mainMenu). Related tests (black-box names, death recovery, load-latest verb, interrupted recovery, death name, gamepad screens) 53/53 pass. Selectors/IDs unchanged.

**Artifacts:** screenshots are attached to PR #322 rather than committed (kept out of the repo per review).

**Code touched:** `src/ui/orrery/gameOverLayouts.js` (new), `src/ui/screens/gameOver.js` (inject only). `saveLayouts.js` GAME_OVER block untouched. No loadout data, audio, flight HUD threat markers, engine/render, or selector/ID changes.

**Next:** `tech-tree` / `tech-tree-progress` — now DONE (see below).

---

---

## Tech Tree — session notes (2026-10-12)

**Before:** Research Constellation already composed (dial, dossier, legend). Gaps vs the polished stack: the hour-verb curve (`1 Propelled charge · …`) ran the full title width and tangled with rim sector names (LOGISTICS) and star labels (Deflector Theory) — ui-bench reported ON TOP OF at 1080 and 720; foot used plain `BACK · ESC` instead of the stack's `‹ BACK` + ESC keycap; secondary copy (sub, corner labels, dossier chrome, legend/view) sat at ~.62–.8 bone; no 1080p composition zoom.

**After (2 visual iterations, RESEARCH CSS in `constellationLayouts.js` + curve clip in `techTree.js`):**

1. **Pass 1** — foot keycap rail; secondary contrast; title shade pool; curve max-width + ellipsis; rim sector chrome brighten; 1080p/1440/4K zoom.
2. **Pass 2** — tighter curve width; DOM-clipped hour-verb line (full ladder on `title=`) so Range-based layout measure matches the eye. Bench: `measured: no tangled…` on `tech-tree` and `tech-tree-progress`; walk exercised controls on both.

**Walk:** `node scripts/ui-bench.mjs --shot=tech-tree,tech-tree-progress --walk` — exit 0; measured clean; selectors/IDs unchanged. ACHIEVEMENTS block untouched.

**Artifacts:** screenshots are attached to PR #322 rather than committed (kept out of the repo per review).

**Code touched:** `src/ui/orrery/constellationLayouts.js` (RESEARCH block), `src/ui/screens/techTree.js` (curve clip + title= only). No loadout data, audio, flight HUD threat markers, engine/render, or selector/ID changes.


---

## Crucible door (Encounter) — session notes (2026-10-12)

**Before:** Live-boot survey left three P1s open on the Encounter step: hero title/blurb sat on bright 3D art with no scrim; at 1080p the hull art painted over BACK/ESC and the door hint; step chrome mixed boxed `01 ENCOUNTER`, bare `02 SHIP & KIT`, and lowercase `03 / Armory`. Arena fold at 720p was still open after the earlier stake-tile fix.

**After (visual iterations in `cruciblePreparationLayouts.js` + nextStep label casing in `cruciblePreparation.js`):**

1. **Scrim** — bottom-left void→transparent wash via `.orr-door-hero::after` plus void gradients on `.orr-door-hero__words` / `.orr-prep-brief` so RICOCHET FOUNDRY + blurb + purse read over the lit floor.
2. **Foot rail** — `.k-foot` raised (`z-index:6`) with solid void + upward shadow; stronger bottom fade on `.orr-door-hero__art`; `‹ BACK` + ESC keycap matched to new-game / save / tech-tree (bone `#ece6d8`).
3. **Tabs** — one face, uppercase labels, number+label rhythm; selected = Hand underline only (outline only on `:focus-visible`); `.orr-prep-nextstep` muted as `03 ARMORY` / `03 LAUNCH`.
4. **720p Arena fold** — further tighten in `@media (max-height:820px)` (chrome, mode/stake, blurbs); arena strip thumbs hidden so both name rows sit above the foot.
5. **1080p lift** — type/spacing scale in the 1800–2199×≥1000 band (full `zoom:1.12` clipped the foot on this denser screen, so lift is applied without CSS zoom).

**Walk:** `node scripts/ui-bench.mjs --shot=crucible-door --viewport=1920x1080` and `--viewport=1280x720` — exit 0; measured clean. Selectors/IDs (`sf-prep-tab-*`, classes) unchanged.

**Artifacts:** screenshots are attached to PR #322 rather than committed (kept out of the repo per review).

**Code touched:** `src/ui/orrery/cruciblePreparationLayouts.js`, `src/ui/orrery/cruciblePreparation.js` (nextStep textContent casing/format only). No loadout data, audio, flight HUD threat markers, engine/render, or selector/ID changes.

**Next:** `crucible-results` (follow-up PR; #322 is frozen at Armory + Refit).

---

## Crucible Armory (`crucible-draft`) — session notes (2026-10-12)

**Before:** Armory foot was a thin top border only (no void backing/shadow); ESC / 1–3 / Tab rode as bare hint glyphs without stack keycaps; secondary copy (`.sf-cru-sub`, wallet span, filter rest, card verb/price, search placeholder, crew/object labels, reading verb/act, build summary) leaned on washed `--dp-ink-dim`; selected filter Hand underline was 1px; search bottom rule faint; selected catalog card Hand wash/edge soft at 1080.

**After (CSS-only in `cruciblePreparationLayouts.js` under `${A}` — door `${D}` untouched):**

1. **Foot rail** — solid `rgb(5 7 10)` void + short upward fade (`0 -10px 14px`, see HOLD fixes) + stronger top rule (`bone / .16`); Launch stays a bone/hot **word** (not a Hand fill slab); Rearrange / secondary words dimmer hierarchy; `.sf-cru-kbd` + `.orr-armory-keycap` / nested kbd styled as stack keycaps (padding, bone/0.5 border, inset shadow); `.sf-cru-fine` contrast up.
2. **Secondary contrast** — dim copy raised toward bone ~0.78–0.92 (sub, preview, cradle, wallet span, filters, counts, card verb/price/name, crew/object labels, reading verb/act/blurb, build summary, refusal, note).
3. **Filters + search** — selected filter Hand underline 2px + soft glow; rest filters brighter; search rule `bone / .28`; placeholder less washed.
4. **Selected card** — brighter name; stronger Hand wash + 2px Hand edge bar (overrides older pointer clip so the bar reads over the list).
5. **1080p lift** — type/spacing nudge in 1800–2199×≥1000 band **without** CSS zoom (door lesson: zoom clipped the foot). 720p short-height / narrow rules left intact.

**Walk:** `node scripts/ui-bench.mjs --shot=crucible-draft --viewport=1920x1080` and `--viewport=1280x720` — exit 0; measured clean both. Selectors/IDs and loadout catalog data unchanged.

**Artifacts:** screenshots are attached to PR #322 rather than committed (kept out of the repo per review).

**Code touched:** `src/ui/orrery/cruciblePreparationLayouts.js` (Armory `${A}` polish block only).

### Armory descriptions — ui-polish-25 (2026-10-13)

Player-truth graded every Swarm armory offer "undescribed" (63 of the 67; the other 4 are refit rows). Two causes, both UI:

1. **No lit row after a refresh.** Each refresh rebuilds the shelf, and `_paintReading` returns early when the reading is unchanged, so the rebuilt cards never got `is-lit` / `aria-pressed`. The reading panel kept its sentence, but nothing on the rail owned it (no Hand bar either). `_buildCard` now lights the row being read. Bench `readArmory`: 78/78 `none` → 78/78 `reading`.
2. **761–1150 wide, the sentence sat under the schematic.** The single reading column kept `grid-template-rows:minmax(0,1fr)`, so the 350px visual overflowed onto the words (1024×768, 960×540). Rows now size to content and the words lead; at ≤640 tall the word margins close up so the purchase key is whole at 960×540. The schematic, crew and jig follow below in the panel's scroll.

1280×720, 1920×1080 and 390×844 differ only in the lit card (the Hand bar is back). Loadout data untouched. Shots: `ui-shots/armory-desc/{before,after2}/`.

**Fitted refit rows:** each fitted hardpoint now also carries `sentence` from `arsenalIdentity` (painted under the name with `orr-hp__contrast`). `contrast` stays `null` for fitted parts (INF-036 unchanged). Spare-vs-spare contrast on empty hardpoints is untouched.




---

## Crucible Refit (`crucible-refit`) — session notes (2026-10-12)

**Before:** Foot was a thin top border only (no void backing/shadow); ESC / Space·Y / hold F·X rode as bare hint glyphs without stack keycaps; secondary copy (`.sf-cru-sub`, slot tags, bare values, contrast lines, spare stats, fit count, foot fine print) leaned washed (~0.5–0.66); selected spare underline was 1px bone; Enter on lit FIT was a bare hint; 1080p type felt small for the plate.

**After (CSS under `${R}` in `cruciblePreparationLayouts.js` + `injectCruciblePreparation()` from refit mount — door `${D}` / armory `${A}` untouched):**

1. **Foot rail** — solid `rgb(5 7 10)` void + short upward fade (`0 -10px 14px`, see HOLD fixes) + stronger top rule (`bone / .18`); Take-the-win lamp stays Hand word (not a fill slab); Keep Going stays bone/hot word; `.sf-cru-kbd` stack keycaps (padding, bone/0.5 border, inset shadow); fine-print keynotes toward bone ~0.86.
2. **Secondary contrast** — sub, row labels, slot tags, bare values, contrast, spare stats, empty lines, scales words, fit count raised toward bone ~0.72–0.86.
3. **Lit spare / Enter** — checked spare Hand underline 2px + soft glow; open-offer dashed Hand rule; lit FIT `::after` Enter restyled as stack keycap.
4. **1080p lift** — title/sub/hardpoint type + foot words nudged in 1800–2199×≥1000 band **without** CSS zoom. Short-height (`max-height:820px`) keeps a shorter foot + raised fit count so "N of M fitted" stays clear of the rail (720p measured clean after the bury fix).

**Walk:** `node scripts/ui-bench.mjs --shot=crucible-refit --viewport=1920x1080` and `--viewport=1280x720` — exit 0; measured clean both. `--walk` exit 0 (controls respond; Autocannon line is a pre-existing no-picture-change tangle). Selectors/IDs and loadout catalog data unchanged.

**Artifacts:** screenshots are attached to PR #322 rather than committed (kept out of the repo per review).

**Code touched:** `src/ui/orrery/cruciblePreparationLayouts.js` (`${R}` polish block), `src/ui/screens/crucibleDraft.js` (inject call only). No assets/, audio, HUD threat markers, engine/render, or selector/ID changes.

**Next:** `crucible-results` in a follow-up PR.


---

## Pause (`pause`) — ui-polish-6 (moved off ui-polish-5) (2026-10-12)

New overlay `src/ui/orrery/pauseLayouts.js`, injected from `pause.js` (one import + one call beside `injectOrreryScreens`). Scoped to `.of-pause.orr-pause` / `.orr-pause--phone`; selectors/IDs unchanged. Composition in `screenLayouts.js` + deckplate PAUSE left alone.

**Before:** title/eyebrow soft on the held world; FLIGHT BRIEF kicker + save line sat ~.55–.6 bone; foot keys were bare glyphs (screenLayouts stripped the boxes); bank verbs on the dial read thin; no 1080p lift; phone brief had little hierarchy.

**Pass 1–2 (CSS only):**
1. Title hotter bone + deeper void halo.
2. Brief hierarchy — kicker ≥.9 with a trailing hairline, name hot bone, next ≥.86, save ≥.82, deeper shade pool, ice ring reading brighter.
3. Verb ladder — rest dial words ≥.86; sector legends ≥.92; phone group heads + bank verbs clearer with more row gap.
4. Foot — settings-rail keycap boxes (`ESC`/`P`/`F5`/…) + brighter verb labels + underline rail under the keys strip.
5. 1080p band — zoom **head + brief + foot only** (`--sv` 1.12); dial stage untouched (arcRail places from `getBoundingClientRect`).
6. Short-height tighten; phone brief kicker rule.

**Walk:** `node scripts/ui-bench.mjs --shot=pause --walk` — exit 0; measured clean; 19 controls exercised; selectors/IDs unchanged. Checked at 1280×720, 1920×1080, 390×844.

| Shot | Path |
|---|---|
| Before (@720) | `/workspace/spaceface-scratch/ui-shots/pause-20261012-1515/before/pause-1280x720.png` |
| After (@720) | `/workspace/spaceface-scratch/ui-shots/pause-20261012-1515/after/pause-1280x720.png` |
| Before (@1080) | `/workspace/spaceface-scratch/ui-shots/pause-20261012-1515/before/pause-1920x1080.png` |
| After (@1080) | `/workspace/spaceface-scratch/ui-shots/pause-20261012-1515/after/pause-1920x1080.png` |
| Before (phone) | `/workspace/spaceface-scratch/ui-shots/pause-20261012-1515/before/pause-390x844.png` |
| After (phone) | `/workspace/spaceface-scratch/ui-shots/pause-20261012-1515/after/pause-390x844.png` |

**Next:** HUD chrome / dialogs / stations; re-verify earlier screens on fresh assets; SANDBOX-over-nose remaining on main menu @1080p.


## Shipworks stage takes the pointer again — session notes (2026-10-13, ui-polish-21)

**Before:** two pointer bugs on the Shipworks dock, found while checking the rename field. (1) The rename field ("Name this hull") couldn't be clicked at any size, including phone; only Tab reached it. `.sx-sw__nameplate` is `pointer-events:none` and the input inherits it, and the kit's `input.k-input:hover { pointer-events:unset }` hands the `none` back on hover. (2) At ≤1100 wide, where the hull drawing doesn't lay out and the live hull shows, the empty jig box (z3) still took the pointer. Slot callouts, LEFT / CENTER / RIGHT and the hull drag all hit the jig instead, so nothing on the stage responded to the mouse.

**Fix:** `station.css`: the rename field takes the pointer back, with `:hover`/`:focus` arms that outrank the kit rule. `shipworksLayouts.js`: `.orr-sw-jig:not(.orr-hull--on) { pointer-events:none }`. When the jig is laid out it keeps the pointer, and the nameplate's existing z4 keeps the field above it.

**Checked:** click then type works at 960×540, 1280×720, 1920×1080, 390×844 and 844×390. At 960, 1024 and 1100 the hit-tests reach the callout, the camera word and the canvas, and a click on the Weapon callout opens its chooser. Idle screenshots are pixel-identical to master at every size. Shots: `ui-shots/rename-click/`.

## Live-boot survey (2026-10-12, real game booted in headless Chromium, 1280×720 + 1920×1080)

Captured by booting the actual game (`node server.js`, Playwright + SwiftShader) and clicking through the main menu the way a player does. Images: `docs/ui-polish/before/*.jpg`, `docs/ui-polish/after/*.jpg`.

Screens reached: Main menu (+ keyboard focus), Load, Crucible (Encounter step), Settings (Audio / Video / Gameplay / Access / Controls), Credits, New Game.
Not reached from the menu: **Archive**, **Achievements** and **Quit** clicks left the main menu on screen (no visible response in a browser build — verify they are wired or give feedback), **Circuits / Sandbox** were not clickable in time (likely locked / gated — needs a visible locked state). In-flight HUD, pause, dialogs and station screens still need a live run to capture (next session).

### Prioritized issues (P0 = broken / clipped, P1 = readability / consistency, P2 = finish)

| Pri | Screen | Issue |
|---|---|---|
| P0 | Settings @ ≤1500px | Label column was 150px: "Sun shadows (ships/rocks/stations)", "Emergency dynamic resolution", "Mute when the window loses focus", "Steer left (classic scheme)" wrapped to 3 lines and rows went ragged. **Fixed** (190px labels, wider pane, tighter tracking + `text-wrap:balance`). |
| P0 | Crucible @ 720p | Stake tiles clipped their own text ("PAYS ×0.75 ·" cut mid-line, "100% / PRESSURE" wrapped) and the Arena row fell below the fold. **Fixed** for the tiles (earlier) and Arena fold (this session: short-height tighten + arena thumbs hidden so both name rows clear the foot). |
| P0 | Archive / Achievements / Quit | Archive and Achievements open their screens on the bench walk. **Quit fixed in #332** (hidden in the web build). Still to confirm Archive/Achievements in a live browser build. |
| P1 | Settings @ 1080p | All legends 12px on a 1080p screen — tiny. **Fixed** with a 1.12 composition zoom between 1800–2199px (the existing 1440p/4K zoom rules already did this above). |
| P1 | Crucible | Hero arena title ("RICOCHET FOUNDRY") and its blurb sit straight on bright 3D art without a scrim — blurb unreadable over the lit floor. **Fixed** (void→transparent scrim under words + brief). |
| P1 | Crucible @ 1080p | The 3D hull in the bottom-right renders over BACK / ESC and the footer hint. **Fixed** (foot z-index + solid void backing, stronger art bottom fade, `‹ BACK` + ESC keycap rail). |
| P1 | Crucible | Step tabs mix three styles: boxed "01 ENCOUNTER", bare "02 SHIP & KIT", and lowercase "03 / Armory". **Fixed** (one uppercase tab face; selected = Hand underline; muted `03 ARMORY` / `03 LAUNCH`). |
| P1 | Settings / Video | Live HUD preview's FOV readout collides with the speed dial at 1280 width. **Fixed** (ui-polish-28, see § Settings / Video — FOV reading clears the Speed Dial). |
| P1 | Settings | Value numerals (52%, 1.00x) use the thin read face while the rest of the row is Archivo legend caps — reads as two different products. |
| P1 | Main menu | First Tab press jumps to "Credits" in the footer instead of NEW GAME; focus order should follow the visual ladder. **Fixed** (Tab walks verbs → reference line → Credits/Achievements, wraps). |
| P1 | Main menu | SPACEFACE wordmark sits on top of the orrery rings; menu words overlap ring strokes. Needs a clear zone. **Fixed** (dial fades up from under the name; awake verb seated clear of tick + leader). |
| P2 | Load | "No saves yet" is ~50% bone on void, under contrast for body copy. **Fixed** (emph ≥.94, empty detail .92, vacant word .9 + open-berth glow). |
| P2 | New Game | Loadout list ("PULSE LASER · S") is tracked caps at 11px with no column alignment for the size letter (styling only — list data is off-limits). **Fixed** (size column, no ·; contrast + foot keycap). |
| P2 | Settings | Scroll lists fade out at the bottom (Engine trails, Boost / Dash) without a scroll affordance. |
| P2 | Credits | "0% READ" dial read as a loading bar. **Fixed** — label is now "OF REEL"; foot keycap + contrast pass. |

## Design direction (consolidated)

The game already ships a mature system: Deckplate tokens (`--dp-*`) + ORRERY instruments + the `--sf-*` semantic colour set in `styles/ui.css`. The direction is **unify and enforce, not replace**.

- **Palette:** void `#0a0c10` / surface `#12161c`; bone ink `#dfe3e8` for copy (≥ 7:1), calm `#9aa4b0` for chrome; one amber Hand (`--dp-hand`, ~`#f2b950`) for focus/selection only; `--sf-you` green gains, `--sf-foe` red threat, `--sf-goal` amber objectives; ice blue only for live data. No new hues.
- **Type scale** (already bundled, all OFL in `styles/fonts/`): Archivo variable (wdth 62–125) for display titles (900/125) and legends (700/62–86); Instrument Sans for body/prose; Bricolage Grotesque for hero numerals; Spline Sans Mono only for Asteroid Works. Steps: 12 / 13.5 / 15 / 19 / 24 / 29 / 48–96 (title clamp). Minimum legend 12px at 720p; scale the composition (zoom) at 1080p+ rather than per-rule font bumps.
- **Spacing grid:** 4px base (`--sp-1..6` = 4/8/12/16/24/32); screen gutters `clamp(22px, 3.2vw, 64px)`; row minimum 40px (720p) / 50px (1080p).
- **Component set:** ladder nav + Hand marker, graduated Scale slider, switch-word pair on rail, choice tile with lit underline (`.orr-tile`), keycap / bind dial, primary amber key (`.orr-prep-continue`), footer "‹ BACK ESC" link, live preview plate. Every interactive one needs: rest / hover / focus-visible (amber 2px) / pressed / disabled (50% + "locked" word).
- **Custom elements needed:** locked-state treatment for gated menu items (Circuits/Sandbox), scrim component for text over 3D art, toast/notice for menu actions that do nothing in the browser build, scroll-edge affordance for long setting lists.
- **Open-source assets (only if needed; none added yet):** icons — Lucide (ISC) for generic UI glyphs, game-icons.net (CC BY 3.0, **attribution required** in Credits) for weapon/module glyphs, Kenney UI packs (CC0) for placeholder controller/keyboard prompts. Fonts — current bundled OFL faces cover the need; Rajdhani/Inter (OFL) are not necessary and would dilute the identity. Any addition goes in `third_party/` with its licence and a Credits entry.

## Done this session (stacked commit)

- `src/ui/orrery/settingsLayouts.js`: ≤1500px label column 150→190px, pane 480→516–560px, nav 168–176px, tighter label tracking + balanced wrap; ≥1501px label 236px; 1.12 zoom for 1800–2199px wide screens. Credits: foot keycap rail, `Of reel` progress label, contrast, short-window orrery-num hide, 1080p zoom.
- `src/ui/orrery/cruciblePreparationLayouts.js`: ≤820px tall — stake mark hidden, pressure/yield single-line with tightened tracking, so tiles no longer clip.
- `src/ui/orrery/cruciblePreparationLayouts.js` + `cruciblePreparation.js`: Encounter door scrim, unified tabs, foot keycap rail, Arena fold @720p, 1080p type lift.
- `src/ui/orrery/saveLayouts.js`: save-load empty-state contrast (emph/detail/vacant/filmstrip), open-berth glow, settings-matched `‹ BACK` + ESC keycap foot rail, 1.12 zoom @1080p band. Game-over styles unchanged.
- `src/ui/orrery/helpLayouts.js`: Help foot rail `‹ CLOSE` + ESC keycap; ladder/reading/search contrast; fixed broken search-rule CSS; reading shade deepened. Selectors/IDs unchanged.
- `src/ui/orrery/archiveLayouts.js`: Codex foot keycap rail, secondary contrast, rail/tick brighten, 1080p zoom. Selectors/IDs unchanged.
- `src/ui/orrery/archiveLayouts.js`: Mission Log foot keycap rail, secondary contrast, beam/lane/dial brighten, 1080p zoom. Selectors/IDs unchanged.
- `src/ui/orrery/constellationLayouts.js`: Achievements foot keycap rail, secondary contrast, dial/stage chrome brighten, 1080p (+1440/4K) zoom. Selectors/IDs unchanged. RESEARCH block untouched.
- `src/ui/orrery/statisticsLayouts.js` + `src/ui/screens/statistics.js`: Statistics ORRERY foot keycap rail, reading contrast, shade pool, 1080p zoom, short-frame LAW fit. Selectors/IDs unchanged.
- `src/ui/orrery/newGameLayouts.js` + `src/ui/screens/newGame.js`: New Game foot keycap rail, secondary contrast, loadout size column, 1080p left-column lift (the screen-wide zoom was replaced on ui-polish-5). Selectors/IDs and loadout data unchanged.
- `src/ui/orrery/constellationLayouts.js` + `src/ui/screens/techTree.js`: Tech Tree / Research foot keycap rail, hour-verb curve clip (no dial tangle), secondary contrast, rim chrome, 1080p zoom. Selectors/IDs unchanged. ACHIEVEMENTS block untouched.
- `src/ui/orrery/pauseLayouts.js` + `src/ui/screens/pause.js`: Pause title/brief/ladder contrast, foot keycap rail, 1080p head/brief/foot lift (dial untouched). Selectors/IDs unchanged.
- `src/ui/orrery/raceBoardLayouts.js` (+ inject in `raceBoard.js` / `physicsVenues.js`; bench loader + catalog id `raceBoard`): Circuits and Physics boards reflowed as described above. Selectors/IDs, data and launch logic unchanged.
- No selectors/IDs changed; no engine/render, audio, loadout data or HUD threat-marker code touched.

## Crucible results (`crucible-results`) — ui-polish-5 (2026-10-12)

New overlay `src/ui/orrery/crucibleResultsLayouts.js`, injected from the results mount (one import + one call in `crucible.js`). Scoped to `.sf-crucible-results.has-deathdial`; no DOM, selector or ID changes.

- **Fixed (P0):** the left column was two clipped scrollers. At 720p *What you built* ran into *The run* and the share codes faded out; at 1080p *Share* showed a title with nothing under it. Now it is one scroll column in reading order: figures, the run, the build, results sheet, stunt combo, share. A bottom fade shows there is more.
- **Fixed (P0, 390×844):** the dial sat on top of the column and the figures overlapped ("6 31 24 88"). The phone layout now stacks title, dial, take, column, with the ways out docked at the bottom on a solid fade. The figures are a 2×2 grid, the wave engraving is hidden where it hit STARBOARD, and the short hit legend replaces the long one.
- **Finish (P1):** each band title runs into a hairline. The share codes are framed fields with an underlined save link. Story and lead copy is brighter. The 1080p band lifts the figures, copy and build verbs.
- Checked at 1280×720, 1920×1080 and 390×844, including scrolled to the bottom. Shots are in `/workspace/spaceface-scratch/ui-shots/results/` (not committed).


## Crucible results @960×540 and phone — LAST 5 HITS stays, foot stays clear (2026-10-13, ui-polish-27)

**Before:** At ≤600px tall (960×540) the death-dial caption's LAST 5 HITS strip printed through BACK TO THE HANGAR / MAIN MENU: the full-width foot row left the dial host ~400px, and the caption sits past its floor (`cy + Rc + 72`). The first fix hid the strip, which Code Work's review (glassres res2) rightly rejected: the strip is required, and the caption box still met RUN IT AGAIN. On a phone the foot sat at the end of the scroll, so at scroll 0 it was off-screen, and the 420px dial let its caption spill into THE TAKE.

**After (`src/ui/orrery/crucibleResultsLayouts.js` only):**
- `min-width:701px` and `max-height:600px`: the ways-out stack under the left column (RUN IT AGAIN on its own line, Seed under it, then BACK TO THE HANGAR / MAIN MENU; the Enter chip drops at this size) and stay left of the dial host. The dial runs the full right-hand height, so the whole caption shows (killer, detail, vitals, the LAST 5 HITS strip and its legend) with nothing hidden. The left column sits above the dial's dark pool, so SALVAGE no longer fades.
- 601–720 tall: the dial only clips, so a long killer name cannot bleed into the foot.
- Phone (≤700 wide): the foot is docked (`position:sticky; bottom:0`) on an opaque void, so it is always on-screen. The dial gets `clamp(470px, 100svh − 240px, 620px)`, so its caption ends above the foot, and it drops the tell line, which THE RUN repeats below. `ui-bench` reports THE TAKE "under" RUN IT AGAIN at 390; that is the band scrolling beneath the docked foot, which is expected.
- 1280×720 and 1920×1080 are unchanged.

Selectors/IDs unchanged. `test/crucible-results.test.mjs` has one failure (`the player dying ends the run…`, 0 !== 900). It fails the same way without this change. Shots: `/workspace/spaceface-scratch/ui-shots/res374/{tip,after}/` (not committed).

**Still open (elsewhere):** Station Ledger CYCLE/−750 tape collisions (JS geometry); Market "Raw & rare" bury at 960; Contracts TRACKED badge can sit off-frame.


## New Game yard fixes (`new-game`) — ui-polish-5 (2026-10-12)

CSS only, in `src/ui/orrery/newGameLayouts.js`. No DOM, selector, ID or loadout-data changes.

- **Fixed (P0, 1080p):** HITCH / SKATER sat on the *First 15 minutes* route and WASP was cut by the hero ship. Cause: the screen-wide 1.12 zoom from the earlier New Game pass. The yard carousel places hulls and names from `getBoundingClientRect`, so the zoom scaled those offsets twice. The zoom now applies only to the left column (header, fields, foot, fine print), the same way the 1440p rule in `screenLayouts.js` already does it. The yard, stage and route stay at 1:1, and the caption copy and loadout get a small type lift instead.
- **Fixed (P1):** hull names sit above every ship model, with a dark halo, so a hero's engine glow no longer covers a rear name.
- **Fixed (P1, 720p):** SHIELD BOOSTER ran into its size letter. The loadout name column is wider at ≤1366px.
- **Fixed (P1, 390×844):** PELICAN and WASP ran together in the *Start as* row. Names now size to their content, slightly smaller, with a fixed gap.
- Checked at 1280×720, 1366×768, 1920×1080, 2560×1440 and 390×844; `--walk` exercised 12 controls with all three hulls brought to the front. `test/yard-carousel` and the new-game tests pass (50/50). Shots are in `/workspace/spaceface-scratch/ui-shots/ng5/` (not committed).

## Sandbox Launch / phone tiles — session notes (2026-10-13, ui-polish-24)

**Before:** On first paint the Combat Lab and fine-tune (Hull / Hornet) sat in the fixed Launch key's band at 960×540, 1280×720 and 1920×1080. On phone (`data-sf-mobile`), the ladder's flex shrink crushed each scenario tile to the global 44px touch min-height, so titles and descriptions stacked on each other.

**Root cause found in review (Code Work real-game check, 07:37):** `screenManager` writes an inline `display:grid` on every `.dp-frame` root, so in the game this frame was the deckplate head/body/foot grid: the stage got an 8px row at 960×540 and the apron (LIVE TOOLS, pickers, Back) painted over the ladder; at 844×390 the Module/Enemy pickers sat under Launch at first paint and at the end of the scroll. The bench never sets that inline style, so it kept `display:block` and never showed it.

**After (`src/ui/screens/sandbox.js` only):**
1. One layout model in the game and on the bench: the frame pins `display:grid !important` (crest, then the stage as the only scroller) and never scrolls itself. Its `padding-bottom` reserves the Launch band, so the stage box ends above the key and nothing in it can sit under Launch at first paint or at any scroll offset. The hide path's inline `display:none !important` still wins.
2. All the Launch geometry is in one custom property, `--sf-sandbox-dock` (key height + floor gap + air). The frame's reserve, the foot scrim and the key itself read it, and the phone deck restates it over its `!important` 20px `.screen` foot pad. The old 320 / 300 / 120 / 260px numbers are gone.
3. Content keeps its natural height. The ladder is bounded by the stage, not by the viewport (`max(160px, 100% − --sf-sandbox-peek)`), so the rail foot, the COMBAT LAB tick and the panel's first row are always on first paint as the cue that the lab sits below. There's no forced `100vh − 320px` and no dead gap.
4. LIVE TOOLS and Back (the apron) moved into the stage's normal flow after fine-tune, so they can no longer paint over the ladder.
5. At ≤500px tall (844×390) the ladder drops its own bound and the stage alone scrolls. That retires the `min-height:200px > max-height:min(48vh,380px)` fight. Short frames (≤640px) also give back crest top air.
6. Kept from the first pass: tiles are `flex: 0 0 auto`, and the phone deck's `min-height:0 !important` overrides the global 44px touch floor.

Bench, with the game's inline grid forced to match the real cascade, at 960 / 1280 / 1920 / 390×844 / 844×390, on first paint and at the end of the stage scroll: nothing sits under Launch, LIVE TOOLS never overlaps the ladder, and there's no tile-on-tile overlap. COMBAT LAB is on first paint everywhere except 844×390, where the stage is 189px tall. Module/Enemy are reachable above Launch at 844×390. `ui-bench` reports `measured: no tangled…` at all five sizes (phone was previously OFF FRAME). Selectors and IDs are unchanged. Shots: `/workspace/spaceface-scratch/ui-shots/sandbox-launch/review-fix/` (not committed).

**Still open (elsewhere):** Starter / systems fitted @960 and focused rename spacing addressed on ui-polish-27 (see § below). Phone Shipworks callouts fixed on ui-polish-27 (see § below).

## Main menu (`mainMenu`) — ui-polish-5 (2026-10-12)

`src/ui/screens/mainMenu.js` + `src/ui/orrery/arcRail.js` (the `clearOf` mask is used only by the title; the new `seat` option defaults to the old 6px, so pause is unchanged). No selector, ID or DOM changes.

- **Fixed (P1, Tab order):** each `words()` group keeps its one roving Tab stop, and `_syncCurrent` set every reference word to `tabIndex -1`. The result was that the first Tab from the lit verb went straight to CREDITS, and HELP / ARCHIVE / CIRCUITS / PHYSICS / SANDBOX could not be reached with Tab at all. Tab and Shift+Tab now follow the reading order (verb ladder → reference line → Credits → Achievements) and wrap. Hidden Continue and still-loading verbs are skipped, the same as the arrow keys. Arrow keys still move within a group.
- **Fixed (P1, logo over rings):** the old mask cut a tight box out of the rings, so ring strokes ended right against the letters. A crown of rim also stuck out above the kicker. Now none of the dial is drawn above the name. It fades in under the name over about 1.3× the name's height, so the name has open space around it. The mask is a static gradient, not a blur filter, so the orbit's drift costs nothing extra per frame.
- **Fixed (P1, words on strokes):** the awake verb grows 6% toward the dial, so its first letter sat on the tick and the Hand's leader (0px gap at 720p). On the title the verbs now sit half a verb-size further out (18px @720, 23px @1080). The awake word clears the leader by about 12px.
- Checked at 1280×720, 1920×1080, 2560×1440 and 390×844 (phone has no dial; Tab order checked there too). `--walk` exercised 12 controls. Related tests pass, except two failures that also fail on the base commit: `focus-lifecycle` "pushScreen restores the prior exposure" and the credits NOTICE check. Shots are in `/workspace/spaceface-scratch/ui-shots/main-menu-20261012-1425/` (not committed).
- **Resolved:** SANDBOX over the hull's nose (#331, three-line reference line) and the web-build Quit (#332).
- **Was remaining:** at 1080p the reference line's SANDBOX sits over the hull's nose in the key art (this was already true before; it moved about 17px). Archive / Achievements / Quit (P0 above): the bench walk opens Codex and Achievements, and Quit asks to confirm. This still needs checking in a live browser build.
---

## #322 HOLD review fixes (2026-10-12)

1. **Phone margin:** the 200px right gutter on Armory `.sf-cru-preview` / `.sf-cru-cradle` now lives under `@media (min-width:761px)`; the base rule is `margin-right:0`, so ≤760px keeps full text width (390×844 measured: preview 354px wide, margin 0).
2. **Footer shadow:** Armory and Refit `.k-foot` shadow cut from `0 -28px 40px 12px` / `0 -32px 48px 16px` to `0 -10px 14px 0 rgb(VOID / .85)` (short-height Refit: `0 -8px 12px 0`). With the card list scrolled to its end, the last row clears the foot top by ~40px at 1280×720, 1920×1080 and 390×844.
3. **Keycap scope:** dropped bare `kbd` and generic `.k-kbd` / `.dp-kbd` from the keycap rules; they now match only `.k-foot .sf-cru-kbd` and `.sf-cru-fine .orr-armory-keycap`.
4. **This file:** stale "no commit" note and duplicate Next lines removed; code touched is `cruciblePreparationLayouts.js` + the one-line inject in `crucibleDraft.js`.
5. **Scope:** #322 is frozen at Armory + Refit; later screens go to a new PR.
6. **PNGs:** the eight `docs/ui-polish/crucible-*.png` files are removed from the PR; evidence lives in the PR conversation.

## Phone Codex — session notes (2026-10-13, ui-polish-22)

**Before (390×844):** the kit hang column is ~480×k-s, so the stage track collapses to 0px. The subtitle prints through the unlock dial labels, the absolute plate sits on the entry ladder, and the wedge fans across the hang. **Before (844×390):** ARCHIVE / LEDGER on the section scale paint past CLOSE.

**After (`archiveLayouts.js` only, `data-sf-mobile="1"`):** one column — title (CODEX → dials → subtitle), plate in flow, hang (sections + ladder, clipped), reading, foot docked on a fade. Landscape ≤560px tall hides the plate and dial words so the scale scrolls inside the hang and CLOSE stays clear. Desktop 801–1100 is unchanged here (#356). Selectors/IDs unchanged. Shots: `ui-shots/codex-phone/` (not committed).

**Code Work review fix (HOLD notes):** Landscape ≤560px is now hang | reader side-by-side (CSS grid) so "THE EIGHT BEATS", the entry title, and the first sentence show on first view with CLOSE clear. The thin rule through the reader "0" was `.orr-extent::before` (scroll thumb at `left:7px`) on the reading article — parked in the entry's left gutter on phone. The ladder Hand's bone dot is pulled left (`--orr-hand-x:6px` / `4px` landscape) with extra row padding so it clears the leading B. Portrait stack kept. Desktop 1280/1920 unchanged within shot noise. Shots: `ui-shots/codex-phone/review1/`.

**Code Work re-review fix (04:58 HOLD):** Landscape section rail is 104px (was 86px), so DISCOVERIES shows in full again. Landscape dials put each word beside its dial (row stays 26px), so the fractions keep their category. Phone section leaders are shorter (8/10/12px) so the current tick no longer strikes the label's last letter. Portrait: 7 dials fit one row (SURVEY no longer wraps alone), the plate is 140px, and the reader takes priority over the hang (hang min 150px), so the first entry's full first paragraph shows above PREVIOUS/NEXT at 390×844 (first line at 360×740). The `.orr-extent` comment now says the thumb is clipped out of view, not parked. Desktop 960/1280/1920 unchanged within shot noise. Shots: `ui-shots/codex-phone/review2/`.

## Market family ladder @960 — session notes (2026-10-13, ui-polish-28)

**Before (960×540):** the short-berth browser stands families as a vertical ladder beside the register (`max-width:1100` × `max-height:800`). The ladder column and the rail shared only ~4px of air, so the register spine / Hand ticks sat on the ends of **RAW & RARE** and **RESTRICTED**. The find field ("Find a commodity") stays on the mode line and was never the burier — the leftover wording was off.

**After (`src/ui/orrery/marketLayouts.js` only):** same short-berth block — `grid-template-columns: max-content minmax(0,1fr)`, `column-gap:24px`, filters `width/min-width:max-content` + `z-index:1`, filter letter-spacing `.08em` / `white-space:nowrap`. Measured gap filter→rail ~16px (was ~4px); RAW & RARE and RESTRICTED read clear of the spine. Selectors/IDs and `marketPresentation.js` labels untouched.

**Checked:** 960×540 (fix), 1280×720 / 1920×1080 (horizontal filters unchanged within shot noise), 390×844 (phone Market layout is `mobileScreenLayouts.js` — frozen on #374; phone Dismiss/hold toast overlap left alone). Main-menu SANDBOX-over-nose at 1080p surveyed, not changed this session (arcRail seating).

**Shots (not committed):** `/workspace/spaceface-scratch/ui-shots/polish28/{before,after,compare}/`.

**Branch:** `ui-polish-28` pushed; no PR (freeze on #371/#374).

## Chart inspector tabs — session notes (2026-10-13, ui-polish-28, second commit)

**Main-menu SANDBOX-over-nose @1080p:** re-checked, no change. The live title paints the same authored plate (`backdrop-title.jpg`, `.k-world--plate`, cover/center) as the bench. Since #331's three-line reference line, SANDBOX ends ~240px left of the hull nose at 1920×1080 (~40px at 960×540). The "Was remaining" line under § Main menu is stale.

**Before (all desktop sizes):** the nine inspector tabs (Overview … History) were one row of ~875px in a 288px column (wide) or 227px column (compact 761–1179). The deckplate `repeat(auto-fill, minmax(84px, 1fr))` template still sized every track at 84px, so OVERVIEW (87px of type) lost its O to the inspector's clip. ECONOMY through HISTORY sat past the right edge, where no pointer could reach them. On short screens ZOOM: SHIP AND DESTINATION was clipped too (`ZOOM: SHIP ▯` @720, `ZOOM` @540).

**After (`src/ui/orrery/chartLayouts.js` only, ≥761px wide):** the tab words wrap onto the scales the tab instrument already draws per row (the same wrap non-English locales already used). That's 3 rows at 1280/1920 and 4 rows at 960/1024 (11px, .08em). The row gap clears the major ticks. The Hand springs to the open tab on any row (checked: Discovery @960). The framing words wrap to a second row instead of clipping, and in compact mode ZOOM breaks onto two lines. Phone (≤760, `mobileScreenLayouts.js`, frozen on #374) is unchanged. Selectors/IDs are unchanged.

**Trade-off:** at 960×540 the extra tab rows take ~90px from the inspector body. The body already scrolls under its fade, and ENGAGE ROUTE stays pinned.

**Checked:** 1920×1080, 1280×720, 1024×768, 960×540, 390×844 (phone identical apart from map animation). `check:map-information-depth` passes all 18 sections. `test/map-one-answer.test.mjs` fails the same way on master without this change.

**Shots (not committed):** `/workspace/spaceface-scratch/ui-shots/polish28b/{before,after,compare}/`.

*If #374's REVIEW.md leftovers sections conflict with this file on merge, keep both. This section only covers `chartLayouts.js`.*

## Pause — flight brief off the dial's banks on short desktop (ui-polish-28)

**Before (960×540):** the flight brief (TRACKED job, % ring, Next, Saved) is a reading pinned top-right at `top ≈ 82px`, about 230px tall. On a short frame the dial's SHIP and REFERENCE banks (Operations, Local Map, Codex, Achievements, Statistics) run out to x ≈ 720–840 at y ≈ 240–300, the same band where the brief's Next and Saved lines sat, so the two sets of words printed over each other. The same collision showed at 960×641, 800×600, 800×500 and 720×480. On phone portrait, the inline kind word ran into the job's name ("TRACKEDContract 47-A").

**After (`src/ui/orrery/pauseLayouts.js` only, CSS):**
- **Short desktop** (`≤640` tall, or `≤720` tall at `≤1100` wide): the brief becomes a top-right reading level with PAUSED (`top clamp(40px, 8vh, 52px)`, width `min(400px, 42vw)`). The name is 19px, the ring is 30px with a 22px numeral, and the line gaps are tighter. At 960×540 it ends at y 230, 13px above the first long bank (SHIP at 243). It clears every bank row at 960×540/600/641/700/720, 1024×576/600/700, 1100×640/720 and 1280×600.
- **Very short window** (`≤520` tall): the FLIGHT BRIEF kicker and the save note are hidden (F5/F9 stay on the foot), so the brief ends at about y 170 and clears the ladder at 800×500 and 720×480.
- **Phone:** `.orr-brief__kind` is block-level, so TRACKED stands on its own line over the name.

1280×720 and 1920×1080 are pixel-identical to before. Selectors and IDs are unchanged, and arcRail is untouched. The `--walk` at all four sizes reaches all 18 controls.

**Still open (not this pass):** at ≤800 wide × ≤500 tall the foot's keycaps wrap to two lines and the second line rises into EXIT / MAIN MENU. This is a foot/dial height issue that predates this change. Also, the Missions route strip (FROM / ROUTE PENDING / TO) is still clipped at 960×540, and its `H…` names truncate.

**Shots (not committed):** `/workspace/spaceface-scratch/ui-shots/polish28c/{before,after,compare}/`.

## Pause — foot keycaps on one line, clear of EXIT / MAIN MENU on narrow short frames (ui-polish-28)

**Before:** the six keycaps + verbs (ESC Resume · P Photo · F5 Quick save · F9 Quick load · ↑↓ Category · ←→ Item) need ~790px at the rail's full spacing, so below ~890 wide CATEGORY / ITEM wrapped onto a second line. The foot is a grid row sized by its content, so the extra line grew the foot upward, and on short frames the first line rose into the dial's last bank. At 800×500 PHOTO / F5 / QUICK SAVE printed on top of EXIT / MAIN MENU, and at 720×480 the strip covered DEV / SANDBOX and EXIT. At 880×540 the brief's save note also printed over the GAME bank's LOAD, because below 960 wide the brief starts left of that bank's end.

**After (`src/ui/orrery/pauseLayouts.js` only, CSS):**
- **701–900 wide:** keycaps 10.5px / .1em with 5px padding, verbs 10.5px / .1em, verb gap `clamp(9px, 1.4vw, 14px)`. The strip is one line (659px at 800 wide).
- **701–760 wide:** one more step (10px, .06–.07em, 9px verb gap), so the strip holds one line down to 701 wide (590px at 720).
- **701–900 wide × ≤560 tall:** the foot's row gap closes to 2px, so the keys sit lower (at 800×500 the keycap top is at about y 386, 20px under EXIT at about y 366), and the brief's save note is hidden (F5 / F9 stay on the foot).

960×540, 1280×720, 1920×1080 and 390×844 are pixel-identical to before. Selectors and IDs are unchanged, and the dial / arcRail is untouched. `--walk` at 800×500 and 720×480 reaches all 18 controls. The bench reports no overlaps at 701×480, 720×480, 761×500, 800×500/520/560/600, 850×540, 880×540, 900×500/560 and 920×500 (before: 10 at 800×500, 10 at 720×480, 4 at 880×540). Focused tests pass: `pause-save-line`, `wave-c3-pause-kit`, `pq-194-06-pause-shell` and `sf-275-pause-ownership`.

**Still open (not this pass):** at ≤800 wide the dial's REFERENCE bank runs STATISTICS (and ACHIEVEMENTS at 701) past the right edge (800×600, 761×500, 720×480, 701×480). That is arcRail bank placement, which this pass did not change. The Missions route strip at 960×540 (archiveLayouts.js, frozen on #374) is also still open.

**Shots (not committed):** `/workspace/spaceface-scratch/ui-shots/polish28d/{before,after,compare}/`.

## Pause — REFERENCE bank stays on the glass at ≤800 wide (ui-polish-28)

**Before:** the dial seats each category on one line (head, then its verbs). When a line runs past the right edge, the width split continues it on a new stop, but an arc carries at most nine stops and Pause already uses eight, so only one split is available. Below about 820 wide, SHIP took that split, and REFERENCE (HELP / CONTROLS · CODEX · ACHIEVEMENTS · STATISTICS) stayed whole and ran off the right edge: STATISTICS at 800×600, 780×560, 761×500, 760×540 and 720×480 (it ended at x 853 on an 800 frame), and ACHIEVEMENTS too at 701×480. The split also planned from a head width carried over from the last build, which could be measured before the display face loaded. So whether 960×540 split REFERENCE depended on build timing, and the greedy pack left STATISTICS alone on its continuation row.

**After (`src/ui/orrery/arcRail.js` only, grouped dial = Pause only):**
- **Tight form:** build() first plans the normal seat. If a row still overruns after the splits the stops allow, the host takes `orr-arcrail-host--tight`, which applies the same verbs in a narrower cut (`wdth` 76, .07em tracking; awake `wdth` 80), eases the head tracking from .28 to .16em, and sets the verb gap to 13px and the head bridge to 24px (from 22 and 30). The verbs are re-measured under that form before it plans. With it, SHIP fits whole (all four verbs, LOCAL MAP included) and the spare stop goes to REFERENCE. At 800×600 STATISTICS ends at x 574, and at 701×480 at x 533. Frames that already fit (≥ ~820 wide) never take it.
- **Balanced split:** a split row keeps the same number of lines, but its verbs are dealt to minimise the longest line, so REFERENCE reads HELP / CONTROLS · CODEX over ACHIEVEMENTS · STATISTICS rather than three over one. Ties keep the greedy deal.
- **Fresh head measure:** the split plans from each head engraved off-dial at a fixed size in the form being planned, with the current fonts, rather than from a width carried from the previous build. 960×540 now always splits REFERENCE (a 2+2 deal, where it used to be 3+1 with STATISTICS alone).

820×600, 860×600, 1280×720 and the phone (390×844 `--phone`) are pixel-identical. 1920×1080 differs only in the dial's drift, with the same rows. 900×600 and 960×540 change only by the 2+2 REFERENCE deal. The bench reports no overlaps at 701×480, 720×480, 760×540, 761×500, 780×560, 800×600, 820/860/900×600, 960×540, 1280×720, 1920×1080 and 390×844 (before: STATISTICS cut off / off-frame at all six ≤800 sizes, and ACHIEVEMENTS too at 701). `--walk` at 800×600 and 701×480 clicks all 18 controls, and ACHIEVEMENTS and STATISTICS open their screens. The prior foot keycaps and flight brief are unchanged. Selectors and IDs are unchanged. Focused tests pass: `orrery-arcrail-width` (7), `pause-save-line`, `wave-c3-pause-kit`, `pq-194-06-pause-shell`, `sf-275-pause-ownership` and `pause-ship-fit`.

**Still open (not this pass):** the Missions route strip at 960×540 (archiveLayouts.js, frozen on #374).

**Shots (not committed):** `/workspace/spaceface-scratch/ui-shots/polish28e/{before,after,compare}/`.

**Branch:** pushed to ui-polish-28 without a PR while the #371/#374 freeze holds.

## Wingman radial hub stack — ui-polish-28 (2026-10-13 evening)

**Before (960×540):** the ORRERY hub restyle used `padding-top:38px` and a 20px craft-count numeral inside the 124px glass disc. At short windows (≤560 tall / the 960×540 bench) **2 CRAFT** crushed into **TAB**, so the count was only a clipped band of glyphs. 1920×1080 showed the same crush when the dial opened. (Bench "FLYBY / Break the beam on 2 CRAFT" lines are world objective copy overlapping the dial in projection — not hub nodes.)

**After (`src/ui/orrery/wingmanLayouts.js` only):** hub padding is balanced (`14px 10px 12px`), gap 4px, overflow clipped to the disc; title 11px, craft count 14px, TAB 10px with tight line-heights so ALL WINGS → pips → 2 CRAFT → TAB read as four clear rows. Selectors and IDs unchanged; wedge labels / receipts / HUD chrome untouched.

**Checked:** 960×540 (fix + `--walk` 12 controls, measured clean), 1280×720, 1920×1080 (measured clean). Phone left alone (no separate wingman phone shell this session).

**Shots (not committed):** `/workspace/spaceface-scratch/ui-shots/polish28f/{before,after,compare-hub-960.png}/`.

*If #374's REVIEW.md leftovers sections conflict with this file on merge, keep both. This section only covers `wingmanLayouts.js`.*

## Base screen — phone module list, narrow spine, one slot rail (ui-polish-28)

**Before:** on a phone (390×844) the claimed-body screen was broken. Each BUILD MODULE row kept its desktop three-column grid with a nowrap RESEARCH button, so the button ran off the plate and every description wrapped one word per line (the plate scrolled about 4,400px). The slot and Operating Identity rails were horizontal-only, so in one column each tick climbed through the card above it (through "Cargo Depot", and the amber tick 2 through CLEAR SITE STORAGE; the same happened at 561–760 wide). The foot clipped the Esc keycap to "SC", DISPATCH CONVOY wrapped onto two lines, and the moon arc crossed the title. At 960×540 the five module slots wrapped 4 + 1, leaving the fifth slot alone with a tick rising into nothing.

**After (`src/ui/screens/base.js` injected style only, no markup, selector or ID changes):**
- At ≥761 wide the slots sit on one rail in one row.
- At ≤760 the slot and identity rails become the same left spine the module list uses. Ticks and dots hang off it, the active identity's amber tick meets its card, and the 1/2/3 tick numbers hide.
- At ≤560 module rows stack (name, description, cost, then a wrapping RESEARCH button), gutters drop from 44px to 24px, the moon is hidden, and the Esc keycap is hidden (touch). Close and Dispatch Convoy share one line. Phone scroll went from 4,365px to about 2,300px.
- 1280 and 1920 are unchanged apart from a 16px slot gap.

**Checked:** 390×844 (phone, every scroll stop), 700×900, 960×540, 1280×720, 1920×1080, plus the unclaimed `base` at phone and 960. A phone `--walk` showed Build, Deliver and identity controls responding. Remaining bench "buried" findings are content scrolling under the sticky foot, which is by design. Focused tests passed: wave-c4-base-kit, claim-specializations, claim-sensor-post, claim-travel-infrastructure, claim-site-discovery-plates, ui-grammar-matrix.

**Shots (not committed):** `/workspace/spaceface-scratch/ui-shots/polish28g/{before,after,before-scroll,after-scroll}/` and `compare-*.png`.

*If #374's REVIEW.md changes conflict with this file on merge, keep both. This section only covers `src/ui/screens/base.js`.*

## Footprint — 960 reading column, phone stack (ui-polish-28)

**Before:** at 960×540 (WANTED / MARKED / CLEAN) the reading column's answer grid sized its verb column to TAKE AMENDS CONTRACT at full 1080 type, which left each verb's cost a 110px stack wrapping three lines. Only PAY BOUNTY and BRIBE were on the glass, and the costs stacked down the right edge into the fold. The at-rest "Drag or ‹ › to trace" hint ran through the source tokens on the hub rim. On a phone (390×844) the desktop two-column stage stayed in place: the dial shrank to 203px with tier, sector and hub words printed over each other. The reading was a 139px column (the source name cut to "4,200 / CR / BOUN", one word per line), every verb's cost had zero width, and a link line ran down the right edge.

**After (`src/ui/orrery/footprintLayouts.js` only, no markup, selector, ID or dial-geometry changes):**
- At 761–1100 wide and ≤640 tall the reading tightens: a 16px stage gap, a smaller crest, a closer beam and receipts, and verbs at 12px / .1em with 14px between verb and cost. Costs now take one or two lines, so PAY BOUNTY, BRIBE and FIND THE ACCUSER read with their costs before the fold. The drag hint is hidden and the bottom rule tracks .16em so it ends before WANTED.
- At ≤760 the dial stands over its reading as a full-bleed square (capped at 520px) and the screen scrolls as one page. The reading is full width, each cost sits under its verb, and the long record is one column. The keyboard hint and the dial-to-beam link are hidden, and the rule and WANTED track tighter so they part at the bottom gap.
- 1280 and 1920 are unchanged; the only pixel differences are the dial's arrival animation.

**Checked:** 960×540, 1280×720, 1920×1080, 390×844 (every scroll stop) and 700×900 for all three record states. The bench measures no tangled or buried type at 960 or phone. Before, the phone had 6–7 ON TOP OF findings per state. Focused tests pass: footprint-heat-dial, footprint-board-churn, law-08-unwitnessed-footprint. ~~**Still open:** on a ~400px phone dial the hub's "4,200 cr bounty" line comes close to the two lower tokens.~~ Fixed on ui-polish-38, see § Footprint dial: crest pads yield on a small dial.

**Shots (not committed):** `/workspace/spaceface-scratch/ui-shots/polish28h/{before,after,after-scroll}/` and `compare-{960,390,1280-marked}.png`.

## Settings / Video — FOV reading clears the Speed Dial (ui-polish-28)

**Before:** on a narrow preview stage (every desktop size up to 1920, and the phone) the FOV reading was pinned 118px left of the corner fan. At 1280×720, "50°" sat inside the Speed Dial's tick ring and its FOV label crowded the first ability key. At 960×540 it printed "50° FOVWU/S" across the dial's own numeral. On the phone, FOV ran over the first two ability keys.

**After (`src/ui/orrery/settingsPreview.js` only, no markup, selector or ID changes):** `layout()` places the reading from the Cluster's own geometry. It stacks the degrees over FOV, sets it beside the fan in the gap between the dial's ring and the fan, and keeps it above the first key. When the stage is too narrow for that gap (the 133px stage at 960), it sits as one line under the Cluster. Non-compact stages keep the CSS placement.

**Checked:** 390×844, 960×540, 1280×720, 1920×1080 on Settings → Video with the FOV row focused. The bench boxes show ≥25px from the dial ring at 1280 and the reading above key 1 at every size. Focused tests pass: fb-settings-a11y, pro-15-settings-row-ownership, settings-slider-persistence. **Follow-up (ui-polish-28, after #371/#374 merge):** 901–1100 Settings grid now reserves `minmax(250px, 270px)` for the preview (was ~63px at 960 / ~122px at 1024). HULL/SHIELD/ARMOR and the FOV description stay on glass; FOV numeral still reads `50°`. See § Settings preview column @901–1100 below.

**Shots (not committed):** `/workspace/spaceface-scratch/ui-shots/polish28i/{before,after}/settings-video-fov-*.png` and `compare-*.png`.

*If #374's REVIEW.md changes conflict with this file on merge, keep both. This section only covers `src/ui/orrery/settingsPreview.js`.*

## Settings preview column @901–1100 (ui-polish-28)

**Before:** at 960×540 / 1024×768 the ≤1500 rule kept the stage at 516–560px, so the live preview collapsed to ~63px (960) / ~122px (1024). On Video→FOV the description read "How wide the cam…", HULL/SHIELD/ARMOR clipped off the right edge, and the ability fan sat on the Cluster. (FOV readout stacking was already fixed in `settingsPreview.js`.)

**After (`src/ui/orrery/settingsLayouts.js` only, `min-width:901px and max-width:1100px`):** hang stays 176px (GAMEPLAY / CONTROLS intact), stage flexes, preview is `minmax(250px, 270px)` with tighter label/scale tracks so rows still fit. At 960 the preview is 270px; HULL/SHIELD/ARMOR and "How wide the camera sees." stay on glass; FOV numeral reads `50°`. 1280 / 1920 / phone (≤900, preview already hidden) unchanged by this block.

**Checked:** 960×540, 1024×768, 1280×720, 1920×1080, 390×844. Shots: `ui-shots/polish28n/{before,after}/` (not committed).



## Demo end — register at full width, phone stack (ui-polish-28)

**Before:** the register was capped at `min(620px, 52vw)`, so at 960 and 1280 "Shove → Slam → Field pop — 960 points" broke "— 960 points" onto a second line. On the phone the 140px label column left about 40px for the readings, so the chain, the credits and "Fusion Drive M" stood one word per line, and KEEP PLAYING with its ENTER chip ran past the right edge.

**After (`src/ui/orrery/screenLayouts.js`, demo-end block only, no markup, selector or ID changes):** the register column is `min(760px, 72vw)`, so the chain reads on one line at 960 and 1280 (1920 is unchanged). At ≤760 wide each row is label over reading at full width, the dial drops to 64px and still bears on the primary key, the ways out wrap, and the ENTER chip is hidden because a phone has no Enter key.

**Checked:** 390×844, 960×540, 1280×720, 1920×1080. Focused test `demo-mode` passes.

**Shots (not committed):** `/workspace/spaceface-scratch/ui-shots/polish28j/{before,after}/demoEnd-*.png` and `compare-*.png`.

## Comms fan — phone sky band (ui-polish-28)

**Before:** on the phone (390×844) the fan kept the desktop placement, `bottom:84px` and `44vw` (172px) wide, so it sat on the bottom cluster. HEAVE TO ran into the contacts list, the hub and its trace ran over the ability list (DRIVE/CHARGE/BLAST/LINE/FIELDS, which the bench flagged as overlaps), the ship card and the radar, and HAULER 12 / CIVILIAN FREIGHT broke one word per line.

**After (`src/ui/orrery/commsLayouts.js` only, `html:root[data-sf-mobile="1"]` at ≤760 wide in portrait, no markup, selector or ID changes):** the fan stands in the clear band under the status card (`top:clamp(112px, 15svh, 150px)`) at `min(340px, 100vw − 56px)`. The callsign, class, frequency and each verb keep one line, the HUD cluster underneath reads again, and the shade pool is trimmed to the narrower screen. 960/1280/1920 are unchanged, because the rule never matches on desktop.

**Checked:** 390×844, 960×540, 1280×720, 1920×1080. Bench: no overlaps on the phone (there were five). Focused test `inst-02-comms-fan-power-rail` passes.

**Shots (not committed):** `/workspace/spaceface-scratch/ui-shots/polish28k/{before,after}/comms-radial-*.png` and `compare-390x844.png`.

## Help at 761–1200 wide (ui-polish-28, `helpLayouts.js`)

**Before (960×540, 1024×768):** the six sections stood as a 172px ladder beside the stage, so the Controls rig had about 400px for two callout columns and the berth. The berth stopped at its 200px floor and the right-hand callouts (REVERSE, MINE BEAM, STEER RIGHT, LATERAL RIGHT, COUNTERMEASURE, BOOST) printed over EVERY KEY. Ships and Commodities had no room for their hero (the price dial and ship ring were gone) and their readings ran past the frame. On Ores the reading sat on top of the mix ring.

**After (desktop only, `min-width:761px and max-width:1200px`, not `data-sf-mobile`):** the sections lie as one row of words on a rule beside the title, using the same grammar as the register's FLIGHT / INTERFACE strip (a tick per word, a dot on the open one, amber on Controls). The stage takes the full width, so every callout clears EVERY KEY. Ships and Commodities show their hero again, and a tall reading scrolls in place under a fade. On Ores the reading stands beside the mix, and at its 80px ring floor the ring keeps the rock's name and share inside the band (the rock's tier-cap line drops at this size). 1280×720 is pixel-identical; 1920×1080 and the phone differ only in the rig's drift. Selectors and IDs are unchanged.

**Checked:** 960×540 and 1024×768 `--walk` through all six sections, plus 1200×800, 1280×720, 1920×1080 and 390×844. The bench measures no tangled, buried or cut-off type. Focused tests pass: help-flight-verbs, help-gamepad-rebind, help-input-echo-lifetime, inf-teach-help-live-bindings. Shots: `ui-shots/polish28l/`.

## Swarm Results phone — LAST 5 HITS clears the docked foot (ui-polish-28)

**Before:** on a phone (390×844, `data-sf-mobile`) the Results plate kept a relative foot at the end of the scroll, so arrival focus jumped to the ways-out and the dial left the glass. Restoring a sticky docked foot (as on #374) put **LAST 5 HITS · N DAMAGE** and its weapon legend under **SKIP THE KILL-CAM / RUN IT AGAIN** at scroll 0 — Code Work's 2026-10-13 23:50 follow-up. Desktop ≤600-tall stacking stays on #374 (freeze); this branch only touches the phone path.

**After (`src/ui/orrery/crucibleResultsLayouts.js` only, phone via `html:root[data-sf-mobile="1"]`, no markup / selector / ID changes):**
- Phone rules use an `RP` selector (`data-sf-mobile`) instead of `@media (max-width:700px)`.
- Ways-out stay `position:sticky; bottom:0` with an opaque scrim so the player can leave without hunting.
- Dial height is `clamp(400px, calc(100svh - 300px), 520px)` with `margin-bottom:48px` and `z-index:3`, so the overflowing caption (strip + legend) ends above the foot (~41px clearance at 390×844 scroll 0) and THE TAKE cannot climb through it.
- Warn line (not vitals) stays hidden on the small plate; hit legend stays shown.

**Checked:** 390×844 at scroll 0 (LAST 5 HITS + legend clear of the sticky foot; measured clearance ~41px, no overlap). Natural arrival scroll stays near 0 with the sticky foot. Merge of origin/master (#374) keeps this phone `${RP}` path and adds the ≤600-tall / 601–720 desktop blocks — see § Crucible results @960 on master notes below.

**Shots (not committed):** `/workspace/spaceface-scratch/ui-shots/polish28m/{before,after,after-scroll0}/` and `compare-390x844-scroll0-lower.png`.

*If #374's REVIEW.md Results sections conflict with this file on merge, keep both. This section only covers the phone `data-sf-mobile` path in `crucibleResultsLayouts.js`.*
## Shipworks Starter / systems fitted @960 — session notes (2026-10-13, ui-polish-27)

**Before:** at ≤1200 wide, `station-orbital` drops the side column so the circuit plate (`Starter` + `N/M systems fitted`) wraps under the stage; `orr-sw--jig { overflow:hidden }` at ≤1100×≤800 then clips it entirely at 960×540. The focused rename field also sat ~12px above the left callout column.

**After (`shipworksLayouts.js` ≤1100×≤640 desktop + `shipworks.js` nameplateInkRect focus pad):**
- Clear the phantom third grid track; keep the fleet rail stretched.
- Pin a one-line compact identity beside DOCKED (clear of hull callouts); sleep the dial/rack on that size only.
- Focus grows the nameplate keep-out by 14px and re-places callouts (Utility gap 12→26px).
- 1280 / 1920 keep the full side plate. Phone callouts fixed later on this branch (see § below).

Shots: `ui-shots/shipworks28/{before,after,compare}/` (not committed).

## Phone Shipworks callouts — session notes (2026-10-13, ui-polish-27)

**Before:** on phone portrait (390×844) the dock stage is ~362×420 with `overflow:hidden`. The live-path callout solver had no keep-out (poster had already handed over), so the bead spread ran edge-to-edge and Utility / Drive / Cargo / Shield / … parked past the clip — beads and leaders visible, labels gone. On phone landscape (844×390) the jig was on, but the stage was forced to 420px in a 390px-tall viewport, so the dial and lower labels met the sticky destination foot.

**After:**
1. `shipworks.js` — on a narrow stage (`width < 520` or phone layout) invent side gutters for the live-path keep-out (same air the poster fit would leave), pull beads into that keep-out, and use a 16px gap so hardpoint cards stay on-glass. Poster path on narrow stages also gets the wider reserve / keep pad.
2. `mobileScreenLayouts.js` — at ≤560px tall the Shipworks stage shrinks to `min(268px, 68vh)` so landscape jig callouts clear the foot; phone jig labels drop the leading numeral and use tighter type so EMPTY / STOCK lines ellipsize instead of clipping mid-glyph.
3. `hullSchematic.js` — short stages (H ≥ 200) still draw the jig; compact columns clamp inside the host so a min dial radius cannot park labels at x≈−8.
4. `shipworksLayouts.js` — jig `__state` gets the same overflow ellipsis as `__name`.

Portrait keeps the live/poster hull (jig still requires W ≥ 480). Landscape keeps the jig. 960×540 / 1280×720 / 1920×1080 spot-checks stay clean (960 Drive/Cargo still kiss as before). Selectors/IDs unchanged. Shots: `ui-shots/shipworks-phone/{before,after,compare}/` (not committed).

## THE SHIP flight host — session notes (2026-10-13, ui-polish-27)

**Before:** the in-flight F2 host (`#sf-ship`) kept the hull sentence on the nameplate. At 1920×1080 it ran ~16 lines and printed over the Mass/Energy gauge strip under the stage; at 960/1024 it tangled with Cargo/Weapon callouts. The dock ORRERY sheet already sleeps that blurb on short jig frames; flight had no equivalent. Separately, ≤1100 forced four 30px heroes onto one nowrap row so +12/s landed on DOCKED.

**After (`styles/station.css` only, `#sf-ship`):**
1. Hide `.sx-sw__blurb` on the flight host (`display:none`). Handling heroes already say CAN TOW; dock (`.orr-station`) still paints the sentence.
2. At ≤1100 wide, the four heroes become a 2×2 grid at 24px so each reading stays whole.

Bench clean at 960×540 / 1024×768 / 1280×720 / 1920×1080 / 390×844 / 844×390. Station Shipworks unchanged. Shots: `ui-shots/ship-inspect/{before2,after2,compare}/` (not committed).

---

## Clips reel empty state — session notes (2026-10-13, ui-polish-27)

**Before:** the three ghost plates (A STUNT / A KILL / A SAVE) were a populated plate scaled to 0.75 and spaced 1.8 reel steps apart. On a phone, STUNT and SAVE hung off both edges; at 960 they floated a populated plate's height above the rail, and the Hand ran into KILL's line. The legend ellipsized on phone (Replay's too), "0 / 0" led the empty legend, and "0.0 S TOTAL" set the unit larger than the number.

**After (`clips.js` `layoutGhosts` + `styles/ui.css`, `.orr-clips` / `.orr-replay` scoped):**
- Ghosts are laid out at their own width (≤85% of a plate, always three across the rail with gutters) instead of scaled, so their words keep size; each stands on the rail under it, the middle one clear of the Hand.
- ≤640 wide: legends wrap (Clips and Replay), ghost names 15px. ≤640 tall: rail at 20% so the arc clears the legend. ≥900 tall: rail and legend step in so the reel isn't stranded above a void.
- Empty reel drops "0 / 0"; S TOTAL is a 12px label under the numeral's size.
- Populated reel geometry is unchanged (no bench fixture for a populated reel; the rail-top media rules apply to it too).

Shots: `ui-shots/survey29/` (before), `iter1`–`iter3` (after) at 390×844 (and `--phone`), 960×540, 1280×720, 1920×1080.

## Factions scale and ring at every width — session notes (2026-10-13, ui-polish-27)

**Before:** the standing scale's bracket (150 · ABOVE HOSTILE / 30 · TO ACCEPTED) ran through the raised tier words (DISLIKED, ACCEPTED) at 960 and 1024, and its drops touched them at 1280/1920. On tall screens 1280–1700 wide (1440×900, 1600×900) the scale is ~560px, so the five rung words staircased down the column past the foot, SWORN ENEMY ran into HOSTILE, and the rung ticks struck −149 / −29. The ring's west names (FULFILLMENT, UNDERSTORY, ARCHIVE) were cut by the stage edge at 1280×900–1920×1080.

**After:** `crestOrbit.js` — the bracket rides 13px above the tallest tier word; tier-word widths use the tracking the screen really has; an end word splits when it would reach its neighbour; a scale too narrow to hang its rung words on two rows draws them as ticks (and the "Next: …" line under it shows); values step down under rung ticks. The ring radius is bounded by each flank name's measured width (re-measured once the label font loads) instead of a flat 118px. `stationTabsLayouts.js`, `min-height:801px` only: 1101–1700 wide gives the rail 290px, the ring half the stage, and short-screen name tracking; 1101–1400 wide folds the rail into the ring as short screens already do. Selectors and IDs unchanged; the help screen's ring is unchanged.

**Checked:** 960×540, 1024×768, 1280×720, 1280×900, 1366×1024, 1440×900, 1600×900, 1920×1080, 390×844 (phone shows the list, unchanged). Shots: `ui-shots/leftovers28/{before,final}/`, `compare-*.png`.

## Phone Missions dossier — session notes (2026-10-14, ui-polish-28)

**Before (390×844):** the dossier's sticky ACCEPT only had a plate as wide as the key, faded out to the right, so the title, risk scale and reward scrolled visibly through and beside it ("…sport a" next to ACCEPT). The title was 36px (three lines for a short job name), and in the 304×200 route chart VESTA FORGE ran into CUSTOMS GATE.

**After (`mobileScreenLayouts.js` only, phones over 800px tall):** ACCEPT docks on a full-width opaque band with a hairline above it, so the dossier scrolls under it. The title is 24px (two lines) and the reward 44px. The route chart is 240px tall on every phone, so the names place clear of each other. Phones at or under 800px tall (including 844×390 on its side) keep ACCEPT in flow with the compact title and are pixel-identical. 960×540 is identical; 1280/1920 differ only by route-drift noise. TRACKED stays on-frame at all four sizes. Shots: `ui-shots/polish28o/{before,after}/`, `{before,after}-scroll/`, `compare-contracts-phone.png`.


## Station Ledger tape figures — close entries no longer collide (ui-polish-28)

**Note:** Missions route strip at 960×540 (FROM / ROUTE PENDING / TO, H… truncation) was already fixed on leftovers27b / archiveLayouts.js compact query — re-shot and confirmed clear; no change this pass.

**Before:** when trade entries sit close on the tape, the back-pass for `minGap` walked the first tip into the axis numeral column, so debit figures (−480) printed on the axis major (−750). The origin CYCLE label also tried to dive into the stem zone (`Math.min` with a short `maxUp`) and sat on the first debit. Bench: `"−750" is printed on top of "−480"` at 960 and 1280 with a filled ledger.

**After (`ledgerTape.js` only):**
- First tip stays clear of the axis column (`AXIS_COL` + clamp after the back-pass, compress if needed).
- Origin CYCLE yields when the first tip stands in its run (the now cursor still names the cycle).
- Same-side figures take vertical lanes (15px) and stay inside the tape height so they do not run into the reading under it.

**Checked:** filled ledger (5 close entries) at 390×844 / 960×540 / 1280×720 / 1920×1080 — no −750/−480 or CYCLE/figure tangle; empty ledger still clean at those sizes. The 960/phone list-vs-reading leftover is closed in § Station Ledger list and phone column below. Selectors/IDs unchanged. Shots: `ui-shots/polish28p/{before,after}/`, `compare-ledger-filled-960.png`, `compare-tape-crop-960.png`.

## Station Ledger list and phone column (ui-polish-28)

**Before:** with receipts, at 960×540 the left column put the title, the two intro lines and the count above the list, so only the first of three rows showed and the other two ran under the destination foot. On a phone the desktop right column stayed pinned beside the list (`position:absolute`, left ≈ 46%), so the tape, the vertical TRADE reading and the purse lay over the rows, and the purse ran off the right edge (to x=541 on a 390 screen).

**After:**
- **960×540-class** (`stationTabsLayouts.js`, 761–1100 wide, ≤640 tall, desktop only): the left column is a flex column that ends at the body. While the list has rows, the intro and the narrator's line yield (the empty ledger keeps them), the count line stays, rows are 6px tighter, and the list fills the rest and scrolls under its fade. All three rows now show (list 116px, was 16px of view).
- **Phone** (`mobileScreenLayouts.js`, `data-sf-mobile` only): the right column follows the list in flow. The tape is 196px at full width, then the reading (52px figure), then the purse centred at 240×190. Each entry puts CYCLE above the line, so the item and its figure share the full row ("Sold 20u Ore Iron · Vesta-For… +1,120 cr"). The arrow-key hint is hidden on glass.
- 1280×720 and 1920×1080 are pixel-identical before and after (filled ledger). The empty ledger is clean at 960 and on phone. Selectors and IDs are unchanged.

**Closed:** the 800×600 berth head leftover — see § Station berth head at 800×600 below. Ledger right-column "20u …" clip at 800×600 closed in § Station Ledger reading at 800×600 below.

Shots (seeded ledger, scratch script): `ui-shots/polish28q/{before,final}/`, phone scroll strips `a4/strip.png`, empty `empty2/`.

## Station berth head at 800×600 (ui-polish-28)

**Before:** under 900 wide, station.css stacks the head one item per row and caps the vitals at two gauges' width (326px), so the five dials wrapped into three rows. The head ran ~500px down (crown to y=467 on 800×600) over the tab body. The mechanic's note and the next step sat under the body, and only ~40px of every tab showed clear (Ledger: one row; Market: the list header). The CTRL K trigger sat on the eyebrow.

**After (`stationLayouts.js` only, desktop, 651–900 wide, ≤800 tall):** the head is three bands. The name sits with CTRL K and the purse at its right. The five dials run on one row across the full width. Under them come the mechanic's note and the next step, lifted above the crown's shade pool so the shade no longer dims them. Head 22→284 (was 22→358 plus a crown overflowing to 467). The body gets 224px clear on 800×600 and 700×600 (was 150, mostly covered), and 418px on 900×800 (was 74). All eight tabs were checked at 800×600, 700×600 and 880×700; the Ledger shows all three rows. Selectors and IDs are unchanged.

**Checked:** 960×540, 1024×600, 1280×720, 1920×1080 and 390×844 (phone) are pixel-identical before and after (Ledger and Market). Shots: `ui-shots/polish28r/{before,after}/`, `compare-*.png`.


## Station Ledger reading at 800×600 (ui-polish-28)

**Before:** under the 761–1100 × ≤640 compact rule the right column was `minmax(0,1fr) 220px` with the figure beside the title/line. At 800×600 that left the cargo text only ~47px, so the reading showed "20u …" / "56 cr …". List rows kept CYCLE beside the line (~91px), so items collapsed to "S…" / "Bo…".

**After (`stationTabsLayouts.js` only, desktop, 761–900 wide, ≤640 tall):** the purse yields to 140px so the reading column can hold the cargo line beside a 24px figure; title and line stay on the side-by-side band (no taller clip under the tape). Each list entry puts CYCLE above the line so the item shares the row with its figure ("Sold 20u Ore Iron · V…" — station still ellipsizes, cargo reads). Three rows still fit. BOUGHT / SOLD / NET stay on the purse. 960×540, 1280×720, 1920×1080 and 390×844 are pixel-identical. Selectors and IDs are unchanged.

**Closed:** the polish28r leftover (Ledger right-column "20u …" clip at 800×600, tab layout).

Shots: `ui-shots/polish28s/{before,after}/`, `compare-ledger-*.png`.

## Chart foot at 960×540 and the narrow desktop chart head (ui-polish-28)

**Before:** the short-screen rule (≤819 tall) folded every foot station onto one line, with the word beside its value. At 960×540 a quarter of the band is ~222px, so DESTINATION's value only had room for "No desti…", and the bench measured "No destination set" running under NEXT LEG. TRACKING also cut to "Beacon 419 …". In a 390×844 desktop window (not the phone sheet), the ≥820-tall header grid put title, search and the two words on one row. The title got a 0px track (bench: "HELIOS PRIME" clipped), and CONTROLS printed over CLOSE.

**After (`chartLayouts.js` only):** the one-line foot now applies only at ≥1180 wide. Below that, the word stays over its value, and the value has the whole track: "No destination set" and "Beacon 419 WU" now read in full at 960×540. In a ≤760 desktop window with `data-layout="narrow"` (`html:not([data-sf-mobile="1"])`, so the phone sheet is untouched), CONTROLS and CLOSE (with ESC) take the top row on the right. Title, search, the QUIET reading and the scale then get a row each. Selectors and IDs are unchanged.

**Checked:** 960×540 bench went from 4 tangled findings to none. 1280×720 is pixel-identical. 1920×1080 differs only by course-glow animation noise at the map centre (163px). The 390×844 desktop window went from 4 tangled and 2 clipped findings to none. The 390×844 phone (`--phone`, touch) is pixel-identical.

**Leftover (closed in § Chart map labels vs zoom strip below):** the chart's zoom strip and "per bar" scale sit over the map's lower-left — map labels printed under them at 960; phone QUIET-on-search and tools-on-foot followed.

Shots: `ui-shots/polish28t/{before,after}/`, `{before,after}-phone-touch/`, `compare-chart-960.png`, `compare-chart-390.png`.

## Chart map labels vs zoom strip / per-bar scale (ui-polish-28)

**Before:** `_chromeLabelRects` reserved the lens rail, inspector and apron, but not the chart hub's zoom strip (`.gmh-tools`), and the canvas edge ruler (`_drawEdgeScale`, "N WU per bar") was never reserved at all. At 960×540, "Customs Corridor · THREAT 1" printed on "2500 WU per bar" and through the ± / fit / ship strip. On the real phone (`--phone`), QUIET sat on the search underline (bench: buried), and the zoom strip crossed the foot's DESTINATION / NEXT LEG lines.

**After:**
- **`galaxyMap.js` (2D label layout, not perf render):** `.gmh-tools` joins the measured chrome rects fed to `placeChartLabels`. The edge ruler's geometry is shared (`_edgeScaleLayout` / `_edgeScaleReservedRect`) and reserved on SYSTEM/GALAXY before labels seat, so names keep clear of the scale. At 960 the colliding zone name yields rather than print under the chrome; 1280/1920 stay clear (pixel-identical aside from tiny label/noise drift).
- **`mobileScreenLayouts.js` (phone only):** the chart head gets a fourth row for `.gm-weather` so QUIET sits under the search band; `.gmh-tools` uses `bottom: calc(var(--gm-foot) + 28px)` on the phone sheet.
- **`chartHub.js` (phone-gated `--gm-foot` only):** apron.top alone under-measured the visual chrome on phone — the navfoot paints above the apron box, and the inspector (OVERVIEW/ROUTE/…) stacks under the stage. When `data-sf-mobile="1"`, `--gm-foot` takes the highest of apron / navfoot / inspector / tabs tops so the strip sits in the map stage just above OVERVIEW, fully clear of the foot rail and of "0 WU from origin" / "157 WU". Desktop still measures apron only (inspector is stage-right; navfoot matches apron), so 960/1280/1920 stay identical.

Selectors and IDs are unchanged.

**Checked:** 960×540 — chrome clear of map labels; pixel-identical to tip 75a6993d51 after this follow-up. 1280×720 — pixel-identical. 1920×1080 — route-glow noise only (~160px). Phone 390×844 (`--phone`) — QUIET not buried; tools clear of foot detail lines and of OVERVIEW/ROUTE (gap ~44px above tabs, ~126px above navfoot). Focused `test/unified-map-professional.test.mjs`: 10/10 pass.

**Follow-up:** first phone lift (`+28px` on apron-based `--gm-foot`) only moved the strip from DESTINATION/NEXT LEG onto the POSITION/TRACKING detail lines; measuring the stacked inspector top on phone fixed it.

**Closed:** polish28t leftover (map labels under zoom strip / per-bar; phone QUIET-on-search and tools-on-foot).

Shots: `ui-shots/polish28u/{before,after}/`, `{before,after}-phone-touch/`, `compare-chart-960.png`, `compare-chart-phone.png`.

## Credits — MADE BY clears the reel at 960×540 (ui-polish-28)

**Before (960×540):** the mid-width orrery park (`901–1100`, `--orr-cr-d:min(80vh,38vw)`, `right: calc(d * -.3)`) still left the Hand tip on the reel's right edge (~x 707 vs reel end ~711). The current body's **MADE BY** name sat on the orbit disc and the reel head line, so the label printed over the graphic (and read as tangled with the head). 1280×720 / 1920×1080 were already clear.

**After (`src/ui/orrery/settingsLayouts.js` only, Credits CSS):**
- **901–1100 wide:** narrower reel (`max-width:min(380px,100%)`), sentence `34ch`, orrery `--orr-cr-d:min(72vh,34vw)` parked at `right: calc(d * -.44)`.
- **901–1100 × ≤600 tall (960×540):** hide the current body name (ladder + reel head already name the section); orrery `--orr-cr-d:min(68vh,32vw)` at `right: calc(d * -.5)` so the Hand disc clears the reel (~x 828 vs reel end ~671).

Selectors and IDs are unchanged. Phone (≤900) still hides the orrery — untouched.

**Checked:** 960×540 — MADE BY gone from the Hand; disc clear of reel. 1024×768 / 1100×700 — name kept, body left of reel (834/895 vs reel ~673). 1280×720 / 1920×1080 — drift/glow noise only (~0.1% px). Phone 390×844 (`--phone`) — orrery hidden as before. Focused: `orrery-decrypt` 5/5; `pq-033-00-credits` 2/3 (pre-existing NOTICE/@elemaudio assert, unrelated).

**Leftovers noticed (not this pass):** Automation conduct-strip labels still tight beside short beams at 960; phone Credits ladder/reel stack still reports ON TOP OF in the bench; Missions route strip at 960 (frozen on #374).

Shots: `/workspace/spaceface-scratch/ui-shots/polish28v/{before,after}/`, `compare-credits-960.png`.

## Automation conduct strip — labels clear the beams (ui-polish-28, polish28w)

**Before:** each flow node was `ring · two-line text (count over class word) · beam`, all centred on one row. The text block straddled the ring axis, so every beam started straight out of the end of the class word and ran into the next ring — at 960×540 it read as `TRADERS —o—◯`, and at 1280×720 the OUTPOSTS beam touched the word.

**After (`src/ui/screens/automationPanel.js` only, `@media (min-width: 761px)`):** the node is a small stepper grid — row 1 is ring, count and beam on one axis; row 2 is the class word under the ring (`.au-node__t` is `display: contents`, so no markup change). The beam has 3px clearance after the count and 10px before the next ring. The CONDUCT THE MACHINE caption sits on the ring axis. Selectors, IDs and `data-conduct` are unchanged. Phone (≤760 / `data-sf-mobile`) is untouched.

**Checked:** 960×540, the words sit under the beams with no beam touching any letter; the strip is 8px taller, so the tabs move down 8px. 800×600 and 1120×700 are clean. At 1280×720 and 1920×1080 the strip stays inside the gauge row height and is clean. Conducted state (purse reads `OUTPOSTS 0/MIN`) and a forced live state (12/4/3/2, `TRADERS 1,284/MIN`) fit at 960 and 1280. Phone 390×844 (`--phone`): the only diff is the YOU route-pulse frame, and the 3 OFF FRAME spans were already there. Focused tests: `automation-panel-focus` 2/2, `automation-operational-limits` 21/21, `automation-drone-bay-capacity` 7/7.

Shots: `/workspace/spaceface-scratch/ui-shots/polish28w/{before,after}/`, `after/live/`, `after/extra/`, `compare-{960,1280,1920}.png`.

## Base (claimed) — TRADEOFF clears Esc / Dispatch on short desktop (ui-polish-28, #384 HOLD follow-up)

**Before (tip 37c027bbc3):** the sticky `.base-foot` painted its glass as a `linear-gradient` only. The bench doesn't count a gradient as a plate, so every identity line scrolling under the foot read as text printed on the controls: `△ TRADEOFF · Convoys can be lost…` on **Esc** and `△ TRADEOFF · Produces no goods…` on **Dispatch convoy** at 960×540 and 800×600 (phone had the same with YOUR VERB on Close). At scroll 0 on 960×540, the cards were also cut mid-CONSEQUENCE, so no card read through to its TRADEOFF.

**After (`src/ui/screens/base.js` style block only; selectors and IDs unchanged):**
- **Every size:** `.base-foot` is one solid band (`background-color` in the glass tone, .995). The "more above" fade moved to a `::before` standing just above the band. Its 14px (10px on ≤800 tall and phone) come out of the foot's top padding and go back into its margin, so the foot and its controls don't move. 1280×720, 1920×1080 and 390×844 are pixel-identical to before.
- **≤640 tall, ≥761 wide (960×540, 800×600):** a tighter stack above Operating Identity (plate gap 5px, Research Next plan 4px padding, slot 4px, section head 4px margin, card padding-top 2px / gap 3px, verb / consequence / tradeoff line-height 1.3) and a slimmer foot (8px / 12px padding). All three cards now read fully through TRADEOFF at scroll 0. Their buttons start at the band (a scroll cue) and are not centred under Dispatch. The identity rail's `padding-top:26px` stays, so the ticks and dots stay on the rail.

**Bench (base-claimed findings):** 800×600 10 → 2, 960×540 12 → 6, 1280×720 6 → 6, 1920×1080 6 → 6, 390×844 10 → 4. No tangled lines remain anywhere. What's left is all **buried**: content one scroll down under the sticky foot, which is normal for a scrolling plate.

**Chart:** the Drag-to-lay-a-course note vs the Click-destination engage reason, checked at 960×540 and 800×600 on this tip. The note fades out above ENGAGE ROUTE and nothing overlaps (bench 0), so chart is untouched.

Focused tests: `claim-specializations`, `wave-c4-base-kit` pass.

Shots: `/workspace/spaceface-scratch/ui-shots/polish29a/{before,after}/`, `after/compare-{960x540,800x600}.png`.

## Codex — very short desktop window (844×390): the section list clears CLOSE (ui-polish-32, polish32)

**Before (master 50c8806f39):** a desktop window 844×390 (not the phone layout) got the 801–1100 narrow-desktop Codex plus the 960×540 short rules, which still assume ~540px of height. The kit's 42px top/bottom frame, the 58px→44px unlock dials and nine 22px section rungs needed more than 390px. The hang track came out 162px for a 198px list, so SHIP / ARCHIVE / LEDGER ran down through ‹ CLOSE (bench: "Ship" printed on top of "Close", ×4 on `codex` and `codex-record`), and LEDGER was cut at the bottom edge. The entry title (B0 — COLD START) was half lost in the reader fade.

**After (`src/ui/orrery/archiveLayouts.js`, one new block `@media (max-width:1100px) and (min-width:801px) and (max-height:460px)`, placed after the zoom bands so it doesn't touch the lines #390 edits):** a 14px / 8px frame, a 30px CODEX, 34px dials, 24px search, 18px section rungs, a 150px plate, a slightly smaller reader, and a 32px foot. All nine sections, the whole STORY ladder (B0–B7) and CLOSE now fit with room between them, and the reader shows the number, the filed line, the title, the phase and the first sentence above PREVIOUS / NEXT.

**Bench:** `codex` and `codex-record` at 844×390: 4 → 0 overlaps on CLOSE. On `codex` one geometry note remains, "Contract 47-A…" on top of Previous. That's the reader's own scroll content clipped under its fade mask; the crop shows a clear gap. Checked 1024×440, 900×460 and 820×380 too: 0, 0, and the same clipped-scroll note. 960×540 and 1024×768 match master up to run-to-run plate and wedge noise (0 pixels over threshold after vs master, against 75–130 between two master runs). 800×600 and phones aren't in the range. Selectors and IDs are unchanged.

**Still open:** desktop Shipworks at 844×390. The station header and the dials take the whole height, so the Shipworks body is below the fold and the tab row is cut at "1 MI" (17 findings). Phone Shipworks (390×844 and 844×390) is fine apart from an ellipsized hold hint flagged against DISMISS.

Focused tests: `fb-codex-world-tab`, `packet-codex-b-contracts`, `world-remembers-codex`, `infer-ending-archive-entry` pass.

Shots: `/workspace/spaceface-scratch/ui-shots/polish32/{before,after}/844x390/`, `compare-codex-844x390.png`, `compare-codex-record-844x390.png`, `range/`.

## Credits — phone and narrow windows: the ladder clears the reel (ui-polish-30, polish30a)

**Before (master 058a460a29):** at ≤900 wide the Credits grid stacks four areas (`title / hang / stage / foot`) but kept the desktop's three row tracks (`auto minmax(0,1fr) auto`). The section ladder landed in a 0px track, and its five 48px rungs and the reel dial (342px) printed over the reel. On a 390×844 phone, `02 TYPE` / `03 LIBRARIES` / `04 FONTS…` / `05 THIRD-PARTY…` ran through MADE BY, the SPACEFACE name and the blurb, and the dial sat on the TYPE head. At 800×600 FONTS AND LICENCES ran through the blurb (6 findings). The phone name was also cut at the right edge, and a long maker (EBEN SORKIN, MIRKO VELIMIROVIĆ) printed over its font's name.

**After (`src/ui/orrery/settingsLayouts.js` Credits CSS only, `@media (max-width:900px)` and `(max-width:560px)`):**
- ≤900 wide: four row tracks (`auto auto minmax(0,1fr) auto`). The ladder becomes a sideways-scrolling rail of 44px rungs, matching the phone Settings rail, with an underline Hand on the current section. The decorative reel dial is hidden, the maker's name is sized to the glass (`clamp(36px, 12.5vw, 64px)`), and the reel is the one scroll beneath the rail.
- ≤560 wide: each credit row is one column (name, then role/sub, then maker), so a long maker never shares a line with its name.
- ≥901 wide is untouched. 960×540, 1280×720 and 1920×1080 differ only by drift-field/decrypt animation noise (no rule applies there). Selectors and IDs are unchanged, and `credits.js` is untouched.

**Bench (`credits`):** 390×844 phone: 6 ON TOP OF → 0. 800×600: 6 ON TOP OF → 0. 960/1280/1920: 0 → 0. The `--walk` on phone exercised 14 controls; picking a rung scrolls the rail (THIRD-PARTY NOTICES comes fully into view).

Focused test: `pq-033-00-credits` 2/3, with the NOTICE `@elemaudio/web-renderer` check failing identically on master.

Shots: `/workspace/spaceface-scratch/ui-shots/polish30a/{before,after}/{phone,desk}/`, `compare-{phone-390x844,800x600,960x540,1280x720,1920x1080}.png`.

## Codex — 800×600 and narrow windows: reader clears the plate (ui-polish-31, polish31)
- **Before (800×600):** the 801–1100 narrow-desktop band stopped at 801, so an 800 window fell back to the wide layout. The 640px plate overran the reader, the entry title and PREVIOUS/NEXT printed into the plate, and the subtitle ran under the STORY dial.
- **Fix (`src/ui/orrery/archiveLayouts.js`, CSS only):** the narrow-desktop band and its short variant now start at 640px instead of 801px. A new ≤900 block wraps the subtitle under CODEX (max-width 250px), shrinks the plate to `min(200px, 40vh, 25vw)` and the entry title to 19px, and keeps PREVIOUS / NEXT on one row with an 18px gap.
- **Unchanged:** phones (`data-sf-mobile`) keep their own Codex layout. At 960×540 and 1280×720 the output is pixel-identical apart from the animated needle.
- **Also (Code Work review):** at 640–760 the hang was still 316px wide, so the stage could not clear plate + PREVIOUS/NEXT; hang/dials/plate shrink further in that band.
- **Leftover:** a desktop window as short as 844×390 is still cramped, with the ladder running into CLOSE. Real phones in landscape use the mobile layout, which is clean.

## Station berth at a very short desktop window, 844×390 (ui-polish-33)

`stationLayouts.js` + `shipworksLayouts.js`, CSS only, scoped to `max-height:460px` on non-phone desktops. Phones (`data-sf-mobile`) and every height above 460 are untouched.

- **Before:** the three-band head (name, five dials, mechanic's note, next step) took ~260px of a 390px window and the foot ~78px, so every tab got a 16px sliver. Shipworks showed no hull at all (17 bench findings).
- **651–1100 wide:** the berth scrolls. Each tab keeps a 230px cell (960×540 has ~210), and the destination rail is a solid pinned foot with a short fade above it. Rail words close up so MARKET through LEDGER, COMMS, HELP and UNDOCK fit on one line at 844.
- **801–1100 wide:** the head is two columns: 141px tall at 801–900 and 132px at 901–1100 in the live game (`?dev=screen:station`, `.dp-frame__head`; 196px on master), 162px on the bench, whose mechanic's note and next step run longer. The left column holds the name, the mechanic's note (two lines at most) and the next step (title, count and DISMISS on one line, with the sentence ellipsized; the full sentence stays in `data-why` and the aria label). The right column holds the purse and five dials, and CREDIT LINE OPEN wraps to two lines so Munitions stays on screen.
- **Shipworks, 651+:** LEFT · CENTER · RIGHT get their own line under the stage instead of sharing the verb row with PAINT, and the STARTER identity rides one line over the nameplate (the stage starts 22px lower), so a live condition such as SOUND 100% and a long identity (6/7 systems fitted · 17 t modules) never meet.
- **Bench, 844×390:** the 14 findings left are the expected below-the-fold content under the pinned foot, the clamped mechanic's sentence, and the ellipsized next-step sentence, whose full text width the probe measures. 960×540, 1280×720 (11 pre-existing), 1920×1080 and 390×844 counts are unchanged.
- **651–800 wide:** the head stays three bands but each is shorter (162px live at 700×400 and 760×420, 210px on the bench, instead of ~260px on the bench): a 24px name with the purse beside it, 64px dials with a smaller reading, and the mechanic's note and next step on one line each (the sentence ellipsized, DISMISS kept on the line). Each tab gets a 250px cell. The rail words step down to 10.5px and COMMS and HELP stack, so all seven destinations and UNDOCK fit on one line. Below 700, the rail closes up once more and CREDIT LINE OPEN wraps to two lines clear of the HOLD dial.
- **Shipworks, 651–800:** STARTER · 1/7 systems fitted rides one line over the nameplate instead of running into the Shield callout, and the in-flow verbs break after TAKE THE HITCH so LEFT · CENTER · RIGHT sit beside RECORD · PAINT.
- **Pinned foot** is fully opaque now (it was 96%, and the hull callouts and market rows showed faintly through the rail words).
- **Bench:** Shipworks tangled findings go from 6 to 0 at 700×400 and 760×420. Market's remaining overlaps there are its lower rows scrolled under the pinned foot. 844×390 and up are untouched.
- **Market, 651–1100 × ≤460 (`marketLayouts.js`):** the panel's row sized to the 345px index, so the index and stage ran ~110px past the tab cell and a pending decision (REPAIR NOW / FLY DAMAGED) was out of reach. The row now fits the cell and each side scrolls in it.
- **Market, 651–900:** the families wrap into a strip over the register (all still visible), so the register's names get ~100px instead of 0–25px. The reading is one column: the kind line and the name on one line each, then the price with its words beside it, then the trace at full width (it was ~20px wide). While a decision waits, the last-move line yields so the trace stays above it. Bench: 26 to 8 at 700×400, 26 to 7 at 760×420, 28 to 15 at 844×390; what is left is lower rows under the pinned foot. 960×540 and up unchanged.
- **Leftover:** 651–699 × ≤460 Market decision terms ran four lines — fixed in ui-polish-41.
- **HOLD fixes (Code Work review of f462ce66), measured with live values** (REARM 1,200 CR, DRAW +7,240 CR, STARTER 6/7 systems fitted · 17 t modules, SOUND 100%; the bench fixture says 792 CR, 1/7 and DOCKED, so the run overrides the text in the page, nothing committed):
  - **Munitions at 801–~855:** the right column is ~510px and the five dials with one-line verbs need ~565px, so Munitions, / 100 and REARM 1,200 CR ran off the right edge. At 801–900 the Ledger and Munitions verbs stand over their price on two lines (Hull already has two), so the head stays 141px live (162px bench). Every dial word is on screen at 801, 812, 830, 844 and 860.
  - **LEDGER on the rail at 801–~840:** it ran under COMMS. At 801–900 COMMS and HELP stack as they do at 651–800, and the 651–800 rail closes up 2px more, so LEDGER clears at 700×400 too (it was 1px under). Every rail word now fits from 651 to 1100.
  - **Shipworks identity at 801–1100:** see above; it was overlapping SOUND 100% at 844×390.
  - Head heights in the CSS comments and here are measured live and on the bench (see the second HOLD round below).
  - Shots: `/workspace/spaceface-scratch/ui-shots/polish33d/compare-*.png` (before left). 960×540, 1024×440 station and market, 390×844 and 844×390 phone are pixel-identical; 1280×720 and 1920×1080 differ only in animated pixels (no rule reaches above 460 tall).
- **Second HOLD (Code Work review of 209c924b97), measured live** (CREDITS 5,000, REARM 1,200 CR):
  - **Purse over "Find a service" at 901–1100 × ≤460:** from 901 wide the search key shows its word (station-orbital.css drops it at ≤900), so the key is ~196px, and the purse's 84px right margin only cleared CTRL K. At 901–1100 × ≤460 the purse now stands 220px in from the right edge, clear of the key's full width; the key is the same width at rest, on hover and on focus. Swept 900–1100 in 25px steps at 390, 400, 440 and 460 tall: 0 overlaps on the bench (32 of 36 before), and 0 in the live game at 925–1100 and Code Work's 950×440, 1000×440, 1024×440, 1060×400 and 1100×460, at rest, hovered and focused. The purse keeps the head's first row, so the head heights do not change.
  - **Head heights, live `.dp-frame__head`:** 141px at 801–900, 132px at 901–1100, 162px at 651–800 (700×400, 760×420). The bench's longer mechanic's note and next step give 162 / 162 / 210.
  - **Market keyboard focus:** `scrollIntoView({block:'nearest'})` parked REPAIR NOW / FLY DAMAGED under the pinned foot (20–66px under it at 700–1100). At 651–1100 × ≤460 the choice carries `scroll-margin-bottom:88px` (the 73px foot plus its 12px fade), so Tab lands it fully above the foot at 700×400, 760×420, 801/844×390, 1024×440 and 1100×460. It sits on the choice, not as `scroll-padding` on the berth, because the station focuses the foot's MARKET tile on open and a berth padding scrolled the head away.
  - Shots: `/workspace/spaceface-scratch/ui-shots/polish33e/compare-*.png` (before left). 960×540, 1280×720 station and Market, 900×440, 801/844×390 and 700×400 station, and phone 390×844 / 844×390 station and Market are pixel-identical; the other differences outside the purse are the rail tape's and the hull's animation (no rule reaches above 460 tall or phones).

## Chart on a phone — the sky is a window, the page scrolls (ui-polish-34)

**Before (`--phone`, 390×844 and 844×390):** the whole chart was squeezed into one frame over a full-screen canvas. Portrait: the inspector was a 64px box over a dimmed map, so ENGAGE ROUTE / PAUSE / DISENGAGE were hidden inside it; the tab strip was one 875px row (ECONOMY…HISTORY past the edge, out of reach); the zoom strip floated mid-map; and the foot's tape crossed the readings, with the lit leg's band running off the left edge from DESTINATION. On its side: the four-row phone head took 188 of 390px, the lens band, sky and inspector shared the 41px left, and the map sat under every word.

**After (`mobileScreenLayouts.js`, phone only — `data-sf-mobile="1"`):**
- Portrait (`data-layout="narrow"`) and on its side (`compact`, ≤540 tall, coarse pointer): the sheet's rows are content-sized and the page scrolls. The canvas is an in-flow window (portrait `clamp(260px, 44dvh, 420px)`, side `clamp(220px, 72dvh, 300px)`) between LENSES and the inspector, with 22px faded edges. The inspector, tabs and foot follow at full height. The glass background runs the full page (`background-attachment: local`).
- All nine inspector tabs wrap onto the tab instrument's per-row scales (three rows in portrait, one row on its side).
- The zoom strip stands at the window's bottom-right, clear of the canvas "per bar" ruler. `chartHub.js` (phone branch only) now measures in page coordinates and publishes `--gm-sky-bottom`, so the strip stays on the window while the page scrolls.
- Foot: portrait is two rows of two, and each row carries its own run of the tape; on its side the four answers share one run, as on desktop.
- On its side the head is two rows: title, LOCAL/SYSTEM/GALAXY, CONTROLS, CLOSE, then search and QUIET. The sector stamp sleeps, as it already does in portrait.

**Checked:** bench clean (0 findings) for `chart`, `chart-route` and `chart-local` at 390×844 and 844×390 `--phone`, and at 390×844, 960×540, 1280×720 and 1920×1080 desktop. Desktop chrome is untouched (every rule needs `data-sf-mobile`, and the hub change is inside its phone branch); the only desktop pixel differences are inside the map, where run-to-run animation already varies. `check:map-information-depth` passes all 18 sections. Selectors and IDs are unchanged. Shots: `ui-shots/polish34/` (`compare-chart-phone*.png`).

## Ledger tape labels (ui-polish-35)

**Before:** with receipts close together, the tape printed every cycle name at its boundary and the now cursor's name on top, so at 960 three names ran into one ("CYCCYC LE0001"), and the last cycle's name always sat under the now cursor's. Debit figures took a new lane per figure whether or not they were near each other, so at 960 the stack of −220/−640/−90/−1,200 ran down into the reading's "TRADE · SOLD" and "13u Fuel Cells", and −750 printed on the cycle names.

**After (`src/ui/orrery/ledgerTape.js`, plus one option passed from `src/ui/station/screens/ledger.js`):** the now cursor always keeps its name, and boundary names are planned right to left from it: a name that would run into the next prints only its number ("0007"), and yields when even that does not clear; a boundary in the now cursor's cycle is not named twice. Each figure takes the first clear slot (over or under its tip, one or two lanes out, then beside the tip), clear of other figures, the names, the axis numerals, the beads and the Hand's ring, and above the reading where a layout lifts it into the tape's foot. A figure with no clear slot yields; the list and the reading still carry it. Selectors and IDs are unchanged; the empty ledger draws as before.

Overlap probe (text boxes in the tape) on two seeded ledgers, 6 receipts over three cycles and 9 receipts in one cycle: 960×540 3+3 → 0, 1024×768 / 1280×720 / 1920×1080 1 → 0. Shots: `ui-shots/polish35/{before,after}/` (seeded with `_tools/ledger-seed.mjs`).

## Ledger tape — figures clear the axis numerals (ui-polish-37)

**Before:** the tape kept figures out of a fixed 64px axis column, but the top numeral ("3,000 CR", 12px tracked caps from x0 + 9) prints wider than that. A big credit near the origin slid just past the column and printed on it: in a 12-receipt ledger with a 3,000 cr ceiling, `+1,806` sat on "3,000 CR" at 844×390, 960×540 and 1280×720, and `+2,950` did at 1920×1080. Same on master since #395 (Code Work's follow-up note there).

**After (`src/ui/orrery/ledgerTape.js`):** each axis numeral adds its own box to the clear set at its measured printed width (the same cached `measure()` the names and figures use), and a figure near the origin slides right past whichever numeral shares its row, not just past the fixed column. Nothing else moves: the column, the tick spacing and the empty ledger are unchanged. Where the slide takes a neighbour's slot, that neighbour yields as before (at 960 `+1,500` now yields; the list and the reading carry it).

Overlap probe (text boxes in the tape), two seeded 12-receipt ledgers at 844×390 / 960×540 / 1280×720 / 1920×1080: master 3 + 1 → 0. `test/ledger-tape-yield.test.mjs` gains a case that fails on master ("+1,806 prints on the 3,000 cr numeral") and passes here. Shots: `ui-shots/polish37/{before,after}/`, compares in `ui-shots/polish37/compare/` (seeded with `_tools/ledger-seed.mjs` sets c and d).

## Footprint dial: crest pads yield on a small dial (ui-polish-38)

**Before:** the hub's radius has a 96px floor, so on a dial under ~510px (960×540 at 430px, phones at 368–401px) the escape clock and its ticks sat exactly where the source crest pads go. The pads printed over the clock, and the lower pads printed over the hub's CLEARS IN, the bounty line and (MARKED) T0 · NO SEARCH. The probe found 2–3 hub lines under a pad on every WANTED and MARKED dial at those sizes.

**After (`src/ui/orrery/footprintDial.js`, `dialGeometry` plus two guards):** the geometry reports whether the pads have radial room between the clock's ticks and the source band. Where they don't, the pads and the Hand's ring around the traced pad are not drawn, and the Hand's arm runs from the clock to the band's inner edge instead. The band still names each source and the reading still shows the crest. Dials of ~510px and up keep their pads (700×900 and 1024×768 are 516–520px). Selectors and IDs are unchanged.

**Checked:** hub-line vs pad probe (`_tools/fp-hub.mjs`) at 390×844 and 360×740 (`--phone`), 960×540, 1024×768, 700×900 and 1280×720: 0 overlaps on all three records. 1280×720 is pixel-identical to master. The bench measures clean at 390×844, 960×540, 1280×720 and 1920×1080. Focused tests pass: footprint-heat-dial, footprint-board-churn, law-08-unwitnessed-footprint. Shots: `ui-shots/polish38/{before,after}/`, `compare-{phone,960}-{wanted,marked}.png`.


## Shipworks short desktop: verbs stay on-frame; next-step clears DISMISS (ui-polish-39)

**Before:** at 844×390, TAKE THE HITCH · RECORD · PAINT ran past the right edge (Paint at x≈922 on an 844 frame) and overlapped UNDOCK. The next-step sentence under OPEN YOUR HOLD printed on DISMISS (bench ON TOP OF ×4). Weapon / Mining / fleet rows under the sticky foot were already the expected below-fold remainder from ui-polish-33.

**After (`shipworksLayouts.js`, CSS only, `801–1100 × ≤460` desktop):** the verb row wraps inside the main (`left/right:8px`, `flex-wrap`) so RECORD · PAINT stay on-frame (Paint at x≈804 on 844, ≈761 on 801). The rule is its own 801–1100 block: at 651–800 the verbs sit in flow beside LEFT · CENTER · RIGHT and a right-justified row printed on the camera words (review). The next-step keeps master's two lines (title + 2/3, sentence ellipsized clear of DISMISS); the bench's ON TOP OF there measures the clipped sentence's text range, not ink. Selectors and IDs are unchanged. Phones, 651–800 and every height above 460 are untouched. Open: at 844×390 RECORD · PAINT are on-frame but still under the sticky UNDOCK foot.

**Bench:** station-shipworks 844×390 19 → 10 (remaining: below-fold under the sticky foot + mechanic clamp). 1024×440 6 → 6 (geometry clear of DISMISS; probe still notes title vs DISMISS from hidden text). 960×540 / 1280×720 / 1920×1080 / 390×844 unchanged (1280 matches master’s 2 HITCH-pool notes). Shots: `ui-shots/polish39/{before,after,compare}/`.

## Market decision terms @651–720 × ≤460 (ui-polish-41)

**Before:** at 651–720 wide and ≤460 tall, the ≤640 rule still put REPAIR NOW / FLY DAMAGED in two columns ~59–72px wide, so each verb's terms wrapped to four–six lines (~80–105px per option). The block ate the stage; beside BUY the wrapped lines collided with the console.

**After (`src/ui/orrery/marketLayouts.js` only):** the same short-berth band stacks the two options in one column at the analysis width. Each verb keeps its name on one line and its terms wrap under it at the full width. Term lines 4–6→2–3. **Code Work review:** the first cut ellipsized the terms to one line ("Pay 22 cr. Hull 86 → 10…", FLY DAMAGED's "stays at 86 (armor 20)" lost), and the buttons carry no title or aria-label, so the numbers being chosen between couldn't be read. The terms now wrap. Stacked, Tab to REPAIR NOW also parked FLY DAMAGED under the pinned foot at 675×420 and 720×440, so a non-last verb keeps 144px clear below it on focus. 760×420 and up (two-column wrap) and 960×540 / 1280×720 are unchanged. Selectors and IDs are unchanged. Phone rules are untouched (`MD` is desktop-only).

**Checked:** scrolled decision probe at 651×400, 675×420, 700×400 (fix), 760×420 / 844×390 / 960×540 / 1280×720 (unchanged layout). Shots: `/workspace/spaceface-scratch/ui-shots/polish41/` (`compare-decision-crop-651.png`, `compare-decision-*.png`).

## Research on a phone, a narrow window and a short desktop (ui-polish-40)

**Before (master 9d99c12ec3):** Research only had the desktop grid (`1fr | 270–500px`). On a phone (390×844, `--phone`) the 1fr column was ~55px, so RESEARCH printed over 18,400 CREDITS and 0 RESEARCH POINTS, the sub line broke into one word per line ("6 / nodes / ready / to…"), the dial had no room and stood down, and the node picker stayed asleep, so a phone had no way to choose a node at all. In a 700px desktop window the dial was a ~60px knot with the sector names over the stars. At 960×540 the reading ran past the frame's foot (REQUIRES and its line were cut off), and at ≤1100 wide RESEARCH POINTS in the cost reading ran off the right edge.

**After (`src/ui/orrery/constellationLayouts.js` RESEARCH block, plus a 3-line scroll reset in `src/ui/screens/techTree.js`):**
- **≤760 wide:** one scrolling column: title, the three readings in a ruled row, the dial at full width (`clamp(380px, 86vw, 620px)` tall), then the reading. Back docks at the foot on an opaque void. At 700×800 the dial is drawn at full size with clean sector names.
- **≤560 wide (phones):** the dial still can't stand in under 360px, so the stage folds away, and the node picker (`#sf-research-node`, the screen's second route) wakes as a labelled field beside Back in the docked foot. The zoom reading sleeps with the dial.
- **Cost reading:** the two cells share one row grid (`subgrid`). At ≤1100 a word that needs two lines ("Research / points") wraps without knocking the numerals out of line.
- **761+ wide, ≤640 tall:** the reading scrolls inside its own column with a soft fade at its foot instead of printing under the frame, and its unlock rows are tighter. Choosing a new node scrolls that column back to the name.
- 1280×720 and 1920×1080 are pixel-identical to master. Selectors and IDs are unchanged; no instrument (constellation.js) geometry changed.

**Bench:** phone 390×844 went from a visible pile-up to 0 findings on `tech-tree` and `tech-tree-progress`. 960×540 has 0 findings, as before. 1280×720 keeps its 4 pre-existing findings ("1 Propelled charge…" curve box vs Deflector Theory, unchanged pixels). 1920×1080 has 0. A `--walk` at 960/1280/1920 exercised 24 controls per screen. A picker change on the phone re-reads the dossier (Plasma Dynamics).

**Sizes checked:** 390×844 (`--phone`, top and scrolled), 700×800, 800×600, 844×390 (`--phone`), 960×540 (top, reading scrolled, node picked), 1024×768, 1280×720, 1920×1080.

**Still open after ui-polish-40:** the dial itself is crowded when its stage is under ~500px (800×600, phone landscape 844×390), the same as on master. That needs instrument geometry, not layout. ~~At 960 the "Industrial Mining" label's last letter is clipped by the dial's own sky (`labelOut` under-measures by a few px).~~ **Fixed in ui-polish-44.** Shots: `ui-shots/polish40/{before,after}/` plus `compare-*.png`.

## Help on a short desktop — EVERY KEY clears the frame (ui-polish-42)

**Before (844×390, 801×440, 700×400):** the 761–1200 Help strip still put the six sections beside the title and split the Controls stage into the ship rig + EVERY KEY. Under ~460px of height the title row, the section ticks, the rig's "PRESS ANY KEY · THE RIG LIGHTS WHAT IT DRIVES" echo and the register's rebound footnote all shared one band — tabs ran through CONTROL SCHEME, KEYS/PAD clipped the foot, and CLOSE sat under the echo. Loops stayed `is-off` (host under the instrument's 260px floor).

**After (`src/ui/orrery/helpLayouts.js` only, desktop `html:root:not([data-sf-mobile="1"])`, `@media (max-height:460px)`):**
- Title, section strip, stage and CLOSE stack as four rows with a tight chrome budget so the stage stays ≥260px at 390 tall.
- Sections are one row of words on a rule (same grammar as the 761–1200 strip), even under 761 wide.
- Controls sleeps the ship rig; EVERY KEY fills the stage and scrolls. Rebound footnote clears CLOSE.
- Loops wakes (ring + reading). Ring names sleep at this height — the reading already carries LOOP N OF 06 + title — so they cannot climb into the section rule.
- Ships / Commodities / Ores / Factions keep a side ladder + scrolling reading. Selectors and IDs unchanged.

**Checked:** bench clean (0 findings) at 700×400, 801×440, 844×390, 900×420. 960×540 and 1280×720 keep the prior 761–1200 / wide layouts (Controls still shows the rig). Phone (`data-sf-mobile`) untouched. `--walk` at 844×390 through CONTROLS → FACTIONS. Shots: `/workspace/spaceface-scratch/ui-shots/polish42/{before,after}/`, `compare-help-844x390.png`, `compare-help-700x400.png`, `compare-help-801x440.png`.


## Missions on a narrow desktop — dial clears the reading; route ends unstack (ui-polish-43)

**Before (master d49ec7c93b):** below 761px wide a desktop window kept hang|stage as two equal columns, so at 700×900 the dial sat on CONTRACT 47-A, LOCAL MAP printed through PAYS, and the route band was crushed. At 800×600 (and the 761–1100 × ≤640 band) FROM / ROUTE PENDING / TO shared ~200px and From sat on the mid word; the destination disc's ring clipped the stage edge at 960×540.

**After (`src/ui/orrery/archiveLayouts.js` only, desktop `html:root:not([data-sf-mobile="1"])`):**
- **640–760 wide:** hang is 248px, the card stacks (dial + verbs on one row, then the reading), route discs 44px with host padding so TO clears the edge.
- **761–1100 × ≤640:** mid (ROUTE PENDING + clock) takes its own row above FROM / TO; dial column 176px with tighter verb tracking so OPEN ON THE CHART fits; route host padded, discs 40px.
- 1280×720 / 1920×1080 / phone (`data-sf-mobile` and sub-640) unchanged. Selectors and IDs unchanged.

**Bench:** 0 findings at 700×900, 800×600, 960×540, 1280×720, 1920×1080, 390×844 (+ `--phone`). `--walk` exercised SHOW / Track / Local map / Abandon / Close at each size.

**Leftovers (not this pass):** Research dial crowded under ~500px of stage; ~~"Industrial Mining" last letter clipped at 960~~ (fixed ui-polish-44); ~~Shipworks second Cargo callout line at 1024×440 under rail fade~~ (fixed ui-polish-46); ~~Station Ledger right column tight at 800×600 with receipts~~ (fixed ui-polish-45).

Shots: `/workspace/spaceface-scratch/ui-shots/polish43/{before,after}/`, `compare-700x900.png`, `compare-800x600.png`, `compare-960x540.png`.

## Research Industrial Mining label clears the sky @960 (ui-polish-44)

**Before (master c39004bef0):** at 960×540 the constellation sky (`overflow:hidden`) clipped the last letters of "Industrial Mining" on the right of the dial. `labelOut` was `min(200, widest + 26)`, and label boxes / placement bounds sat only 2px inside the host, so a slightly under-measured name ran into the clip.

**After (`src/ui/orrery/constellation.js` only):** `labelOut` is `min(220, widest + 38)` so the dial leaves a few more px for side names; each label box pads +8 instead of +2; placement bounds inset to 6/4 so the solver keeps ink inside the sky. At 960 the full "Industrial Mining" reads clear of the sky edge (and clear of the INDUSTRY rim word). 390×844 phone is pixel-identical. 1280×720 is effectively unchanged (~0.4% pixel churn). 1920×1080 gains a little more air between beads and side names (same rules, larger type). Selectors and IDs are unchanged.

**Checked:** bench `tech-tree` clean at 960×540 and 1920×1080; 1280×720 keeps its pre-existing hour-verb vs Deflector Theory ON TOP OF; 800×600 keeps master's crowded-dial overlaps (still open). Shots: `/workspace/spaceface-scratch/ui-shots/polish44/{before,after}/`, `compare-960x540.png`, `compare-960x540-crop.png`.

**Leftovers (not this pass):** Research dial crowded under ~500px of stage; ~~Shipworks second Cargo callout line at 1024×440 under rail fade~~ (fixed ui-polish-46); ~~Station Ledger right column tight at 800×600 with receipts~~ (fixed ui-polish-45).

## Station Ledger purse at 800×600 (ui-polish-45)

**Before:** under the 761–900 × ≤640 compact rule the purse column was **140px**, so the ring starved and BOUGHT / SOLD / NET · CR clipped against the right edge (and inward into the reading). The list still took the parent 40%, leaving the reading column thin beside that narrow purse.

**After (`src/ui/orrery/stationTabsLayouts.js` only, `761–900 × ≤640`):**
- List `max-width` **34%** (overrides the parent 40%).
- Right column `left: calc(34% + 22px)` with `grid-template-columns: minmax(0, 1fr) 200px` so the purse is ~200px again.
- Keeps the existing CYCLE-above-line list stack and the trimmed reading figure from this band.
- Parent **761–1100 × ≤640** (40% / 220px) and every size outside 761–900 × ≤640 are unchanged (960×540 / 1280×720 / 390×844 pixel-identical; 1920×1080 noise only).

**Checked:** seeded ledger (set `a`, 6 receipts) at 800×600, 960×540, 1280×720, 1920×1080, 390×844. DOM at 800×600: list 250px (34%), purse 200px, reading ~258px; purse text shows full BOUGHT / SOLD / NET · CR. Shots: `/workspace/spaceface-scratch/ui-shots/polish45/{before,after}/`, `compare-800x600.png`, `compare-purse-800x600.png` (not committed).

**Leftovers remaining:** Research dial crowded under ~500px of stage; ~~Shipworks second Cargo callout line at 1024×440 under rail fade~~ (fixed ui-polish-46); at 844×390 the lower Shipworks callouts start below the fold.

## Shipworks callouts on a short desktop: Cargo clears the foot (ui-polish-46)

**Before (master 559a5d0116):** at 801–1100 wide and ≤460 tall each hull callout was a two-line card (name over OPEN / S, ~29px). Under the nameplate the left column (Utility · Drive · Cargo) needed ~90px, so at 1024×440 Cargo's card ran to y≈371, past the stage (356) into the pinned foot's fade and the foot itself. The right column (Shield … Mining) was a tight 4×29px stack too.

**After (`src/ui/orrery/shipworksLayouts.js`, CSS only, the existing `801–1100 × ≤460` hover block):** in that band the name and its state share one line (~18px card). The solver measures the cards live, so at 1024×440 the left column ends at y≈336 (Cargo), clear of the fade, and the right column has air between rows. Selected and dimmed states are unchanged. Selectors and IDs are unchanged.

**Checked:** 1024×440, 900×420 and 1100×460 (whole column on-frame at first view), and 844×390 (better, but Mining, Drive and Cargo are still below the fold there; the berth scrolls by design). 960×540, 1280×720 and 1920×1080 are pixel-identical to master (the rule needs ≤460 tall). 390×844 is out of the band (≥801 wide only), and the bench reads it clean. Bench findings at 1024×440 stay 6 → 6 and at 844×390 14 → 14 (the head's next-step and mechanic notes, plus the below-fold remainder). Shots: `/workspace/spaceface-scratch/ui-shots/polish46/{before,after}/`, `compare-1024x440.png`, `compare-1024x440-crop.png`, `compare-900x420.png`, `compare-1100x460.png`, `compare-844x390.png`.

**Leftovers (not this pass):** Research dial crowded under ~500px of stage; ~~Station Ledger right column at 800×600~~ (fixed ui-polish-45); at 844×390 the lower Shipworks callouts start below the fold; ~~with a slot chosen at 1024×440 the chooser's CARGO · S / COMPATIBLE MODULES 1 heading stacks tight~~ (fixed ui-polish-47).

## Shipworks chooser head on a short desktop: CARGO · S / COMPATIBLE MODULES (ui-polish-47)

**Before (master be835243a1):** with a hardpoint chosen at 801–1100 × ≤460 the 190px rail showed Back, then "CARGO · S", then "COMPATIBLE MODULES 1" wrapping under a 10.8px line-height at .2em tracking — three tight lines (~75px head) before the module list.

**After (`src/ui/orrery/shipworksLayouts.js`, CSS only, the existing `801–1100 × ≤460` hover block):** Back keeps its row; the kicker and title share one wrap band as "CARGO · S /" over "COMPATIBLE MODULES · N" (nowrap each, .1em / .03em tracking, 1.3 line-height; review fix: at .06em a two-digit count — Utility 45, Weapon 19 — ran 6px past the 190px rail and clipped, so the title tightens to .03em and a longer count drops under the title instead of clipping). Head height 75→59px; list starts earlier. Selectors and IDs are unchanged.

**Checked:** Cargo chooser at 1024×440, 900×420, 1100×460 and 844×390. 960×540 / 1280×720 / 1920×1080 idle Shipworks are effectively pixel-identical to master (rule needs ≤460 tall; >8Δ pixels = 0%). 390×844 is out of the band. Shots: `/workspace/spaceface-scratch/ui-shots/polish47/{before,after}/`, `compare-1024x440.png`, `compare-1024x440-crop.png`.

**Leftovers (not this pass):** Research dial crowded under ~500px of stage; at 844×390 the lower Shipworks callouts (Mining / Drive / Cargo) still start below the fold (berth scrolls by design).

## Research dial on short viewports (ui-polish-48)

**Before (master c5f81484da):** at ≤500px tall the Research grid kept its full-width foot row (`‹ Back` · ESC · zoom, ≥44px plus a row gap), and the dial's stage stopped above it. The dial is height-bound there (its radius is half the stage height less the rim-word margin), so the stage lost ~50px and the dial shrank to ~245px across at 1024×440 and ~180px at 844×390. The stars piled into each other and the label solver dropped most of the names, while the band under the dial held only Back on the left. At 1101–1400 wide and ≤640 tall the reading scrolls, and its gutter cut "RESEARCH POINTS" to "RESEARCH POI" (1280×480).

**After (`src/ui/orrery/constellationLayouts.js` only, CSS):**
- New `min-width:761px and max-height:500px` block. The foot moves under the reading (`". foot"` in the grid areas, column 2, row 3) and the stage spans all three rows of column 1, so the dial gets the full height. The foot wraps if `› Recentre` doesn't fit. The legend sleeps here, as it already does at ≤1100 wide. The reading column keeps its height, because the foot row is unchanged.
- In the existing `761+ × ≤640` block, cost words (`.con-cost dt`) can wrap, so "Research / points" lifts like it does at ≤1100 wide.
- Approximate dial size: 1024×440 ~245→~300px across, 960×480 ~285→~315px, 1280×480 ~310→~360px, 844×390 ~180→~210px. More stars stand apart and more names print (Attack Topology, Strike Craft, Heat Lure, Long-Range Survey, Kinetic Drivers…). Selectors, IDs and `constellation.js` are unchanged.

**Checked:** bench `tech-tree` and `tech-tree-progress` at 1024×440, 960×480, 1280×480, 844×390 (plus walk clicks at 844×390 and 1024×440, where Back · 1.0× · › RECENTRE fits on one line under the reading), and 390×844, 960×540, 1280×720, 1920×1080. No new rule matches the regression sizes. At 960×540 the dt rule matches but the ≤1100 rule already wraps, so the only pixel churn is the name type-on and star twinkle animations (<0.3% of pixels). Bench findings for tech-tree-progress: 1024×440 4→0 (the hour-verb line no longer sits over the COMBAT 4/17 rim word), 960×480 0→0, 1280×480 4→4 (the pre-existing hour-verb box vs the faint Deflector Theory label; the text doesn't touch), 844×390 6→6 (adjacent star hit boxes, 17px). Shots: `/workspace/spaceface-scratch/ui-shots/polish48/{before,after,after-walk}/`, `compare-1024x440.png`, `compare-960x480.png`, `compare-1280x480.png`, `compare-844x390.png`, `compare-1280x480-reading-crop.png`, plus the regression compares (not committed).

**Leftovers (not this pass):** ~~Research dial crowded under ~500px of stage~~ (short frames fixed in ui-polish-48). It is still dense where the dial's column is narrow, because the dial is width-bound there (side labels need ~150px each side): 800×600, and 844×390 in the Combat sector. Fixing that needs instrument geometry. Also, at 844×390 the lower Shipworks callouts start below the fold.

**Review fix (Code Work):** at 1401+ wide × ≤500 tall the foot (now in the reading's column) wrapped on "DRAG TO PAN · WHEEL TO ZOOM" and took a row from the reading (1440×500 lost Pulse Laser S under UNLOCKS). The short-frame block now sleeps `.con-view__word` as ≤1400 already does, so the foot keeps one line and the reading matches master height at 1440×500, 1600×480 and 1920×500. Note: in this band (≥1101 wide × ≤500 tall) the legend and the pan/zoom hint no longer show — the same trade the ≤1100/≤1400 rules already make.

## Codex on a very short desktop window: the reading gets the height (ui-polish-49)

- **Before (master c5f81484da, 844×390, 801×390, 900×420):** the section list already cleared CLOSE (ui-polish-32), but the plate sat at mid-height and the reading is sized to end at the plate's foot, so the stage kept a ~68px dead band above CLOSE. The reader got ~150px: on `codex-record` the entry's first record line was hidden entirely, on `codex` at 801 only one line of the opening sentence showed, and the bench flagged the clipped body under PREVIOUS (4–6 ON TOP OF on `codex` 844/801 and `codex-record` 900×420). The scroll-extent thumb also drew through the entry number's "0".
- **After (`src/ui/orrery/archiveLayouts.js`, CSS only, inside the existing `@media (max-width:1100px) and (min-width:801px) and (max-height:460px)` block):** the plate stands on the hang's foot (`top:calc(100% - 48px - var(--cx-plate))`), so the reading ends level with the section rail and gains ~60px. B0's whole opening paragraph now shows above PREVIOUS / NEXT, and `codex-record` shows its first record. The rail's last rung keeps 36px under it when scrolled to the end, so the selected The Record isn't left in the 34px fold. The scroll thumb rides the reading's left gutter (`left:-10px`, as on phones).
- **Checked:** bench `codex`, `codex-record` at 844×390, 801×390, 900×420, 1024×440 are 0 findings. `--walk` at 844×390 exercised all nine sections, NEXT and CLOSE. 960×540, 1280×720 and 1920×1080 are outside the band and match master up to plate needle/wedge animation noise. 390×844 phone is pixel-identical. Focused tests `fb-codex-world-tab`, `packet-codex-b-contracts`, `world-remembers-codex` and `infer-ending-archive-entry` pass.
- **Shots:** `/workspace/spaceface-scratch/ui-shots/polish49/{before,after}/`, `compare-codex-{844x390,801x390,900x420}.png`, `compare-codex-record-{844x390,801x390,900x420}.png` (before left, after right).
- **Leftovers:** at 801×390 the meta line STORY · THE EIGHT BEATS wraps to two lines. The ARCHIVE section's still sits under the reader fade at 844×390, so you have to scroll to reach it.


## Credits short desktop: section ladder clears ‹ BACK (ui-polish-50)

**Before (master c5f81484da):** on a short desktop window (651–1100 × ≤460, e.g. 1024×440) the five-rung Credits section ladder kept 48px rungs and spilled through ‹ BACK; at ≤900 (844×390 / 801×390) the stacked MADE BY reel head (SPACEFACE) printed over the foot. Real phones in landscape (`data-sf-mobile="1"`) already used the mobile layout and were clean.

**After (`src/ui/orrery/settingsLayouts.js` only, CSS, `html:root:not([data-sf-mobile="1"])`):** in `651–1100 × ≤460` the frame pads and row gap close up, title/subtitle shrink, hang stays in its row (`overflow: auto` instead of painting through the foot), ladder rungs drop to ~26px, reel head / SPACEFACE / foot compress, and the orrery parks further right with its body name hidden (ladder + reel already name the section). A tighter `≤900 × ≤460` block further trims the horizontal rail and reel padding so SPACEFACE clears ‹ BACK. Selectors and IDs are unchanged.

**Checked:** DOM at 1024×440 — last rung bottom 232, foot top 402 (gap ~170); at 844×390 — SPACEFACE bottom 176, foot top 352 (gap ~176). Bench `credits` 0 findings at 844/801×390, 900×420, 1024×440, 960×540, 1280×720, 1920×1080; phone 390×844 and phone-land 844×390 stay ~pixel-identical (0.1–0.4% churn). Walk at 1024×440: 14 controls. Shots: `/workspace/spaceface-scratch/ui-shots/polish50/{before,after}/`, `compare-1024x440{,-crop}.png`, `compare-844x390.png`, `compare-801x390.png`, `compare-900x420.png` (not committed).

**Leftovers (not this pass):** Settings Automation conduct-strip labels vs short beams at 960; Achievements / Quit / pause / statistics short-desktop or phone clipping; STORY · THE EIGHT BEATS wrap @801×390 and ARCHIVE image under reader fade @844×390 (Codex — owned by open #412). Shipworks / Research dial / Codex short-desktop owned by open #410–#412 — do not push those branches.
## Statistics on a very short desktop: TRADE clears ‹ BACK; LAW on first paint (ui-polish-51)

**Before (master 72df18627f):** at ≤460 tall the existing ≤820 short rule still left TRADE's lower rows hard-clipped mid-glyph against ‹ BACK. At 1024×440 "Biggest profit" was sliced under the foot; at 844×390 only "Trades" showed and LAW never reached first paint.

**After (`src/ui/orrery/statisticsLayouts.js` only, CSS):**
- New `@media (max-height:460px)`: tighter title / rows / caps, compact Back, stage foot fade (`mask-image`) so a partial row dissolves instead of slicing letters.
- New `@media (max-height:400px)` (e.g. 844×390): subtitle sleeps, rows ~18px, so Flight → Law (Status / Heat) fit above ‹ BACK on first paint.
- Selectors and IDs unchanged. 960×540 / 1280×720 / 1920×1080 are pixel-identical to master (rules need ≤460 / ≤400 tall).

**Checked:** bench `statistics` 0 findings at 844×390, 1024×440, 960×540, 1280×720, 1920×1080. Pixel Δ (>8): 844 8.1%, 1024 6.4%, 960/1280/1920 0%. Shots: `/workspace/spaceface-scratch/ui-shots/polish51/{before,after}/`, `compare-{844x390,1024x440,960x540,1280x720,1920x1080}.png` (not committed).

**Leftovers (not this pass):** Pause EXIT / Main Menu vs foot keycaps at 844×390 and 1024×440; Automation conduct-strip labels vs short beams @960; Achievements / Quit short-desktop; Shipworks lower callouts below the fold @844×390. Open #411–#413 own constellation / archive / settings — do not push those branches.

## Pause on a short desktop: EXIT / MAIN MENU clears the foot keycaps (ui-polish-52)

**Before (master 72df18627f):** the dial places its banks from the full-frame host, so its last bank (EXIT / MAIN MENU) lands at about 0.72 of the height. The foot sat a full 48px frame margin plus a 2vw row gap above the bottom edge, so at 844×390 and 1024×440 the keycap strip (ESC Resume · P Photo · F5 Quick save …) printed on top of EXIT / MAIN MENU (bench: 10 tangled/buried findings at each size). At 844×390 the brief's Next line also started at x 461, against the GAME bank's LOAD.

**After (`src/ui/orrery/pauseLayouts.js` only, CSS):**
- **≥701 wide × ≤520 tall:** the pause frame's bottom margin is 14px, the foot's row gap is 6px and the build mark loses its paragraph margins. The foot sits on the bottom edge, so at 844×390 the keycaps start at y≈326, about 30px under EXIT (y≈293), and at 1024×440 at y≈376, about 50px under it. The dial, rows and selectors are unchanged.
- **701–900 wide × ≤460 tall:** the brief sits level with PAUSED (`top 26px`) and is `min(330px, 40vw)` wide, so it starts right of LOAD (x≈485). Next still fits on one line, above the SHIP bank.

**Checked:** bench findings went from 10 to 0 at 844×390 and at 1024×440. 800×500, 1024×500 and 1280×480 also have 0 findings. `--walk` reaches all 18 controls at each of these sizes. 1280×720, 1920×1080 and 390×844 (`--phone`) are pixel-identical to master. At 960×540 the only change is sub-threshold dial drift (no pixel off by more than 24), since 540 is outside the band. Focused tests pass: `pause-save-line`, `pause-ship-fit`, `pq-194-06-pause-shell`, `sf-275-pause-ownership` and `wave-c3-pause-kit`. Shots (not committed): `/workspace/spaceface-scratch/ui-shots/polish52/{before,after}/` and `compare-pause-*.png`.

**Leftovers (not this pass):** the Settings Automation conduct strip at 960 (settingsLayouts.js, open #413); Achievements / Quit on a short desktop; the lower Shipworks callouts below the fold at 844×390.

## Achievements on a very short desktop: medal orrery stays on (ui-polish-53)

**Before (master f496c9a448):** the medal orrery stands down when its stage is under 280px tall (`constellationMedals.js`). On a short desktop (≤~405px tall, e.g. 844×390) the title + 85px filter foot left the stage at ~265px, so `is-off` hid every ring and medal — empty void beside the reading. The reading dial stayed large, and the kicker wrapped ("ADVENTURE · NOT YET" / "EARNED").

**After (`src/ui/orrery/constellationLayouts.js` only, CSS, ACHIEVEMENTS block):**
- New `@media (min-width:761px) and (max-height:460px)`: tighter frame padding / row gap, compact title, filter words, word-scale (`--con-scale-h:26px`), Back keycap, and a smaller reading dial; kicker stays `nowrap`.
- New `@media (min-width:761px) and (max-height:400px)` (e.g. 844×390): a further trim so the stage clears ~315px and the orrery lights.
- Selectors and IDs unchanged. `constellationMedals.js` untouched.

**Checked:** DOM at 844×390 — stage 265→315, `is-off` → medals on-frame; kicker one line. Bench `achievements` 0 findings at 844/801×390, 900×420, 1024×440, 960×540, 1280×720, 1920×1080. Pixel Δ (>8): 844 20.4%, 1024 20.5%, 960/1280/1920 0%. Phone 390×844 pixel-identical. Quit stays web-hidden (`quitGame.js`). Automation conduct strip re-benched at 960×540 — labels sit under the beams (polish28w layout); no new tangle this pass. Shots: `/workspace/spaceface-scratch/ui-shots/polish53/{before,after}/`, `compare-achievements-{844x390,1024x440,960x540,1280x720,1920x1080}.png` (not committed).

**Leftovers (not this pass):** Pause EXIT / Main Menu vs foot keycaps at 844×390 and 1024×440 (owned by open #415 — do not push `ui-polish-52`); Automation conduct-strip @960 (looks intentional under-beam layout; re-check if a live conducted state still tangles); Shipworks lower callouts below the fold @844×390 (berth scrolls by design); Codex STORY wrap @801×390 / ARCHIVE fade @844×390 if still open after #412 merge.

## Codex short desktop: STORY filed one line; ARCHIVE Play above the fade (ui-polish-54)

**Before (master b4fa1e24fb / post-#412):** at 801×390 the reader filed line `STORY · THE EIGHT BEATS` (`.cx-reader__filed`, 12px / `.2em`) wrapped to two lines in the ~217px reading column. On ARCHIVE at 844×390 the entry overflowed (`data-overflow=1`): the Play lamp sat under the reader fade mask, so you had to scroll to reach the still's Play control.

**After (`src/ui/orrery/archiveLayouts.js` only, CSS, inside the existing `@media (max-width:1100px) and (min-width:801px) and (max-height:460px)` block):**
- Plate slightly smaller (`min(138px, 38vh, 17vw)`) so the reading gains a few px of width.
- `.cx-reader__filed` at 10.5px / `.05em` — STORY · THE EIGHT BEATS and ARCHIVE · RECOVERED SIGNALS stay one line. (Review fix `d703bf0a76` dropped the original `nowrap`: GRAFFITI · BULKHEAD — THE PREVIOUS CREW was hard-clipped by it and now wraps to two lines, as on master.)
- Meta / legend use the same smaller tracking (wrap allowed so long ARCHIVE meta is not clipped).
- Tighter measure padding and `.cx-play { margin-top:6px }` so ARCHIVE Play fits in the first view; overflow clears and the fade mask sleeps.
- Selectors and IDs unchanged.

**Checked:** bench `codex` / `codex-record` 0 findings at 801×390 and 844×390. ARCHIVE probe: overflow 0, mask none, Play on first paint; STORY filed 1 line at 801. Smoke 960×540 / 1920×1080 / phone 390×844 clean (band is ≤460 tall). 1280×720 outside the band. Shots: `/workspace/spaceface-scratch/ui-shots/polish54/{before,after}/`, `compare-codex-801x390.png`, `compare-archive-844x390.png` (not committed).

**Leftovers (not this pass):** Automation conduct-strip live conducted state @960 (optional; under-beam layout looked intentional on last recheck); Shipworks lower callouts below the fold @844×390 (berth scrolls by design — only reopen if labels are truly clipped/unreadable).

## New Game at 960×540 and on a short desktop: the yard stands clear of the hull's copy (ui-polish-55)

**Before (master b4fa1e24fb):** the bench measured 960×540 clean, but the picture wasn't. The stage there is ~480px wide, so the five fittings stood as a column under the hero render (the S / S / M size letters sat under the ship) and the ring's LINE reading ran off the frame ("5.5k wu/"). At ≤460 tall (801/844×390, 900×420, 1024×440) the stage had ~305px for the name, the fittings, the stats ring and the run's scale. The yard clamps itself above the run, so it rose over HITCH and its sentence, THRUST / MASS / LINE printed on the fittings, and the form column showed only CASUAL (STANDARD, the default, was under the fold).

**After (`src/ui/orrery/newGameLayouts.js` only, CSS, desktop only via `html:not([data-sf-mobile="1"])`):**
- **801–1100 wide × ≤600 tall:** the hull's sentence stands beside its name, and the fittings wrap as rows across the stage under it. The hero box (which both the yard and the stats ring measure) narrows to 52% and centres, so MASS and LINE stand inside the stage. The run keeps its step titles only: the hover beats are `display:none` here, which is what the `max-height:800px` rule meant before a later `display:block !important` undid it. That gives back ~90px the yard was reserving.
- **Same width × ≤460 tall:** the frame margin closes to 20px and the row gap to 10px. The run's scale, the screen tagline and the insurance footnote become visually hidden (still in the accessibility tree), so the yard centres on the hull alone and all four difficulty stops show above LAUNCH. The fittings are 10.5px with a three-row cap (they scroll past that; Pelican's seven fit in three), and the name is 28px with its line beside it.
- Selectors, IDs, loadout data, `yardCarousel.js` and `hullRing.js` are unchanged.

**Checked:** bench `new-game` findings went from 6 to 0 at 844×390, and stay 0 at 801×390, 900×420, 1024×440, 960×540, 1024×600 and 1100×540. `--walk` at 844×390 and 960×540 reaches all 12 controls, and the turned Pelican and Wasp hold the layout. 1024×768, 1100×620, 1280×720, 1366×768, 1920×1080 and the phone (`--phone` at 390×844 and 844×390) are pixel-identical to master. Focused tests pass: `new-game-seed-input` and `new-game-start-transition`. Shots (not committed): `/workspace/spaceface-scratch/ui-shots/polish55/{before,after,walk6}/` and `compare-new-game-*.png`.

**Leftovers (not this pass):** Clips' empty state at 844×390 (A KILL / SCORE A KILL over the LAND A NAMED STUNT line); the legacy `ship` screen at 844×390 (Cargo / OPEN callouts over the hull's sentence); the `orrery-flight` direction proof is cramped at 844×390 (a preview, not the live HUD); Shipworks lower callouts @844×390 (berth scrolls by design).

## Clips empty reel on a short frame — session notes (2026-10-15, ui-polish-56)

**Before (master 72d47e7bf8):** at ≤460 tall (844×390 / 801×390 desktop and phone landscape) the empty-reel ghosts sat on the rail with the readout still at `bottom:92`, so "SCORE A KILL" / "LAND A NAMED TRICK" / "PULL OFF A SAVE" printed through "LAND A NAMED STUNT OR A KILL — THE REEL CATCHES IT HERE" (bench: 4 ON TOP OF findings).

**After (`src/ui/screens/clips.js` + `styles/ui.css`):**
- `layoutGhosts` on hosts ≤460 tall shrinks ghost art (`artRatio` 0.36) and lifts plates farther above the rail (mid 108 / side 72) so the subs clear the readout.
- Short CSS (`min-width:641px` × `max-height:460px`): rail `top:12%`, readout `bottom:64px`, tighter count/runtime and ghost type. (Review fixes: the rail lift and readout drop are scoped to the empty reel, `.orr-clips:has(.orr-clip__plate.is-ghost)` — un-scoped, they put a populated reel's trim instructions under EXPORT at 844×390 — and follow `layoutGhosts`' own gate, `max-height:460px` at any width, so 640×400 / 600×400 ghosts no longer sit on the readout.)
- Phone portrait and every size above 460 tall are untouched.

**Checked:** bench `clips` 0 findings at 844/801×390, 900×420, 1024×440, 960×540, 1280×720, 1920×1080, phone 390×844, and `--phone` 844×390. Pixel Δ (>8): short frames ~8–9%; 960/1280/1920/phone-portrait 0%. Focused tests pass: `pq-160-01-auto-clip`, `verb-22-amended-clip-rating`. Shots (not committed): `/workspace/spaceface-scratch/ui-shots/polish56/{before,after}/`, `compare-clips-*.png`, `phone-land*`.

**Leftovers (not this pass):** the legacy `ship` screen at 844×390 (Cargo / OPEN callouts over the hull's sentence); the `orrery-flight` direction proof cramped at 844×390 (preview, not the live HUD); Shipworks lower callouts @844×390 (berth scrolls by design).

## ORRERY flight proof (`orrery-flight`) on small frames (2026-10-16, ui-polish-58)

**Before (master b602ddebaf):** the direction proof was composed on 1920×1080, with fixed pixel positions for the lock and threat rings and a 640px tape. At 844×390 the speed dial printed over "Helios Prime", the tape over the sector line, the toasts sat inside the radar, and the lock ring and raider marker were off the frame (bench: 14 findings). At 960×540 the tape ran into the place block and the lock was off-frame. At 1280×720 the raider marker was off-frame. In a 390×844 window the tape covered the place block and the radar sat on the ordnance (18 findings).

**After (`src/ui/orrery/flightPreview.js` only; the bench preview, not the live HUD):**
- The tape's width comes from the window (≤1100 wide or ≤460 tall: 42% of the width, capped at 460px; ≤640 wide: full width). Its title stays on one line.
- The rings follow the window: the threat channel rings the frame's middle (where the ship is), the raider marker stands at the right edge, and on a full frame the lock keeps its 1920 spot, scaled. On small or short frames the lock stands beside the ship, and its ring is smaller with the label moved in to match.
- **≤1100 wide:** place block .9, toasts under the tape on the right, radar .6.
- **≤460 tall:** cluster scale .42, place .84, toasts .84 (300px) at top right, radar .5 (its RANGE foot is counter-scaled so it stays readable).
- **≤640 wide window:** tape row, then the place block with the radar beside it, then the toasts, the lock and threat, and the cluster at the foot.
- 1920×1080 is unchanged (0.09% pixel delta, from the animated sweep only).

**Checked:** bench `orrery-flight` findings went from 14 to 4 at 844×390, from 18 to 6 at 390×844, from 12 to 6 at 960×540, and from 8 to 6 at 1280×720. It is 4 at 801×390, 1024×440 and 1366×768, and 0 at 1920×1080. All the remaining findings are the Cluster's curved class line (HITCH · KESTREL CLASS · STARTER) touching its own Shield/Armor legend at cluster scale ≤.6. That also happens on master at 960 and 1280, and it lives in the shared `flightCluster.js`. The focused test `orrery-speed-dial` passes. Shots (not committed): `/workspace/spaceface-scratch/ui-shots/polish58/{before,after}/flight/` and `compare-orrery-flight-*.png`.

**Leftovers (not this pass):** the Cluster class line vs legend at scale ≤.6 (shared with the live HUD through `hudAdapter`, so fix it there and check it live). The live HUD cluster has no short-frame step (it stays at .6 at 844×390). My Ship hull callouts at 1101–1160 wide (in #423's `#sf-ship` CSS). Shipworks lower callouts at 844×390 (the berth scrolls by design).

## My Ship (flight host) on small frames — session notes (2026-10-16, ui-polish-57)

**Before (master 72d47e7bf8):** Pause → My Ship (`ship`) kept fixed 230 / 1fr / 285 columns at every size. At 844×390 the hull had a 185px column, so the hull's sentence, the slot callouts (Cargo / OPEN) and the ship ran into each other (bench: 6 ON TOP OF). At 960×540 the sentence and callouts crowded a 300px stage. In a 390×844 desktop window the hull column was 0px wide and the screen showed only the fleet card and a clipped systems rail.

**After (`styles/station.css`, CSS only, scoped to `#sf-ship` on non-mobile hosts):**
- **641–1100 wide:** the fleet card stands over the systems column (`clamp(220px, 28vw, 285px)`) and the hull takes the rest of the frame. The sentence gets a dissolved pad behind it and its scroll box ends on a whole line (4 lines). (Review fix: the split now runs 901–1100 wide, or 801–1100 on a window ≤460 tall. Narrower, it left the hull ~300–550px: at 641–800 the callouts printed over the stat strip — 641×800, 641×461, 761×460 went 0 → 2–6 vs master — and at 780–880 × 500–700 the sentence printed over the hull's top callouts, 6 → 10 vs master at 780–844×600. Those sizes now take the stacked layout below: 0 findings across 761–1100 × 390–800 except 801×390/460, 2 (master 6).)
- **≤460 tall:** frame margin 14/20px instead of 48px, hull name 26px, sentence 12.5px in a 3-line scroll box.
- **≤800 wide, or ≤900 wide above 460 tall (desktop window):** the fleet card, hull and systems stack and the screen scrolls; 420px stage, sentence in a 4-line box.
- Real phones (`data-sf-mobile="1"`) keep `mobileScreenLayouts`' own flow. Selectors and IDs are unchanged.

**Checked:** bench `ship` 0 findings at 844×390, 960×540, 1024×440, 1280×720, 1920×1080 and 390×844 (6 → 0 at 844×390). 1280×720 and 1920×1080 are pixel-identical to master. Focused tests `pause-ship-fit` and `instrument-hierarchy-six-screens` pass; `station-field-hardware` has one failure (stylesheet order) that also fails on master. Shots (not committed): `/workspace/spaceface-scratch/ui-shots/polish57/{before,after}/`, `compare-ship-*.png`.

**Second pass, desktop sizes (same PR):** the build hero (GENERALIST) joined the band row, but the old sizes still assumed four. At 1101–1366 wide the five numbers overprinted each other ("DOCKED CAN TOW GENERALIS", cut at the plate's edge); above 1366 GENERALIST dropped to a second row and pushed SAVE FIT under the plate (1440×900, 1920×1080). Now, at ≥1101 wide, the numbers size to the band's own width (`container-type: inline-size`, `clamp(18px, 5cqi − 10px, 47.52px)`), so the usual row holds on one line from ~1180 to 1920 and a long build name wraps whole instead of overprinting. At 1101–1240 the stage floor drops to 290px, the plate can take 56% and the handling columns close to a 12px gap, so SAVE FIT and Inertia/Brake stay on the plate. The sentence's dissolved pad now applies at every desktop width, since the hull runs under it up to ~1600 wide. Bench `ship` 0 findings at 1152×864, 1180×720, 1240×700, 1280×720, 1366×768, 1440×900, 1920×1080. Shots: `/workspace/spaceface-scratch/ui-shots/polish58/{before,after}/`, `compare-ship-*.png`, `crop-*.png`.

**Leftovers (not this pass):** at 1101–1160 wide (e.g. 1120×700) the hull callouts still meet the sentence and the right handling column runs past the plate (also on master); the `orrery-flight` direction proof is cramped at 844×390 (preview, not the live HUD); Shipworks lower callouts @844×390 (berth scrolls by design).

## My Ship at 1101–1240 wide: the hull gets the frame (2026-10-16, ui-polish-61)

**Before (master 8c1beaa539):** at 1101–1240 wide My Ship (`ship`) still used the 230 / 1fr / 285 columns, so the hull had ~460–560px. The slot callouts printed over the hull's sentence and over TAKE THE HITCH / RECORD / SELECT A SLOT, the ship was drawn tiny, the stat strip wrapped to two rows, GENERALIST dropped to a second row and the right handling column (Inertia / Brake) ran past the plate (bench: 12 findings at 1101×720, 1120×700, 1130×720; 2 at 1160×720; 10 at 1101×440, 1200×460, 1240×440).

**After (`styles/station.css`, CSS only, `#sf-ship` on non-mobile hosts):**
- The two-column split from ui-polish-57 (fleet card over the systems column, hull takes the rest) now runs to 1240 wide instead of 1100, on both of its media branches.
- The 1101–1240 three-column patch (290px stage floor, 56% plate, 12px handling gap) is removed, since that layout no longer applies there.
- ≥1241 wide and ≤1100 wide are unchanged. Selectors and IDs are unchanged.

**Checked:** bench `ship` 0 findings at 1101×720, 1120×700, 1130×720, 1160×720, 1200×720, 1240×700, 1241×700, 1152×864, 1101×440, 1200×460, 1240×440, and still 0 at 844×390, 960×540, 1280×720, 1920×1080 and 390×844. Pixel Δ (>8): 844/960/1280/1920/390×844 0%; 1101–1160 ~30% (relayout). Focused tests `pause-ship-fit` (3) and `instrument-hierarchy-six-screens` (9) pass; `station-field-hardware` still has its one stylesheet-order failure, same as master. Shots (not committed): `/workspace/spaceface-scratch/ui-shots/polish61/{before,after}/`, `compare-ship-*.png`.

**Leftovers (not this pass):** in the split layout (901–1240 × ~720) the systems rail scrolls, so DOCK TO EXTEND sits half under the rail's bottom edge until it is scrolled (same as ≤1100 on master); at 901–1100 wide the heroes still stack in two columns, so SAVE FIT sits at the stats plate's scroll fold (1100×720: half shown); sizing the heroes like ≥1101 does not help there, since that band is a grid (tried, reverted); Shipworks lower callouts @844×390 (the berth scrolls by design); Automation conduct strip @960 (optional).
