<!-- LIFETIME: REVIEW RECORD -->
# Chart polish review — 2026-08-23

Independent taste + vision review of the star chart after the type-floor pass, judged from
captured frames against `design/frontend/INSTRUMENT_GRAMMAR.md` and CANONICAL_BUILD_MAP §11.7.
Reviewer: Kimi K3 (vision), read-only packet, no repository access beyond the frames and the
binding grammar.

**Controller note.** Findings 1, 2 and 5 are art-direction calls and are the owner's to make.
Finding 3 is verified as a structural duplication: `src/ui/map/mapNavContext.js` emits
POSITION / TRACKING / DESTINATION / NEXT LEG, and the inspector's Overview renders "the four
always-present navigation answers" (`galaxyMap.js:6424`) — the same values, twice, on one
screen, with the floating copy sitting over the stage. Finding 4's premise is partly a limit of
judging a JPEG: the selected tab already carries colour, weight 600, a panel fill and an inset
accent bar. What DOES hold is that all nine tabs share one 12px size with no primary/secondary
tier, so the type system's four roles are unused there.

---

# Frontend taste review — Chart polish pass (read-only)

Judged frames: `.devshots/perf/galaxy-map.jpg` (after), `galaxy-map-before.jpg`, `system-map.jpg`,
`local-map.jpg`. Judged only what is visible in the captures; motion, hover, keyboard and the
reduced-motion / forced-colors / pseudo-loc matrix cannot be assessed from stills and are noted as
unverifiable, not passed.

## Verdict in one line

The label-size fix is real and worth having (8 px → readable chart labels is the difference between
"broken" and "usable"), but **the pass is not enough**: the screen still reads as a cheap admin
console because the left rail, inspector and apron have no hierarchy and no idea — everything is the
same weight, and the actual star field is an afterthought wedged between chrome.

---

## 1. What still reads as cheap — exact regions

- **Left LENSES rail.** Nine lens rows (SERVICES, HOLDINGS, DISCOVERY / ROUTE, MISSION, PRESSURE /
  EVENTS, SECURITY) are all the same size, same weight, same single-line box, differing only in the
  diamond colour at the right edge. Nothing is selected-looking vs unselected-looking at a glance —
  every lens appears armed at once, which the "10/10" counter reinforces. A rail of nine identical
  toggles with no grouping beyond a thin "PLACE / FLOW / TROUBLE" micro-label is a settings panel,
  not an instrument. This is the largest single cheap region in all three frames.
- **Inspector tab block (top-right).** Eight tabs — OVERVIEW, TRAVEL, MISSIONS, ECONOMY, THREAT,
  CAREERS, SERVICES, DISCOVERY, HISTORY — in three rows, all one size, one weight, one grey-blue,
  with the only active state being a border on OVERVIEW. Nine tabs with no size or weight separation
  means nothing leads; §3's "the verb outranks the number" and the four-role type system are both
  unused here. It reads as a `<div>` grid of buttons, which is what it is.
- **The POSITION/TRACKING floating card (mid-left of the star field, e.g. galaxy-map.jpg).** A
  dark slab dropped *on top of the map canvas* containing POSITION / TRACKING / DESTINATION /
  NEXT LEG rows with faint square-bracket bullets. It duplicates the inspector's own "WHERE YOU ARE"
  block (POSITION HELIOS PRIME, TRACKING Beacon appear in both), floats over the chart it is
  supposed to annotate, and its `[` `-` `◪` marker glyphs look like decorative bracket punctuation —
  a banned polish antipattern per §9.
- **CARGO DECK apron (bottom strip).** A full-width band whose entire content on all three frames is
  "NO VIABLE DECK ROUTE" plus one grey sentence and a SORT·BEST chip. A ~15 % strip of screen
  carrying an empty state and one control reads as dead space, not rest. §12.9 says the EMPTY state
  must name what would fill it and carry a verb — the sentence ("Dock and scan markets…") half-does
  the first and there is no verb. Compare the two big actionable buttons in the inspector (RETURN TO
  SHIP, FRAME SHIP + DESTINATION): the apron's verb is a small chip in the far corner.
