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
| **`mission-log`** / `missionLog` | **DONE** | See § Mission Log below — this session |
| **`credits`** | **DONE** | See § Credits below — this session |
| **`achievements`** | **DONE** | See § Achievements below — this session |
| **`statistics`** | **DONE** | See § Statistics below — this session |
| **`game-over`** / `gameOver` | **DONE** | See § Game Over below — this session |
| **`tech-tree`** / `techTree` / `tech-tree-progress` | **DONE** | See § Tech Tree below — this session |
| `flight` / `power-rail` | SURVEYED | Off-limits for threat markers (PR #300); polish chrome only later |
| `mobile-flight` / `mobile-stick` / `mobile-boost` / `mobile-brake` / `mobile-wheel` / `mobile-wheel-pinned` | SURVEYED | |
| `crucibleHud` | SURVEYED | |
| **`crucible-results`** | **DONE** (ui-polish-5) | See § Crucible results below |
| `orrery-flight` | SURVEYED | |
| `comms-radial` | SURVEYED | |
| `wingman-radial` | SURVEYED | |
| `ship` | SURVEYED | Ledger DONE earlier |
| `footprint` / `footprint-marked` / `footprint-clean` | SURVEYED | |
| **`range`** | **DONE @960×540** (ui-polish-17), **@1280 / mid-height + phone** (ui-polish-23) | See § Proving Range @960 and § Proving Range @1280 + phone below; 1920 unchanged |
| `chart` / `galaxyMap` / `chart-galaxy` / `chart-route` / `chart-local` | SURVEYED | Ledger DONE for chart shell |
| `station` / `station-dock` + tabs (`market`, `shipworks`, `industry`, `contracts`, `factions`, `bar`, `ledger`) | IN PROGRESS | Berth shell DONE (#333); phone berth + phone Market DONE (#335); Market/Contracts/Shipworks @960 + SPREAD done; Industry/Factions/Bar @960 done (ui-polish-13); Ledger already fit; Shipworks callouts @960 DONE (ui-polish-15) |
| **`crucible` / `crucible-door`** | **DONE** (Encounter / door) | See § Crucible door below |
| **`crucible-draft`** / armory | **DONE** | See § Crucible Armory below |
| **`crucible-rearm`** | **DONE** | Alias of armory / `crucible-draft` — no separate polish |
| **`crucible-refit`** | **DONE** | See § Crucible Refit below |
| `crucible-results` | OPEN | Follow-up PR (not #322) |
| `demoEnd` | SURVEYED | |
| `asteroid-works` / `drill` / `drill-claimed` / `drill-build` | SURVEYED | Own design law |
| `base` / `base-claimed` | SURVEYED | |
| `loading` | SURVEYED | |
| `automation` | SURVEYED | |
| `replay` | SURVEYED | |
| `clips` | SURVEYED | |
| `sandbox` | SURVEYED | Ledger DONE for overflow |
| `localmap` / `localmap-legacy` | SURVEYED | |
| `starmap` / `starmap-legacy` | SURVEYED | |

---

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

**Still open:** SWORN ENEMY touching HATED at 1024×768; Shipworks left-rail "Starter / systems fitted" clip at 960; phone Shipworks callouts.

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

## Proving Range @960×540 — session notes (2026-10-13, ui-polish-17)

**Before:** the title block (180px) and the foot (338px: a five-row rule ladder, the dossier and a 64px run gauge) plus the 48px kit row gap outgrew 540px. The stage, which holds the course itself, was squeezed to 0px, and RULES / BESTIARY / CLOSE and the run instrument fell below the frame.

**After (`src/ui/screens/range.js`, local style block only, `@media (max-width:1100px) and (max-height:640px)`, desktop only):** frame padding 20/40/12 and an 8px row gap, the corner count moves up with the title (40px), and the lamp key is 34px tall. The ladder words are tracked tighter, with 5px ticks and a 12px gap, so the 16 rules take four rows. The dossier and the run row close up, and the gauge is 40px. The course keeps ~146px (~110px when a long rule name wraps to two lines). The whole foot is on glass, and RULES and BESTIARY open their drawer over the stage. Type stays on the grammar scale. Selectors and IDs are unchanged. 1024×768, 1280, 1920 and phone don't match the query. Shots: `ui-shots/range960/`.

## Proving Range @1280 + phone course — session notes (2026-10-13, ui-polish-23)

**Before (master c8f43e53ee):** at 1280×720 the course (`.k-stage`) was ~85px; the 64px top pad, two 48px kit row gaps, a four-row ladder at ~42px a row and the 64px gauge took the rest. On phone 390×844 the course was **0px**: the 40px title ran four lines, the kit's title padding (it reserves the corner's width) squeezed every title line to 182px, and the 16 rules wrapped into a ten-row ladder (44px touch rows), so the foot alone was 641px. On phone 844×390 the course was also 0px.

**After (`src/ui/screens/range.js` only, local style block plus one small helper):**
- **Mid-height desktop** — `@media (min-width:1101px) and (max-height:900px), (min-height:641px) and (max-height:900px)`, desktop only. The top pad is 40px and the row gaps 22px; the ladder rows are ~34px with 6px ticks; the dossier and run row are 14px; the gauge is 48px. Course: 1280×720 **85→224px**, 1024×768 115→250, 1440×900 251→398. 960×540 still matches the short-frame block (146px, unchanged) and 1920×1080 is past 900px (385px, unchanged).
- **Phone portrait** (`data-sf-mobile`): the ladder is one row that scrolls sideways. The spine is a `background-attachment: local` rule so it travels with the words, the right edge fades, and `_keepRungInView` scrolls the live rung into view when NEXT RULE (or anything other than a tap on the ladder) changes it. The title drops the kit's corner padding: only the rule keeps 88px for the corner, at `var(--k-fs-menu)` (30px on phone). The score is 22px, the run gauge 36px, the gaps 12px, and the course row has a 200px floor. Course at 390×844: **0→384px**, and the foot (ladder, dossier, RULES / BESTIARY / CLOSE, run gauge) ends at 824. The longest rule ("A sheet collects loose mass onto the line") still fits without scrolling, with 330px of course.
- **Phone landscape (≤500px tall)**: the course takes the right 44% at full height (350×306, below the score), and the title sits over the foot on the left. Course at 844×390: **0→306px**.
- Drawer width is capped at the stage on phone. Type stays on the grammar scale (12/13/14/15/22 plus the kit token), and selectors and IDs are unchanged.

Shots: `ui-shots/range-course/before/`, `after/` (all sizes), `checks/` (drawer open, NEXT RULE ×6 rail scroll, longest rule).

**Live-build check (Code Work's ask, 06:10 ET):** the real game (`?dev=screen:range`, then Esc and the real F4 key) matches ui-bench at 960 (146px), 1280 (224px) and 1920 (385px). On a real touch phone the coarse pointer gives AGAIN / TRY IT EMPTY 44px rows, so NEXT RULE wrapped to its own row and the 390×844 course was 314px, not 384. Under `(pointer: coarse)` the verbs now share one row (10px gap, phone-sized lamp key, as on the phone Market): course 390×844 **314→364**, 375×812 285→335, 360×740 217→267; 844×390 is 318. The drone's name (BRUISER) is now painted last on a small void plate, so the gate rung and turn ring that pack under it on the narrow course no longer cut through the letters. Shots: `ui-shots/range-course/live/` (before) and `live/after3/`.

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

**Still open on phone:** Shipworks callouts. Desktop Shipworks callouts @960 fixed in ui-polish-15. Market decision @≤1100×≤800 fixed in #337. Industry/Factions/Bar @960 done in #340.

**Leftover:** filter search can still bury "Raw & rare" at 960; Contracts TRACKED badge can sit off-frame; Shipworks left-rail "Starter / systems fitted" can clip at 960.

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
| P1 | Settings / Video | Live HUD preview's FOV readout collides with the speed dial at 1280 width. |
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

## New Game yard fixes (`new-game`) — ui-polish-5 (2026-10-12)

CSS only, in `src/ui/orrery/newGameLayouts.js`. No DOM, selector, ID or loadout-data changes.

- **Fixed (P0, 1080p):** HITCH / SKATER sat on the *First 15 minutes* route and WASP was cut by the hero ship. Cause: the screen-wide 1.12 zoom from the earlier New Game pass. The yard carousel places hulls and names from `getBoundingClientRect`, so the zoom scaled those offsets twice. The zoom now applies only to the left column (header, fields, foot, fine print), the same way the 1440p rule in `screenLayouts.js` already does it. The yard, stage and route stay at 1:1, and the caption copy and loadout get a small type lift instead.
- **Fixed (P1):** hull names sit above every ship model, with a dark halo, so a hero's engine glow no longer covers a rear name.
- **Fixed (P1, 720p):** SHIELD BOOSTER ran into its size letter. The loadout name column is wider at ≤1366px.
- **Fixed (P1, 390×844):** PELICAN and WASP ran together in the *Start as* row. Names now size to their content, slightly smaller, with a fixed gap.
- Checked at 1280×720, 1366×768, 1920×1080, 2560×1440 and 390×844; `--walk` exercised 12 controls with all three hulls brought to the front. `test/yard-carousel` and the new-game tests pass (50/50). Shots are in `/workspace/spaceface-scratch/ui-shots/ng5/` (not committed).

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

