# Retired Swarm tests — the endless/deep course (C01-02)

C01-01 capped the Pit at thirty rounds (champions on 5/10/15/20/25/30, wave 30 clears to
victory, `swarmWaveOf` clamps everything above 30 to the final champion row). Every claim
below only existed on waves that can no longer occur, on machinery that can never fire
(wraps need a second rotation pass past wave 140; majors need a non-champion ≡0-mod-5
round), or on content whose only seat was a deep wave. One line per retired case:
test — what it asserted — why it is gone. Tests that were *rewritten* to the in-course
truth are not listed here; they still exist under their current names.

## test/crucible-a-list.test.mjs

- `five door arenas and four champions each change the room` (Quiet Choir block) —
  asserted the Quiet Choir's boss wave fields quiet_ghost packages at a far gate —
  the Choir's first rotation slot resolved to wave 60; the course ends at 30.

## test/seed-sw-35-burrower-4242.test.mjs

- `the burrower continues the roster clock without breaking the base catalog`
  (wave-70 block) — asserted `swarmBroodBossFor(70)` names brood_queen and her wave
  fields a pure-mite flood — wave 70 never occurs; the boss query now clamps to the
  wave-30 champion and returns null for brood rows.

## test/swarm-boss-escort.test.mjs

- `a wrapped command row keeps its attendants AND wears the guard — bounded by the
  shared cap` — asserted a deep command row's escort-plus-guard fold — wraps start past
  wave 140; no wave can reach a second rotation pass.
- `a wrapped escorted wave materializes hull plus attendants plus guard inside the same
  law` — asserted a wrapped escorted plan's full package materialization — same wrap
  machinery, unreachable.
- `solo rows keep the exact wrap law they shipped — the guard formula is unchanged` —
  asserted the wrap guard formula on solo rotation rows — unreachable machinery.

## test/swarm-champion-preview.test.mjs

- `the wrap rides along — wave 142 previews Iron Maw II, numeral and cycle included` —
  asserted the preview names an escalated deep champion — wave 142 never occurs.
- `deep runs name deep champions — The Tendril waits at wave 75` — asserted the
  next-champion lookup surfaces deep rotation rows — no wave past 30 can be asked about.
- `the wrap is announced as the escalation it is — Iron Maw II waits at wave 145` —
  asserted the wrap announce names cycle numerals — unreachable.

## test/swarm-champion-wrap.test.mjs

- `wave 145 is Iron Maw II — the same fight machinery wearing the escalation` —
  asserted the escalated row's package composition — unreachable.
- `the guard materializes as owed champion bodies and the card wears the numeral` —
  asserted wrap guard bodies materialize as champions — unreachable.
- `deeper wraps escalate monotonically — more pass, more guard, never hull` — asserted
  the cycle→guard curve across multiple wraps — unreachable.
- `a wrapped compositional row keeps its trick and gains the same guard` — asserted the
  guard folds onto a compositional row's packages — unreachable.

## test/swarm-event-minor-band.test.mjs

- `a major round is untouched — authored wager, warn voice, no band stamp` — asserted a
  major-band round deals its authored wager — every ≡0-mod-5 round through 30 is a
  champion round; `isSwarmEventWave` is never true inside the course.

## test/swarm-event-signature-decks.test.mjs

- `every signature in both decks is drawable through the real seeded path` — asserted
  major signature cards can be drawn — the major band never fires in-course.
- `each new card spends its field spec — no dead authored params` — asserted major
  signature defs' field specs are consumed — unreachable cards.
- `pylon_flip shoves where well_swing would gather — same chord, opposite sign` —
  asserted pylon_flip's pulse behavior — major-only card, unreachable.
- `sling_tide pours THROUGH the fight — apex up-current, dir down-tide` — asserted
  sling_tide's pulse behavior — major-only card, unreachable.
- `thaw_burst lets go from the middle; cold_snap lands where the player is at fire
  time` — asserted the cryo majors' pulse behavior — major-only cards, unreachable.
- `the wager honors telegraph and verdict — accept pays, refuse stands the room down` —
  asserted the wager contract on a major card — the wager machinery survives on the
  minor band (rewritten in swarm-event-wager), but no major round exists to deal from.