- **The galaxy star field itself (galaxy-map.jpg).** The STAGE — supposedly ~60 % of the screen and
  the thing the screen *is* — shows four labels (Helios Prime, Vesta Forge, Charon Expanse, Dione
  Lane) and a marker, and nothing else. No visible stars, no lanes, no pressure glyphs, no grid
  coverage, no depth. With LENSES 10/10 armed, ten layers are rendering something invisible. If
  this frame is genuinely "everything on", the chart reads as empty; if it is genuinely the whole
  galaxy, the density problem is on the data side. Either way, judged as a player sees it: a big
  dark rectangle with four chips in it. The before/after fix made the chips readable; it did not
  give the chart a subject.
- **The crest.** "WORKING" with a gold progress bar, "50 / 140", "thin security", a "?" button and
  "CLOSE" all compete in one line with the screen title STAR CHART and the scope tabs LOCAL/SYSTEM/
  GALAXY plus a second SCALE GALAXY label. The scope tabs and "SCALE GALAXY" say the same thing
  twice. At a glance the eye lands on the gold WORKING bar and the GALAXY pill — chrome, not state.

## 2. Visual hierarchy — where the eye lands

- **galaxy-map.jpg:** first fixation is the GOAL·BEACON chip + gold reticle cluster at dead centre —
  which *is* correct (the goal should lead). The problem is the second and third fixations: the
  POSITION card floats in from the left, and the gold WORKING bar pulls top-right. So the order is
  goal → duplicate-status-card → chrome. The chart's own subject (the star field) is fourth. Also:
  "GOAL · BEACON" and the ship marker and the Helios Prime label are stacked into one knot; at this
  zoom the labels collide visually even if not literally overlapping.
- **system-map.jpg:** the eye lands on "GOAL · ◆ AMBER DIAMOND" — again correct — but is immediately
  pulled left by "SEARCH AREA · Relief-Freighter Choir", which is the same size, same weight, same
  gold-ish treatment as the goal chip. The SEARCH AREA is a lens annotation yet it is dressed
  identically to the player's objective. Seven labels (Sanctioned Claim, Helios Station, SEARCH AREA,
  Coalition HQ, Helios Freight Spine, Gate→Ceres Belt, Gate→Tethys Junction, Gate→Vesta Forge) all
  sit at one size/weight tier; the only differentiator is teal for gates vs paper/gold for places.
  There are effectively two levels where the screen needs three (goal / place / gate).
- **local-map.jpg:** the asteroid cluster (grey dots, upper-right) is the most visually dense thing
  on the screen and pulls the eye first — ahead of the goal chip, ahead of your ship. A background
  layer is out-drawing the subject. The "734u 1468u 2224u" range-ring numerals render at DATA size
  but in the same dim tone as everything else, fine; the ring circles are nearly invisible, which at
  this zoom may be intentional.
- **Too few levels everywhere:** within every panel the rule is one size, one weight, colour as the
  only separator. §3 gives four type roles; the chart uses two (a small caps subhead and body) and
  DISPLAY appears nowhere — there is no single DISPLAY-sized element on the screen, violating
  §3's "every screen has exactly one DISPLAY-sized element". Nothing on the frame is 28 px+.

## 3. Colour coordination — semantic vs chrome

- **Good:** goal (gold/amber) is spent on the actual goal: the GOAL chips, the GALAXY scope pill
  when active, the reticle ring, "Beacon" in the tracking card. Teal is consistently used for
  gates/transit in system view. That is colour doing state work, and it reads.
