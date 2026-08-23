<!-- LIFETIME: REVIEW RECORD -->
# Station review — eight captured screens, 2026-08-23

Independent taste + vision review of the station after the polish pass (12px type floor, ~300
hand-typed colours tokenised, market rows and driver labels un-clipped). Judged from frames
captured the same day against `design/frontend/INSTRUMENT_GRAMMAR.md` and CANONICAL_BUILD_MAP
§11.7. Reviewer: Kimi K3 (vision), read-only packet.

## Controller note — what is verified, and the exact cause of finding #1

The top three findings are **clipping and collision defects, not taste**, and the first one is
diagnosed to the exact rule and measurement:

**The contract rail chops its own titles mid-word.** It is the first content after the header and
it reads "SCORT A CONVOY TO CUSTOMS GAT", "MUGGLE 8U / RADE HUB". Confirmed in the captured frame.

**CORRECTION, 2026-08-23 — the cause first recorded here was WRONG, twice.** This paragraph
originally said `.sx-ct-row__mid` is absolutely positioned and therefore ignores `min-width: 0`.
It is not: measured live, `position` computes to `static`. A second attempt blamed the grid item
overflowing its track and applied `overflow: hidden` + `max-width` + an ellipsis on the children.
That made the lab report `titleFits: true` on every row — and **changed nothing in the re-captured
frame**. It was reverted rather than shipped, because an ineffective change carrying a confident
comment is worse than no change at all.

What the evidence actually shows: the text is clipped at the **LEFT** as well as the right — the
first card reads "E: 8U FUEL CELLS TO CERES" with "FIRST TRAD" missing off the front. A title that
is merely too long clips on the right only. Left-clipping means **the cards overlap each other
horizontally** in the `overflow-x: auto` rail; each card's content is being covered by its
neighbour. So this is a rail positioning / stacking problem, not a text-length problem, and no
amount of ellipsis on the title will fix it.

Established facts for whoever picks this up: the card is 268px, the title element measures 310px,
the row grid is `20px 27px minmax(0,1fr) auto` with the title spanning `3 / 5`, and the lab
(mock data) and the captured frame (real game) do not agree about the title fitting — which is
itself worth knowing before trusting either surface alone.

Findings about hierarchy, density and the persistent amber resupply chip are art-direction calls
and are left to the owner.

---

# Station taste review — eight frames, judged against `design/frontend/INSTRUMENT_GRAMMAR.md`

Frames: `00-station-default.png`, `tab-market.png`, `tab-shipworks.png`, `tab-shipworks-focus.png`,
`tab-industry.png`, `tab-contracts.png`, `tab-factions.png`, `tab-bar.png`.

**Capture note before the review:** `tab-contracts.png` shows the same MISSIONS screen as
`00-station-default.png` — the tab row has no CONTRACTS tab (it runs MARKET · SHIPWORKS · INDUSTRY ·
MISSIONS · FACTIONS · BAR · LEDGER), and the MISSIONS tab is active in both frames. So there are
effectively seven distinct screens here. LEDGER was not captured at all. I judge what is visible.

---

## 1. The single cheapest-looking thing across all eight frames

**The contract carousel on Missions (00-station-default / tab-contracts, top band).** Every card in
the rail is clipped mid-word by its neighbour or the viewport edge — "SCORT A CONVOY TO CUSTOMS
GAT", "19U RAW RUBY AT BELT OUTPOST", "SPORT A PASSENGER TO COALITION", "MUGGLE BU / RADE HUB" —
and the lead card overlaps and occludes its own band label ("FIRST FLIGHT / RECOMMENDED DELIVERY"
is half-hidden behind the selected card). This is the first content the eye lands on after the
header, and it reads as a broken horizontal scroller, not a designed rail. A-list products do not
ship cut-off type on the lead element of a screen.

**Next two:**

2. **The ACTIVE MISSIONS card (Missions, bottom left) is itself clipped** — the card overflows the
   viewport bottom, its body text ("…Station Re…") is sliced by the frame edge, and it sits on top
   of the footer zone. The screen's own summary of what you've taken is cut off.
3. **The bottom-right collision on Bar (and Factions).** The last LEADS row's INSPECT button is
   rendered on top of the STATION COMMS badge; on Factions, "5 consequential relations mapped" runs
   into the same badge. Two different tabs colliding with the same shell widget means the shell's
   footer does not reserve its own space — a structural cheapness, not a one-tab bug.