- `an unanswered new card resolves to its authored accept — opt-out pressure holds` —
  asserted wager timeout semantics on a major card — unreachable.

## test/swarm-brood-bosses.test.mjs

- `the rotation walks the champions — the brood champions land at waves 70 and 80` —
  asserted brood_queen/brood_tendril hold rotation slots 70/80 — both waves never occur.
- `the queen wave fields the flood — every body a mite, at the full population curve` —
  asserted the wave-70 queen plan is pure mites — unreachable.
- `the queen lands as a real capital boss and her score runs the fight` — asserted the
  queen materializes with capital_boss_brood_queen score — unreachable.
- `the queen's call lands real damage and act II requests her brood_screen wing` —
  asserted her score's act calls — unreachable.
- `the tendril lands as a real capital boss on wave 80` — asserted tendril
  materialization and score binding — unreachable.
- `the tendril wave arms the body — the chain trails the head and never touches the
  ship budget` — asserted the segment-chain wave contract — unreachable.
- `the sling counter: a rock severs the weave, a mid-link kill splits the body` —
  asserted the tendril's rope counter — unreachable.
- `the head dying collapses the whole body — the knot comes apart` — asserted head-death
  collapse — unreachable.

## test/swarm-late-strain.test.mjs

- `a wave-83 room hatches a marked mite share inside its own plan` — asserted the
  volatile strain hatches from wave 83 — debut is past the course.
- `the whole plateau hatches the strain every non-champion wave` — asserted the
  volatile plateau from its debut onward — unreachable.
- `the strain never spends a telegraph line — standing property, card debut` — asserted
  the strain's no-telegraph law at its debut wave — unreachable.
- `a marked body pops where it dies: signature shove + chip damage, pack shoved not
  killed` — asserted volatile pop mechanics — unreachable.
- `a marked body dying far out shoves the pack but touches no signature` — asserted
  distance falloff on the volatile pop — unreachable.
- `an explosion kill on a marked body still pops the strain` — asserted explosion-kill
  pop — unreachable.
- `the strain never changes the wave population` — asserted strain hatching is
  population-neutral at deep waves — unreachable.
- `the strain debuts on the card seam at its gate wave and only there` — asserted the
  volatile debut gate — unreachable.
- `a plated room hatches a marked mite share under the second mark byte` — asserted the
  plated strain from wave 97 — unreachable.
- `a plated body refuses everything but mass — and pops nothing when it cracks` —
  asserted plated immunity semantics — unreachable.
- `a blast scatters the plated body it cannot crack` — asserted plated knockback —
  unreachable.
- `the plated strain never changes the wave population` — asserted plated population
  neutrality — unreachable.
- `a commander room hatches one or two marked leaders under its own count band` —
  asserted the commander strain from wave 111 — unreachable.
- `a live leader's aura buffs its pack — and the buff dies with the leader` — asserted
  the commander aura — unreachable.
- `a commander death pops nothing, gates nothing, and the room never grows` — asserted
  commander death semantics — unreachable.
- `the Hive keeps its sac reserve and its own mites still carry the mark` (mark half) —
  asserted Hive mites carry a strain mark at deep waves — no strain hatches in-course;
  rewritten to assert the in-course truth (reserve kept, no mark).

## test/swarm-late-roster-band.test.mjs

- `the ten-clock stays clean: no band gate lands on a champion row` — asserted every
  late-band debut gate avoids boss rows — all five band debuts (31–55) sit past the
  course and clamp onto the wave-30 champion row; rewritten to pin that honest flag.

## test/swarm-late-roster-band3.test.mjs

- `the late reserve takes mirebulb but never a hold-back owner` (mirebulb half) —
  asserted mirebulb joins the late reserve from wave 61 — debut is past the course;
  rewritten to the in-course reserve law (burrower).

## test/w-bloom-low-remains-late.test.mjs

- `the new kinds throw, splash and spend exactly like the six — and the splash honors
  kill-gates` — asserted the wave-55 kinds (remora/keelback cohort) throw, splash and
  spend like the base six — wave 55 never occurs; the surviving shell claim was
  retargeted to wave 29.