- **Violations of the roles rule:**
  - The LENSES rail uses nine decorative diamond accents (teal, green, blue, gold, gold, green,
    purple, red) that encode *category membership*, not state. Per §4, calm (steel) is the colour of
    chrome at rest; here every row wears a saturated chip, so the rail is uniformly accented — the
    same "no hierarchy" failure the grammar cites the old cyan HUD for, just with more hues.
  - "WORKING" in the crest wears gold with a gold progress bar — gold is `--sf-goal`, "what you're
    heading for". A working/busy indicator is neither goal nor foe; it should be calm. Spending goal
    colour on chrome devalues the GOAL chips.
  - "Charon Expanse / Understory" and "Vesta Forge / Pitborn" subtitles render in green and red
    respectively. Red is `--sf-foe` ("against you"). If Pitborn's red means "hostile territory",
    fine — but nothing else on the frame corroborates the state (no icon, no word), so it is colour
    alone, which §4 bans ("never encode by colour alone… carries a second channel — shape, position,
    or a word").
  - The 80 % rule: at rest the surface is close to compliant (mostly calm+paper) — the violations
    are concentrated in the rail and crest, which is precisely where a player's resting eye sits.
- **Unverifiable from stills:** whether any of these colours animate against §5's table.

## 4. Density and rest

- **Too busy:** the top crest line (title + breadcrumb + search + slider + 3 scope tabs + SCALE
  label + status + counts + two buttons = eleven elements in one row) and the inspector's nine tabs
  plus two hero buttons plus a duplicated WHERE-YOU-ARE block. The inspector's top third carries
  more controls than the map does.
- **Too empty for what it carries:** the galaxy star field (four labels in ~60 % of the screen) and
  the CARGO DECK apron (one sentence across the full width). §11.7's "rest areas" means *chosen*
  calm around a dense subject; here the subject (the chart) is the emptiest region and the chrome is
  the densest — the inversion of the intent.
- **Dead duplication:** POSITION/TRACKING/DESTINATION/NEXT-LEG appears both in the floating map card
  and in the inspector's WHERE YOU ARE block, word for word. Duplicated readouts read as cheap
  because they signal the layout couldn't decide where information lives.

## 5. The five changes that would most raise perceived quality, ranked

1. **Give the chart a subject — galaxy star field.** Four labels and a reticle in 60 % of the frame
   is the single biggest "cheap" tell. Whatever the ten armed lenses are supposed to draw (routes,
   pressure, holdings, events), at least one of them must be visible in this frame, plus the star
   points themselves. An instrument whose stage is empty reads broken, and §12.9 applies to the
   stage, not just panes.
2. **Fix the LENSES rail hierarchy.** Kill the nine coloured diamonds or demote them to calm; make
   the *active* lens state a size/weight/fill difference, not a chip-colour difference; collapse the
   three groups into visually distinct bands (§3 MICRO labels exist — use the 12 px floor, not the
   current whisper-sized PLACE/FLOW/TROUBLE). Right now nine identical armed toggles announce that
   nothing is selected.
3. **Collapse the duplicated POSITION/TRACKING readout.** Delete the floating map card and let the
   inspector's WHERE YOU ARE own it (or vice versa — but not both). The floating card additionally
   uses decorative bracket glyphs banned by §9, and it occludes the stage.
4. **Re-dress the inspector tabs with the type system.** Nine tabs at one weight → primary tab row
   (SUBHEAD, 15 px) with the secondary six demoted to BODY 13 and calm, active state by fill+weight
   rather than a hairline border. This is the cheapest large win: no layout change, pure type role
   application, and it directly answers "the inspector panel's tab rows all share one weight and
   size, so nothing leads."
5. **Make the apron earn its strip.** CARGO DECK empty state: name what fills it *and* give it a
   real verb (e.g. the dock/scan action the hint sentence describes) at the same visual weight as
   the inspector's RETURN TO SHIP — or collapse the band to a single line when empty. A full-width
   band holding one dead sentence is rest the screen didn't earn.

## What specifically works (so it isn't lost)

- The before→after label legibility fix is correct and necessary; place names are now readable at a
  glance on all three zooms.
- Goal-gold is spent on goals and only (mostly) goals — the GOAL·BEACON and GOAL·AMBER DIAMOND chips
  are the correct first fixation on every frame.
- Gate chips in teal with the "→ destination" phrasing (system map) are the clearest semantic
  labelling on any frame: colour, glyph, and word all say "transit".
- The overall surface discipline (dark panel, 1 px edges, no glow spam, no cockpit/visor motifs) is
  grammar-compliant; nothing on these frames violates the banned-motif list.

## Not assessable from these frames (stated, not guessed)

Motion contract (§5), tier-2 hover disclosure, keyboard/gamepad STAGE control, reduced-motion and
forced-colors rendering, pseudo-loc +40 % behaviour, and screen state memory (§11.7 #3) — none can
be judged from stills.