## 2. Shell hierarchy

**What the eye hits first:** the big amber "RESUPPLY · 66 MUN · 792 CR" chip and the amber ACTIVE
outline on the HOLD badge — the two hottest, most saturated objects in the header — then
"5,000 cr", then HELIOS STATION. That ordering is *almost* right: the munitions warning is a real
state and deserves heat, and credits at DISPLAY size is correct. But the amber resupply chip is the
single most attention-grabbing element on all eight screens and it never changes — it is a
persistent alarm worn as chrome. After one screen of exposure it stops meaning "low munitions" and
starts meaning "the orange thing." Per §4, goal/warn colour should be spent on state, and this
state is stale within seconds of reading it.

**Active tab:** mostly unmistakable — cyan underline plus brighter label. One defect: on
`tab-shipworks` and `tab-industry`, the *neighbouring* tab also carries the dark active-fill block
(SHIPWORKS is filled dark while INDUSTRY is active, and vice versa), so fill alone lies; only the
thin underline tells the truth. Fill and underline should agree or the fill should go.

**GETTING STARTED strip:** a persistent amber-chipped tutorial band consumes a full row on every
tab. It is the second hottest persistent element after the resupply chip, it is not a state of the
station, and it compresses the actual stage on every screen. It should dismiss or collapse once
read; as permanent chrome it is exactly "worn, not spent."

## 3. Per-tab hierarchy

- **Missions:** The amber ACCEPT + BIND ROUTE bar leads, correctly — that is the verb. The route
  line (This station → in-sector → PREP fit + fuel → Ceres Refinery) is a genuinely good
  centerpiece idea. But between the summary row and the route line there is a large dead vertical
  gap, and the clipped carousel above fights the accept bar for first read.
- **Market:** Leads correctly: commodity rail → "Iron Ore" detail → CONFIRM PURCHASE. The buy panel
  (price, stepper, total, credits) reads in the right order. This is the best-organized tab.
- **Shipworks:** Leads correctly: HITCH at DISPLAY, then the verb sentence "Turns wide. Sluggish
  under load. Stops badly." — the grammar's "verb outranks the number" rule executed properly. The
  gauges and handling bars then read in a sensible order. Dense but hierarchical.
- **Shipworks focus (module drawer):** The COMPATIBLE MODULES overlay leads with the equipped item
  and the cost/SHORT figures — correct. Deltas carry ▽/△ shape channels, not colour alone — correct
  per §4.
- **Industry:** **Nothing leads.** "Refine Metals" is set at SUBHEAD-ish size under a quiet "REFINE
  · TIER 1" micro; the output card ("Refined Metals ×2") is the visual center of gravity but is
  unstyled dark-on-dark; the largest solid object on the screen is the muddy disabled "REQUIRES
  REFINERY STATION" slab at bottom right — i.e., the *denied* state is the hero. The one thing the
  player can do (source inputs in market) is two small text links.
- **Factions:** Leads correctly: SOLAR CONCORD NAVY at DISPLAY with the standing gauge, then the
  consequence web with CONCORD SELECTED. The standing ladder at the bottom is a good instrument.
- **Bar:** The portrait and CAPTAIN MAERA VOLS lead on the left — correct — but the transcript
  region, which occupies ~60% of the stage, contains one sentence. The screen's centerpiece is an
  empty room.

## 4. Colour discipline

Mostly semantic, with four specific violations:

1. **"NORMAL DEMAND" is amber on every market card.** Normal is the resting state; amber (goal) is
   being used as a category label, i.e., chrome. An actual demand spike has no hotter colour left to
   spend. Rest-state labels should be calm.
2. **Cyan (`--accent`, the roleless banned colour) is still the shell's interactive colour:** tab
   underlines, the HOLD badge border, the ACTIVE outline, the Shipworks node-graph edges, the
   "STATION EXCHANGE" tick, aligned-spillover edges on Factions. It means "selected/interactive" by
   convention, but that role is not in the grammar and the grammar says it may not be used on new
   surfaces. The Shipworks schematic in particular is a large field of saturated cyan dashes.
3. **Two greens mean different things.** You-green means "yours / good state" (hull bar, ROUTE
   CLEAR, READY, POWER +2/s) and simultaneously fills the entire market price chart as a decorative
   gradient area under a flat line. The chart is the largest single coloured area on any of the
   eight screens and it means nothing — it is not a gain, not yours, not a goal. That is the §4
   "uniformly saturated has no hierarchy" failure in one panel.
4. **The factions standing gauge ring is a full rainbow sweep** (red→orange→yellow→green→cyan) as
   decoration around "NEUTRAL 0". The ladder below it encodes the same thresholds semantically and
   better; the ring's hues carry no per-hue meaning.

Working, do not destroy: foe-red reserved for real deficits ("200 SHORT", "6,000 SHORT", RIVAL
edges); amber ACCEPT button as the goal verb; the ▽/△ shape channel on every delta; the
aligned/rival edge legend on Factions.

## 5. Density and rest

- **Too busy:** Missions top band (clipped carousel + summary row + risk block in ~200 px); the
  Market commodity rail area is dense but survives because the rail reads as one object.
- **Too empty:** **Industry** — the entire middle 60% of the stage holds two input cards, an
  "instant" arrow, and one output card, surrounded by void. **Bar** — the transcript void described
  above; the information on this screen (one contact, one sentence, three replies, three leads)
  deserves about a third of the space it occupies. **Missions middle** — the dead gap between the
  summary and the route line.
- **Oversized for its content:** the Market "LIVE STATION SCOPE" chart — a nearly flat line over 64
  samples given ~350 px of height and a heavy glow fill.

## 6. Consistency across tabs

Card language, type roles, chip styles, and the micro-label treatment are consistent across all
seven visible screens — the tokenization pass shows, and nothing looks imported from another
product. Three seams:

- **Shipworks is from a related but distinct design** (node schematic, gauge cluster, capability
  chips, build-identity strip). It is intentionally the "stage you orbit" archetype and it works,
  but it is the only tab whose stage is not DOM-cards-and-text, and its cyan edge field is where
  the `--accent` problem concentrates.
- **The module picker (shipworks-focus) is a centred modal dimming the whole screen.** The grammar's
  disclosure rule is an edge DRAWER; this is modal-over-screen. It is the only overlay of its kind
  in the set.
- **The Bar's photographic portrait** sits inside an otherwise flat, graphic UI. Whether NPC
  portraits are intended is a product call I can't settle from the image, but note the grammar's
  §9 standing ban on pilot-portrait motifs and the obvious tonal mismatch — one photoreal face
  among drawn UI.

One factual inconsistency a player could catch: the Factions gauge says NEUTRAL **0** ("30 TO
Accepted") while the standing ladder highlights the NEUTRAL column at **−29**. Two instruments on
the same screen disagree about the same value.

## 7. Is this A-list?

**No — but it is close, and the distance is now a short list of defects rather than a design
problem.** The shell, the type system, the colour *intent*, and the per-tab archetypes are
already at the bar. What keeps it out is a handful of clipped/colliding containers and two tabs
whose stages are under-filled. Smallest ranked set:

1. **Fix the Missions carousel clipping** (00-default/tab-contracts, top band): no card may cut
   another card's text, and the selected card may not cover the band label. This single fix removes
   the cheapest read on the whole station.
2. **Reserve the footer's space in the shell** (all tabs): STATION COMMS and the footer row must
   clip nothing — fixes the INSPECT collision on Bar, the overlap on Factions, and the cut-off
   ACTIVE MISSIONS card on Missions in one structural change.
3. **Make the active-tab fill truthful** (shell tab row): only the active tab carries the dark
   fill; today the fill leaks to a neighbour on Shipworks/Industry.
4. **Give Industry a leading element** (tab-industry, stage): promote the recipe verb and output to
   DISPLAY/SUBHEAD per the verb-outranks-number rule, demote the denied-state slab to a normal
   denied panel, and either fill the middle void with the production-chain centerpiece or tighten
   the layout so the emptiness is a choice rather than a gap.
5. **Fill or shrink the Bar transcript** (tab-bar, stage): the room-and-occupants archetype needs
   the occupants — until then, the transcript region should not claim 60% of the screen for one
   sentence.
6. **De-chrome the two persistent ambers** (shell): the resupply chip and the GETTING STARTED band
   need a read/acknowledged state that steps them down to calm; persistent alarm colour is training
   the player to ignore the colour the game spends on real warnings.
7. **Spend down the chart fill and the "NORMAL DEMAND" amber** (tab-market): chart to a calm line
   with no saturated area fill; demand labels to calm unless the state is actually hot.
8. **Reconcile NEUTRAL 0 vs −29 on Factions** (tab-factions, gauge vs ladder).
