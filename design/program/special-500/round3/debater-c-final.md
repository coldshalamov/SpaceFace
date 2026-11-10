<!-- LIFETIME: CAMPAIGN -->
# Round 3 — Debater C final (Continuity: canon coherence / persistence semantics / physics honesty / register)

Cross-examination, round 2 verdicts of A (Builder) and B (Curator) read in full; every load-bearing
claim I lean on below was re-verified against the round-1 texts and the live tree this sitting
(`src/render/look.js`, `src/data/lookMoods.js`, `src/data/numbersShadow.js`,
`src/data/encounters/290-depth-h8-echo-of-player.js`). My final ballot differs from round 2 in
exactly the ways the debate should move a vote: one factual catch against A, ten conceded kills and
forty-one conceded/adopted merges, one merge direction held against B on the round-1 texts, and one
drop repaired before it reached print.

## Rebuttals

**The catch of the round — A's "one seam lie" is half a lie itself.** A's headline critique claims
`resolveLookPost` "does not exist in `lookMoods.js` or anywhere." It exists:
`src/data/lookMoods.js:339, export function resolveLookPost(profile)` — in the exact file sa3
cited, alongside `resolveLookEmissiveGain` (282), `resolveLookMoodId` (305) and `resolveLookMood`
(314). A grepped `src/render/look.js` and judged the family from the wrong file. The one genuine
absence is `resolveLookLighting` (I confirmed it is nowhere), so sa3's seam map was half right,
not invented. Consequences: A's H-44 against SP3-156 collapses as a *seam* argument (my kill
survives on other grounds, below); and the hones on SP3-018/SP3-031 soften from "corrected lie" to
"cleaner route" — the mood-overlay-data-file path through `beginLookMood`/`tuneLook` is still the
right build shape, and I have adopted it in my hones, but the record should show the round-1 seam
maps were more honest than A's correction claimed.

**Concessions — their case was better than mine; my vote moves.**

- **The eclipse family, to B.** My round-2 audit checked sectors, factions, calendar terms and
  named characters — and never checked the sky for repetition. Seven entries playing one phenomenon
  is a continuity error of exactly my kind: a world cannot have seven eclipses a season; it has one
  moon and many ways to stand under it. SP3-015, SP1-158, SP1-162, SP3-172 merge into the SP3-002
  chain (my SP3-002 HONE carries B's legs); SP3-019 stays as the world's paperwork about the sky,
  which is an institution, not a phenomenon. One held exception: **SP3-028** — moonrise is not an
  eclipse entry. It is the moon existing, a `signatureHero` sky-truth row. B kills the tail of a
  family it was never a member of.
- **The comet, to A and B jointly.** I merged SP1-068 into SP3-005 in round 2; both kept it chained
  to the perihelion window, and their chain is truer than my deletion: one canon comet, three human
  responses — the road (SP1-068), the race (SP1-123), the stone-fall (SP3-005). I switch to HONEs
  on all three.
- **The silence family, to B — and to my own round-2 note.** My ballot kept SP3-046 while my own
  critique called it "third and weakest." Cross-examination resolves the inconsistency in favor of
  the critique: the Silence is a place with etiquette (SP1-093); a weather front that ducks your
  audio during surges is that sensation rented twice. KILL SP3-046. SP3-148 merges into SP1-093 as
  a satellite site off one audio-gate seam (A and B agree).
- **The numbers stations, to B with A's evidence — both verified this sitting.** SP2-013 says of
  itself that it "mirrors the Vesta numbers-station loop with new ids," and `NUMBERS_SHADOW_STATION`
  ships at `src/data/numbersShadow.js:8`. Content that already ships, plus a third station: KILL
  SP2-013 and SP2-014. SP3-168 — a forecast sent to no one — is the one keeper.
- **SP1-098, to B, verified.** `290-depth-h8-echo-of-player.js` is live in `src/data/encounters/`,
  and SP1-098's own build seam cites it as "the shipped precedent." The world has one mirror trick
  and it is already in the game. KILL. (My round-2 hone — strip the scar prophecy — dies with it.)
- **SP3-166, to B, on the entry's own sentence.** "Nobody has gone to look twice" is round 1's
  text. An entry whose own prose pleads against it fails the wired-feature bar. KILL.
- **SP3-099, to B.** The clockwork yard (SP3-090) owns mechanical patience; a sweep, a pulse and a
  dust line is not a second claim on it. KILL.
- **SP2-055 and SP2-059, to B, checked against round-1 texts.** SP2-055's payoff is a one-shot
  heat modifier — a mechanic in a lore coat; SP2-059 is a mail-row gag. KILL both. MTS's voice
  survives in SP2-044; the Quiet's network lore lives in SP2-003 and SP2-058.
- **SP1-050, to A.** The mass-gated choke has no hull-size traversal seam — an audited absence, not
  a feeling. KILL, with one salvage order: the older sign ("or unload honestly, we all did") is the
  pool's best two-line sermon on labor history and must ride the Charon lane's build notes. A's
  SPX-A-01 (adopted below) keeps the navigation-archaeology romance alive.
- **Merge directions conceded:** SP1-017→SP1-103 (B's 12-line arc beats my round-2 fence-sitting —
  one lifetime beacon, twelve lines for a whole save); SP1-034→SP1-062, SP1-143→SP1-004,
  SP1-148→SP1-063 (B's family analysis is right on all three); SP1-175→SP2-086 (one lost-property
  institution — the board is the public face, the describe-the-label office the back room);
  SP1-169→SP1-159; SP2-141→SP1-084 (the scan-count reveal becomes the Resident's second act);
  SP2-142+SP2-158→SP1-030 (one fraud story in three acts is truer than three frauds — this world
  narrates scandal with a beginning, a middle and a monument); SP2-129→SP1-002 (the recess is the
  court's second case; the serialization lives inside one entry); SP2-104→SP1-056; SP2-089→SP1-097;
  SP2-096→SP1-168 (to A — with my directive that the florist is the storefront and the Charon
  garden the nursery, so "everything dead wants to be soil" moves into the graft's care copy);
  SP3-063→SP3-065, SP3-064→SP3-076, SP3-096→SP3-083, SP3-118→SP3-182 (confirmed on the round-1
  texts: chime + price fold + lamps is one core), SP3-146→SP1-059, SP3-148→SP1-093, SP3-150→SP3-033,
  SP3-161→SP3-012, SP3-164→SP1-001, SP3-165→SP3-162, SP3-011→SP3-171, SP3-040→SP3-010,
  SP3-039→SP3-170, SP3-032→SP3-155, SP3-037→SP3-019, SP3-008→SP3-003, SP3-020→SP3-006 (A and B
  agree), SP3-147→SP3-113, SP3-179→SP3-151, SP3-188→SP3-106, SP3-190→SP3-085, SP3-194→SP3-048,
  SP1-158/SP1-162/SP3-015/SP3-172→SP3-002.

**Held — attacks on KEEP votes I maintain, with my lens's reasons.**

- **SP3-126 is not SP1-087, rejecting B's merge.** A deliberately deorbited moon has owners,
  filings, insurance exposure and decades of paperwork; a drifting anchor has none. Scale and
  agency are continuity categories: the world records these two events in different voices, under
  different ledgers. Both stay. (SP1-155's rename to "The Broadside" already removed the title
  collision that started this family.)
- **The shift turn is three instruments, not one — rejecting B's merges of SP2-087 and SP3-183
  into SP3-144.** The round-1 text settles it: SP3-144 is the four-note *time signal*, pitch-shifted
  per station — a clock, not a liturgy. A station has a clock (SP3-144), a voice (SP2-087's
  per-type handoff), and a whistle (SP3-183's siren with its delayed echo). B's pacing worry is
  legitimate and is answered by my HONE on SP3-144: the stack layers — whistle leads, liturgy
  follows, the clock rides underneath — one audible fabric, never a simultaneous shout.
- **SP3-101 stays separate from SP3-143.** "The hum arranged" is the station singing to itself at
  rest; the hauling chorus is work sung on the move. Rest and labor are different songs, and this
  world's whole register is that difference.
- **SP3-103 stays separate from SP1-183.** The Drift Wake procession is a calendar rite — Senna's
  roll is calendar canon; SP1-183 is one hull's name on that roll. The rite is the calendar's; the
  funeral is the tug's. SP1-183 absorbs the bow-lamp visual; the rite remains public infrastructure.
- **SP3-082 stays separate from SP3-081.** The event and the world's paperwork are different verbs.
  This program's own spine (SP2-051, SP2-192) exists because the filing is the canon. The
  chronicle's photograph at the collision is canon presence, not a duplicate.
- **SP3-196 stays separate from SP3-044.** Seasons have firsts and lasts; the last meteor is the
  weather year's Tally Eve. The calendar's brackets are canon structure, not clones.
- **SP1-165 stays separate from SP2-091.** Absolution and filing are different sacraments, and the
  Choir would be the first to insist. The buoy absolves in receipt format; the booth files until the
  ending reads it back. One liturgy, two sacraments — my SP2-091 HONE harmonizes the grammar.
- **SP2-043 stays separate from SP1-191.** Gratitude FROM the rescued and fandom FROM strangers are
  different directions of mail. B's merge flattens the difference between being thanked and being
  noticed.
- **SP1-190 stays separate from SP1-097.** A ledger is kept; a garden just grows. The belt trusts
  the garden more — that trust is the entry. The chalk wall merges into the buoy ledger (one public
  record, two faces); the garden remains the world's own memory, with your hull color on it.
- **SP2-016 stays, renamed.** B kills it because "SP3-180 owns the name-roll beat." The round-1
  texts say otherwise: the roll call is the living answering for the dead; the hanging line at Eris
  is the dead transmitting names on their own at the bell, cut off mid-word. The dead not waiting
  to be asked is its own horror, and no second choir is needed for it (my rename hone stands).
- **SP2-100 stays, against B's invisibility kill — which the entry's own text answers.** "The
  Pattern noticed. It does not always. Today it did." The world explains itself once, in-world, at
  the moment it happens. That is legibility in this world's grammar: no counter on screen, one line
  of theology instead.
- **SP2-145 stays, against B's "typo gag" summary — which undersells the round-1 text.** The
  dockmaster's defense ("Typo? That is not a typo. That is how she spells it... We chart the world
  as it is.") is a small story about how the census loves its people. That is my lens's exact
  subject matter. Below my 500 line elsewhere, but alive.
- **SP3-071 stays, against B's "nobody will ever see it."** The jewelry-box moment is a real,
  physics-honest beat (ore catching season light), and it is weather touching economy. Kept alive;
  below my 500 line.
- **Against A: SP1-015 stays.** Two flags, two lawful audits. The Reach counts in hulls and
  tonnage; the Concord's embarrassed examiner counts in manifests and is mortified to find you
  honest. B concurs. The Reach arithmetic is a person and the Concord arithmetic is a bureaucracy;
  killing either erases a faction's voice.
- **Against A: SP1-003 stays.** A corporate debt-collection gate charging interest is a different
  verb from a child at a toll lane who just wants to know. B kept both too.
- **Against A: SP1-048 stays, HONEd.** A's cost objection ("a new economy simulation") is answered
  by the entry's own seam — a snapshot of the player's last N transactions, the same recorded
  receipts SP1-053 reads. Her solvency tracks your delta; no market model exists or is needed.
  "I'm not proud. I'm solvent" is too good to lose.
- **Against A: SP2-197 stays.** SP2-007 is the hull's own memory; SP2-197 is the graffiti corpus
  growing past its authors. Origin and continuation are not clones — continuation is the canon
  still happening.
- **SP3-156 stays dead, on my grounds, with A's corrected for the record.** Feasibility was never
  my objection — `resolveLookPost` exists, so the seam was real. The objection is emptiness: a
  desaturation patch with no mass, no signal, and no story is a post filter pretending to be a
  place. B concurs. SPX-C-03 (mine, below) carries the signal-containment thread the kill orphans.

**Hones adopted — folded in and said so.** B's reward caps (SP1-013, SP1-032, SP1-105, SP2-190's
modest payout — B's cap instinct was right even though B misread the entry as a dock refund; the
round-1 text is the 47-A release under "D. VALE, DORMANT," and my re-withhold hone stands with the
cap folded in), B's permanently-stalled countdown (SP2-050), B's flyable recall (SP2-102 — debts
are visited in this world, never snatched), B's lie-never-touches-money (SP1-137 — prices are the
one honest language out here), B's queue-time repairs (SP1-170), B's rename (SP1-111 — "Brood Mare"
was a register miss, full stop), B's SP2-086 absorption and liturgy grammar. A's build hones are
adopted wholesale wherever they preserve the beat rather than cut it — SP1-006, 011, 014, 025, 056,
089, 094, 100, 156, 184, 186, 188, 193, 197, 199; SP2-006, 018, 029, 058, 186, 187, 188, 200;
SP3-007, 009, 013, 016, 018, 031, 053, 077, 093, 137, 153, 154, 163 — and A's dirty-file list is
accepted as a build constraint throughout. SP3-053 deserves the note that A's cut is also a
*physics* correction: nothing settles or sheds dust in vacuum; my lens co-signs the deletion of
hull-settling on honesty grounds, not just budget.

**One cross-referenced repair neither of them could see alone.** B's kill of SP2-069 (the
gardener) was premised on SP2-096 carrying the Understory's bar culture. But I adopted A's merge of
SP2-096 into SP1-168 — which removes SP2-096 from the pool and leaves SP2-069 as the gardener's
only bar face. A faction with a verified file (`understory.js`) and garden stages cannot lose its
last resident because of a premise that my own vote invalidated. KEEP SP2-069.

**SP1-149 vs SP3-024, held 2-1.** B anchors Ring Rain on SP1-149; A and I both merge into SP3-024.
The Anvil has the verified seam (`weatherMeteors` slots, `PLANET_SITE.bands`) and the "sift"
harvest culture belongs where rings actually fall — consolidating ring lore on the Anvil also
repairs the Anvil-name drift that SP1-150's error exposed. My SP3-024 HONE carries the fold.

**On MY-500 ordering.** Ranks 1–102 are the head: the SP2 spine first (the appeal window, The
Question, HELD TOGETHER, the count, Bay 7, the plinth, the dark 25th, the Quiet's desks and doors),
then the machine people, then SP1's elegies and honest arithmetic, then the canon sky (weather as
archaeology, the Pale Holiday verbatim, mass made audible), then the strongest SPX. Remainders are
ordered world-first (SP2), then working life (SP1), then sky and season (SP3) — the continuity
voice: deepest canon, most world-true, most resonant first.

## Adopted SPX

All 22 of the other debaters' proposals are adopted into my ballot and my MY-500. They earned it:
none violate canon, several extend it, and B's first-hour trio fills the pool's one genuine
experiential hole — a fresh save meets almost nothing for two hours, which is exactly when a player
decides whether the world is alive.

- **SPX-A-01 KEEP** — replaces my killed SP1-050; buoys aimed at the next, a chalked X, "someone
  wanted to be followed." The navigation-archaeology romance survives A's kill of its host.
- **SPX-A-02 KEEP** — "IN TRANSIT, YEAR 3," tape stratified by forty years of re-sealing. Manifest
  archaeology is this world's geology.
- **SPX-A-03 KEEP** — "we noticed the absence. The lane did not. One of those is a compliment." The
  world's dry care, in one PA line.
- **SPX-A-04 KEEP** — "MINE. — K.," freshly re-painted each visit: claim culture as maintenance.
  The re-painting IS the claim.
- **SPX-A-05 KEEP** — "Two stars. The forms are load-bearing." The band as a workplace, in register.
- **SPX-A-06 KEEP** — "RETURN ANYTIME. IT LIKES THE TRIP." Animist salvage; Latch-Child adjacency.
- **SPX-A-07 KEEP** — your hull mass chalked with yesterday's date, a season of hulls marching up
  the abutment. Weigh-slip canon made visible.
- **SPX-A-08 KEEP** — two hulls sharing one hung lamp, the older half-towing the younger, for
  years. Quiet devotion as column motion.
- **SPX-A-09 KEEP** — one side of an old argument, pauses exactly long enough to answer into.
  Chained to SP2-029's flag — cross-proposal chaining is the mark of a world, not a list.
- **SPX-A-10 KEEP** — the tally buoy chalks every hull, yours underlined. Being counted, gently;
  the Quiet count made public and kind.
- **SPX-A-11 KEEP** — "NOT FOR RESALE. YES, FOR YOU, FRANK." Dock charm with one wilted row of
  honesty.
- **SPX-A-12 KEEP** — the underwriter wants the paint verified before the breakers eat it; the
  convoy's tally comes up one hull short, documented. Paperwork meets wreck economics, both honest.
- **SPX-B-01 KEEP** — the Arrival Stencil, first hour, with one scratched-out line corrected in
  different paint: the correction is a real hint. Fills the pool's biggest hole in register.
- **SPX-B-02 KEEP** — the Rookie Scratch: generations of scored marks, a dockhand who adds yours
  and says nothing. Being entered into the world's record without ceremony.
- **SPX-B-03 KEEP** — "ROOKIE RATE — FIRST TOLL ON THE HOUSE. THE LANE WANTS YOU BACK," and the
  collector embarrassed: "It's a promotion. Don't make it a thing." Reach arithmetic as welcome.
- **SPX-B-04 KEEP** — the Deck Chair: "RESERVED FOR WHOEVER NEEDS IT. WIPE IT DOWN." A rest stop
  the game never marks, heat bleeding double while parked, initials chalked where nobody looks —
  in a thin sector, which is where residents belong.
- **SPX-B-05 KEEP** — the Sprung Hold: a physics save or a physics chase, on the 1210 pre-latched
  pattern. The pool needed a pure physics toy that is also a story.
- **SPX-B-06 KEEP** — the Meteor Fishery: nets strung on the surge path like a salmon run, licensed
  lines on the public schedule, "NETS: 3. METEORS: EVERYTHING ELSE." Participatory weather economy,
  canon with the seasons.
- **SPX-B-07 KEEP** — the Three Liars' Cache: the lock accepts any answer, and the receipt inside
  settles the argument nobody ever checked. This is the house joke told perfectly.
- **SPX-B-08 KEEP** — the Shadow Ring: a pure-flying geometry ritual, the lamp lit for the day, and
  on the tenth hit "STILL GOT IT." The shadow predicate is honest math.
- **SPX-B-09 KEEP** — the Anchor Light: a silent competent tug, no transponder, a registry listing
  a crew of zero and a closed home port. The ledgers holding a ghost is this world's oldest trick,
  told once per save.
- **SPX-B-10 KEEP** — the Hand-Me-Down Route: thirty years of berth knowledge sold for exact
  change, one page torn out as tuition. Career as inheritance; the cheat berth becomes your best
  contact.

## FINAL-BALLOT

```text
SP1-001 | KEEP | Reach counts in hulls and tonnage; A’s merge to SP1-015 declined — two flags, two lawful audits.
SP1-002 | HONE | Carry SP2-129’s sole-juror recess as the court’s second, smaller case — one hull is a quorum when the matter is small.
SP1-003 | KEEP | Corporate debt with interest at a gate is a different verb from a child at a toll lane; both stay.
SP1-004 | HONE | Absorb SP1-143’s open-auction jettison-bid escrow; the mayday prize stays the headline and the bids stay pocket change.
SP1-005 | HONE | Cap the sheepdog to two interventions per sector day at a flat fee — a subscription that always works is a tax, not a character.
SP1-006 | HONE | The hot-lanes readout must be generated from the seeded encounter tables themselves — one source of truth, never a parallel hand-authored schedule.
SP1-007 | KEEP
SP1-008 | KEEP
SP1-009 | KEEP
SP1-010 | KEEP
SP1-011 | HONE | Cap the drill grid at 12-16 drones with a bounded window; forty live hulls in formation breaks the ambient spawn budget.
SP1-012 | KEEP
SP1-013 | HONE | Cap the stash at ~2,000 cr in cargo/intel value; the payoff is the forewarning flag, not the money.
SP1-014 | HONE | Read the flag in a new numbered encounter file; never open dirty missions.js.
SP1-015 | KEEP | The embarrassed examiner is the Concord’s whole personality; the lawful twin stands (B concurs).
SP1-016 | KEEP
SP1-017 | MERGE->SP1-103 | One lifetime beacon; the 12-line arc is the stronger read — fold the weigh-point tonnage gates in. (Conceded to B’s direction, A’s fold.)
SP1-018 | KEEP
SP1-019 | KEEP
SP1-020 | KEEP
SP1-021 | KEEP
SP1-022 | HONE | Express the amnesty window in world time — sector days or watches per worldCalendar.js; this world has no hours.
SP1-023 | KEEP
SP1-024 | KEEP
SP1-025 | HONE | Custody pod as a numbered encounter with a fragile prop; news beat via publishSituationNews, not the dirty missions file.
SP1-026 | KEEP
SP1-027 | KEEP
SP1-028 | HONE | Verify Vael’s canon remit in src/data/factions/vael.js before casting them as checkpoint wardens; if the law is Concord’s, recast and give Vael its true role elsewhere.
SP1-029 | KEEP
SP1-030 | HONE | Merge target of SP2-142/SP2-158: one fraud story, three acts — serial-plate payout, mid-act tow (the headline), measured-monument aftermath.
SP1-031 | KEEP
SP1-032 | HONE | Total four-site chain payout under ~1.5x a comparable delivery contract; the find is the payoff.
SP1-033 | KEEP
SP1-034 | MERGE->SP1-062 | Same refinery-shift ambience; SP1-062 keeps the spiral and absorbs the broadcast.
SP1-035 | KEEP
SP1-036 | KEEP
SP1-037 | KEEP
SP1-038 | KEEP
SP1-039 | KEEP
SP1-040 | KEEP
SP1-041 | KEEP
SP1-042 | KEEP
SP1-043 | KEEP
SP1-044 | KEEP
SP1-045 | KEEP
SP1-046 | KEEP | “Labels mean it’s mine. Right?” — delivery-law comedy
SP1-047 | KEEP
SP1-048 | HONE | Mirror strictly from recorded trade receipts (the SP1-053 store) — her solvency tracks your last-N delta; no new economy simulation.
SP1-049 | KEEP
SP1-050 | KILL | A’s seam audit stands — there is no hull-size traversal seam for the mass choke; salvage the older sign (“or unload honestly, we all did”) into the Charon lane’s build notes. SPX-A-01 carries the navigation-archaeology romance.
SP1-051 | KEEP
SP1-052 | KEEP
SP1-053 | KEEP
SP1-054 | KEEP
SP1-055 | KEEP
SP1-056 | HONE | No decal system exists — shipScreen hull-note + scan label; absorb SP2-104’s payer discount and dead-signature lore; the SKIP stencil decays at day end.
SP1-057 | KEEP
SP1-058 | KEEP
SP1-059 | HONE | Absorb SP3-146’s strike-pitch-by-location and drill-tuning lore; the interior cache stays one-time.
SP1-060 | KEEP | the cairn is the pool’s best elegy
SP1-061 | KEEP
SP1-062 | HONE | Absorb SP1-034’s tailings scoop-drones and the deadpan broadcast that names your hull.
SP1-063 | HONE | One-time cascade with the catchable boulder; absorb SP1-148’s NPC-misfire trigger and the fresh ore face at the scar line; no permanent zone reshuffle.
SP1-064 | KEEP
SP1-065 | KEEP
SP1-066 | KEEP
SP1-067 | KEEP
SP1-068 | HONE | Chain the comet road to SP3-005’s perihelion window; register the slipstream as a field row via environmentalMachinery, not dirty fields.js.
SP1-069 | KEEP
SP1-070 | KEEP
SP1-071 | KEEP
SP1-072 | KEEP
SP1-073 | KEEP | the ring that will not break to wave
SP1-074 | KEEP
SP1-075 | KEEP
SP1-076 | KEEP
SP1-077 | KEEP
SP1-078 | KEEP | “thaw in order of fare paid” is the whole law out here
SP1-079 | KEEP
SP1-080 | KEEP | the keeper is the pool’s kindest entry
SP1-081 | KEEP
SP1-082 | KEEP
SP1-083 | KEEP
SP1-084 | HONE | Merge target of SP2-141: fold the not-actually-wrecked scan-count reveal in as the Resident’s second act — the hermitage is itself becoming a wreck that trades.
SP1-085 | KEEP
SP1-086 | KEEP
SP1-087 | KEEP
SP1-088 | KEEP
SP1-089 | HONE | The engine casts no shadow-text — build it as a backlit welded stencil plate (cutout letters, rim glow from the nebula side); same read, real seam.
SP1-090 | KEEP
SP1-091 | KEEP
SP1-092 | KEEP
SP1-093 | HONE | Merge target of SP3-148: absorb the full audio-null and reversed-echo exit as the zone’s grammar; implement the folded Room site off the same audio-gate seam.
SP1-094 | HONE | Bounded ring buffer — persist the last 5 comms popup payloads for replay, not a full comms history store (none exists).
SP1-095 | KEEP
SP1-096 | KEEP
SP1-097 | HONE | Merge target of SP2-089: the chalk wall is the station-side face of the one public favor ledger; SP1-190’s garden stays its own physiology.
SP1-098 | KILL | Conceded to B, verified: 290-depth-h8-echo-of-player.js ships — the entry’s own seam line cites it. The world has one mirror trick and it is already in the game.
SP1-099 | KEEP | simTime-indexed character state, persisted — model persistence
SP1-100 | HONE | One dead-moon pair plus a registered slow field row; drop the three-body mutual orbit.
SP1-101 | KEEP | the convoy that is never late
SP1-102 | KEEP
SP1-103 | HONE | Merge target of SP1-017: carry the weigh-point tonnage thresholds and the retired stationmaster’s signature on the 100k line — twelve lines for a whole save.
SP1-104 | KEEP
SP1-105 | HONE | Bids capped at jettison pocket change; the prize is one news line’s reframing as a retraction-with-footnote — the original line stays legible somewhere, because this world keeps receipts.
SP1-106 | KEEP
SP1-107 | KEEP
SP1-108 | KEEP
SP1-109 | KEEP
SP1-110 | KEEP
SP1-111 | HONE | Rename off “Brood Mare” — “The Broodyard”; the rack-destruction fight is right, the register was not.
SP1-112 | KEEP
SP1-113 | KEEP
SP1-114 | KEEP
SP1-115 | HONE | Verify “Sable Iask” against NAMED_CAPTAINS; if absent, key the fleck to a real lancer ace (Toll Saint Venn); drop any accuracy nerf — story prop via presentation cue only.
SP1-116 | KEEP
SP1-117 | KEEP
SP1-118 | KEEP
SP1-119 | KEEP
SP1-120 | KEEP
SP1-121 | KEEP
SP1-122 | KEEP
SP1-123 | HONE | Run inside SP3-005’s perihelion window with gates drifting on the comet’s actual ephemeris; purse in the hundreds.
SP1-124 | KEEP
SP1-125 | KEEP
SP1-126 | KEEP
SP1-127 | KEEP
SP1-128 | KEEP
SP1-129 | KEEP
SP1-130 | KEEP
SP1-131 | KEEP
SP1-132 | KEEP
SP1-133 | KEEP
SP1-134 | KEEP | “Delete that.” — the Quiet’s calm is canon
SP1-135 | KEEP
SP1-136 | KEEP
SP1-137 | HONE | The one daily lie never touches prices or mission data a player can bet on — it lies about color, never about money.
SP1-138 | KEEP
SP1-139 | KEEP
SP1-140 | KEEP
SP1-141 | KEEP
SP1-142 | KEEP
SP1-143 | MERGE->SP1-004 | Same auction core; SP1-004 keeps the mayday stakes and absorbs the jettison bids.
SP1-144 | KEEP | the Choir citing your real receipts — gorgeous
SP1-145 | KEEP
SP1-146 | KEEP
SP1-147 | KEEP
SP1-148 | MERGE->SP1-063 | Same collapse core; SP1-063 keeps the catch.
SP1-149 | MERGE->SP3-024 | One ring-shedding season; the Anvil has the verified seam and the sift culture belongs where rings actually fall. (A concurs; B’s anchor loses 2-1.)
SP1-150 | HONE | The Anvil is Tethys’s planet — recast as Ashfall’s own refinery skim runs; register the lane as an environmentalMachinery field row.
SP1-151 | KEEP
SP1-152 | KEEP
SP1-153 | KEEP
SP1-154 | KEEP
SP1-155 | HONE | Rename “The Broadside” — SP3-126 owns The Long Fall for the Anvil reentry; keep the moon-bombardment core.
SP1-156 | HONE | Your wake persists as ONE ephemeral polyline per visit plus authored daily-writer props; no persistent player-authored wake store.
SP1-157 | KEEP
SP1-158 | MERGE->SP3-002 | One scheduled eclipse — the running-light etiquette becomes the traffic leg of the chain.
SP1-159 | HONE | Merge target of SP1-169: carry the freight liturgy (“in slack and in strain”) and the merged-line toll consequence.
SP1-160 | KEEP
SP1-161 | KEEP | “one more time than the news reported”
SP1-162 | MERGE->SP3-002 | Same occultation; the thermal-tell shadow cache rides the chain.
SP1-163 | KEEP
SP1-164 | KEEP
SP1-165 | KEEP | Absolution is a different sacrament from filing (SP2-091) — the Choir would insist; both stay.
SP1-166 | KEEP
SP1-167 | KEEP
SP1-168 | HONE | Micromend as a slow capped regen on an existing armor path (damage.js only if clean); merge target of SP2-096 — the Rhea florist is the storefront, the Charon garden the nursery, and “everything dead wants to be soil” moves into the care copy.
SP1-169 | MERGE->SP1-159 | One wedding in the fog; the flyable ceremony keeps the freight liturgy and the toll consequence.
SP1-170 | HONE | Verify Helix’s clinic remit before the ring; free repairs cost visible queue TIME with triage order on display — the ring-violation flag stays the one permanent consequence.
SP1-171 | KEEP
SP1-172 | KEEP
SP1-173 | KEEP
SP1-174 | KEEP
SP1-175 | MERGE->SP2-086 | One lost-property institution — the board is the public face, the office the back room. (Conceded to B.)
SP1-176 | KEEP
SP1-177 | KEEP
SP1-178 | KEEP
SP1-179 | KEEP
SP1-180 | KEEP
SP1-181 | KEEP
SP1-182 | KEEP
SP1-183 | KEEP | One hull’s name on Senna’s roll, not a calendar rite — B’s merge declined; absorbs the bow-lamp visual only.
SP1-184 | HONE | Key to most-docked station — no persistent berth-number identity exists; the alarming precision about your habits survives the re-key.
SP1-185 | KEEP
SP1-186 | HONE | Purchasable plaque + one dock greeting + fee; drop the dock-layout-change claim (dock layout is static UI).
SP1-187 | KEEP
SP1-188 | HONE | Key the copycat to most-used weapon class / escort count from existing deed records; no maneuver-stat ledger exists.
SP1-189 | KEEP | “It had a name too.”
SP1-190 | KEEP | A ledger is kept; a garden just grows — the belt trusts the garden more. B’s merge declined.
SP1-191 | KEEP
SP1-192 | KEEP
SP1-193 | HONE | Authored texture props per the fallback; no illustratedSurface edit while it is dirty.
SP1-194 | KEEP
SP1-195 | KEEP | the kid at the toll lane — debt made human
SP1-196 | KEEP
SP1-197 | HONE | ONE authored lane (the starter lane) with flag-gated tallies; there is no route-usage ledger and building one for chalk is not worth it.
SP1-198 | KEEP
SP1-199 | HONE | Key to the save’s first-hull record if present, else a two-hour fit snapshot; no new loadout-history ledger.
SP1-200 | KEEP | “ACCOUNTS CURRENT” — the Quiet’s one unbidden hail
SP2-001 | KEEP | Maera Vols is canon FIGURES
SP2-002 | KEEP
SP2-003 | KEEP | the seventh run the graffiti doesn’t talk about
SP2-004 | KEEP | HELD TOGETHER is the hull’s real story
SP2-005 | KEEP | Kael’s six months are canon
SP2-006 | HONE | The replacement inherits the Quiet’s evidence desk — Clerk Yune’s own, not a Concord one; delivered as a comms variant (barContacts is dirty — request, do not edit).
SP2-007 | KEEP | GANG_SHE_HELD verbatim — handwriting with no author field
SP2-008 | HONE | The new clerk inherits the Quiet’s evidence desk — Clerk Yune is the Quiet’s sealed-evidence broker (Wraith Kell is the customs embed), so the replacement inherits Yune’s own desk, not a Concord one.
SP2-009 | KEEP | the dark 25th plinth is real poi_memorial canon
SP2-010 | KEEP | MOISTURE_LOSS_NINE verbatim
SP2-011 | KEEP | Bay 7 / ticket Y3-C2 / R3-CARRIER is the real wrong-grid chain
SP2-012 | KEEP | silence as the correct answer to The Question — the pool’s peak
SP2-013 | KILL | Conceded to B with A’s evidence: it “mirrors the Vesta numbers-station loop” by its own text, and NUMBERS_SHADOW_STATION already ships (src/data/numbersShadow.js:8).
SP2-014 | KILL | A third numbers station; SP3-168 — a forecast sent to no one — is the one keeper of this family.
SP2-015 | KEEP
SP2-016 | HONE | Rename off “Drift Choir” — the Ascendant Choir is one faction, home Vesta Forge; call it the hanging line and keep every beat.
SP2-017 | KEEP
SP2-018 | HONE | Hail-response variants in a NEW data file consumed by the contactHail seam; contactHail.js is dirty this sitting.
SP2-019 | KEEP
SP2-020 | KEEP
SP2-021 | KEEP | below my 500 line — the quarter-line is real but thin.
SP2-022 | KEEP
SP2-023 | KEEP
SP2-024 | KEEP
SP2-025 | KEEP
SP2-026 | KEEP
SP2-027 | KEEP | Rook the double-biller is canon FIGURES
SP2-028 | KEEP
SP2-029 | HONE | Same new hail-response data file as SP2-018 (hail-count branch).
SP2-030 | KEEP
SP2-031 | KEEP | “ORIGIN LAPSED” is Latch-Child’s canon phrase
SP2-032 | KEEP
SP2-033 | KEEP
SP2-034 | KEEP
SP2-035 | KEEP | the W signature is Wren; post-ending gate is honest
SP2-036 | KEEP
SP2-037 | KEEP | WE REGRET THE ACCURACY — Vonn in one line
SP2-038 | KEEP
SP2-039 | KEEP
SP2-040 | KEEP
SP2-041 | KEEP
SP2-042 | KEEP
SP2-043 | KEEP | Gratitude FROM the rescued vs fandom FROM strangers — different directions, both true; B’s merge declined.
SP2-044 | KEEP
SP2-045 | KEEP
SP2-046 | KEEP
SP2-047 | KEEP
SP2-048 | KEEP
SP2-049 | KEEP
SP2-050 | HONE | The 12-cycle countdown is authored permanently stalled — the appeal number is the whole payoff, never a resolution; the Pit does not learn it has a window.
SP2-051 | KEEP
SP2-052 | KEEP
SP2-053 | KEEP
SP2-054 | KEEP
SP2-055 | KILL | Conceded to B: the payoff is a heat modifier in a lore coat; the Quiet’s network lore already lives in SP2-003 and SP2-058.
SP2-056 | KEEP
SP2-057 | KEEP
SP2-058 | HONE | Same new hail-response data file (contact-roaming autoreply).
SP2-059 | KILL | Conceded to B: a mail-row gag cannot carry an entry; MTS’s voice survives in SP2-044.
SP2-060 | KEEP
SP2-061 | KEEP
SP2-062 | KEEP
SP2-063 | KEEP
SP2-064 | KEEP
SP2-065 | KEEP
SP2-066 | KEEP
SP2-067 | KEEP
SP2-068 | KEEP
SP2-069 | KEEP
SP2-070 | KEEP
SP2-071 | KEEP
SP2-072 | KEEP | Senna is canon keeper of names
SP2-073 | KEEP
SP2-074 | KEEP
SP2-075 | KEEP
SP2-076 | KEEP
SP2-077 | KEEP
SP2-078 | KEEP | A bar where the dead regular’s tab is paid AND his stool is warm is one establishment with two hauntings; registers differ (debt vs presence).
SP2-079 | KEEP
SP2-080 | KEEP
SP2-081 | KEEP
SP2-082 | KEEP | “You are being drunk to. Do not wave.”
SP2-083 | KEEP
SP2-084 | KEEP
SP2-085 | KEEP
SP2-086 | HONE | Merge target of SP1-175: the board is the public face, the describe-the-label claim game is the back-room leg, inventory drawn from encounter history; readable in one screen.
SP2-087 | KEEP | The per-type handoff liturgy stays its own voice; B’s merge into SP3-144 misread it — SP3-144 is the four-note clock, not the liturgy.
SP2-088 | KEEP
SP2-089 | MERGE->SP1-097 | Two readings of one public favor ledger — the buoy keeps the record, the chalk keeps the bar.
SP2-090 | KEEP
SP2-091 | HONE | One Choir liturgy, two sacraments — the booth files in the same receipt grammar the buoy absolves in; deliver the read-back as a late mail letter (ending files dirty).
SP2-092 | KEEP
SP2-093 | KEEP
SP2-094 | KEEP
SP2-095 | KEEP
SP2-096 | MERGE->SP1-168 | One living-hull horticulture; the florist becomes the graft’s storefront. (Conceded to A; the two-face directive preserves the Rhea stall.)
SP2-097 | KEEP | one credit and a formal apology — the roaming story’s own payoff
SP2-098 | KEEP
SP2-099 | KEEP | FREQUENCY 13 is the real Reach weigh-slip sender
SP2-100 | KEEP | B’s invisibility kill is answered by the entry’s own line — “The Pattern noticed. It does not always. Today it did.” The world explains itself once, in-world.
SP2-101 | KEEP
SP2-102 | HONE | The recall must be survivable by flying — outrun or outmaneuver the collector; debts are visited, never snatched.
SP2-103 | KEEP
SP2-104 | MERGE->SP1-056 | One visible payment mark on your hull; the honest sigil’s discount folds into the stencil.
SP2-105 | KEEP
SP2-106 | KEEP
SP2-107 | KEEP
SP2-108 | KEEP
SP2-109 | KEEP
SP2-110 | KEEP
SP2-111 | KEEP
SP2-112 | KEEP
SP2-113 | KEEP
SP2-114 | KEEP
SP2-115 | KEEP
SP2-116 | KEEP
SP2-117 | KEEP
SP2-118 | HONE | Verify Bracket BX-9 in the machine-people registry (morrow/vesper/quill/ruud are the named four); verify-or-bless as deliberate new canon, never drift.
SP2-119 | KEEP
SP2-120 | HONE | Same verification for Rubric HM-11 — three entries ride on this machine; confirm the id or bless Rubric explicitly, used consistently.
SP2-121 | KEEP
SP2-122 | KEEP
SP2-123 | KEEP
SP2-124 | KEEP
SP2-125 | KEEP
SP2-126 | KEEP
SP2-127 | HONE | Verify the Pallet Jack cast id; if it is a pattern and not a character, name the thief from the existing unregistered-hull vocabulary.
SP2-128 | HONE | Verify Scissorwake in the oneOffCast roamers; wire the old-hulls mercy flag to whichever roamer is real — the rule is too good to lose.
SP2-129 | MERGE->SP1-002 | The wreck court’s recess is the court’s second case, not a second court. (Conceded to B; the serialization lives inside SP1-002.)
SP2-130 | HONE | Hold to SP2-120’s Rubric verification; the accession-number joke survives either way.
SP2-131 | KEEP
SP2-132 | KEEP
SP2-133 | KEEP
SP2-134 | KEEP
SP2-135 | KEEP
SP2-136 | KEEP
SP2-137 | KEEP | HE WANTED THE BELT.
SP2-138 | KEEP
SP2-139 | KEEP
SP2-140 | KEEP
SP2-141 | MERGE->SP1-084 | One wreck hermit; the Resident is the stronger character and the scan-count reveal is the second act. (Conceded to B.)
SP2-142 | MERGE->SP1-030 | Act two of the fraud arc.
SP2-143 | KEEP
SP2-144 | KEEP
SP2-145 | KEEP | B undersold it — the dockmaster’s defense (“That is how she spells it... We chart the world as it is.”) is a character beat, not a typo gag.
SP2-146 | KEEP
SP2-147 | KEEP
SP2-148 | KEEP
SP2-149 | KEEP
SP2-150 | KEEP
SP2-151 | KEEP
SP2-152 | KEEP
SP2-153 | KEEP
SP2-154 | KEEP
SP2-155 | KEEP
SP2-156 | KEEP
SP2-157 | HONE | Drop the “Drift Choir” name per SP2-016 — the line’s last pod at Eris needs no second choir.
SP2-158 | MERGE->SP1-030 | Act three — the measured-monument aftermath closes the arc.
SP2-159 | KEEP
SP2-160 | KEEP
SP2-161 | KEEP
SP2-162 | KEEP
SP2-163 | KEEP
SP2-164 | KEEP
SP2-165 | KEEP
SP2-166 | KEEP | DO NOT WAKE UNTIL THE BELT IS SAFE
SP2-167 | HONE | Give the fitter hands — fourth scan reveals tool marks and a work log; someone is fitting it. “NEARLY. KEEP GROWING.” stays.
SP2-168 | KEEP
SP2-169 | KEEP
SP2-170 | KEEP
SP2-171 | KEEP
SP2-172 | KEEP
SP2-173 | KEEP
SP2-174 | KEEP
SP2-175 | HONE | There is no airtime resource — the payoff is the edited-hail audio variant plus a band-priority greeting; other pilots notice.
SP2-176 | KEEP
SP2-177 | KEEP
SP2-178 | KEEP
SP2-179 | KEEP
SP2-180 | KEEP
SP2-181 | KEEP | Mara and the Children are canon; witness-not-escort is their voice
SP2-182 | KEEP
SP2-183 | KEEP | IT TURNED. WE SAW.
SP2-184 | KEEP
SP2-185 | KEEP
SP2-186 | HONE | Key to courier contracts completed in that sector (deed counter); no lane-history ledger.
SP2-187 | HONE | The witnessed story = one assist/scan/dock event inside the window; open-ended maneuver watching is not judgeable.
SP2-188 | HONE | Deliver via comms popup + flag; resultsSheet.js and demoEnd.js are dirty; the next-session quiet-mode flag keys a parallel ambient table.
SP2-189 | KEEP
SP2-190 | HONE | The release re-withholds in the same popup: “PAYMENT RELEASED. RE-FILED. BALANCE: WITHHELD. THE DESK APOLOGIZES FOR THE HOPE.” — the codex tense-swap is the prize and the payout stays modest; 47-A never closes.
SP2-191 | KEEP | ENDING_STATION_ACK E verbatim; the blank page is the test
SP2-192 | KEEP | story_b8_helix_audit is real; “The file was a photograph”
SP2-193 | KEEP | all five endings map to real ENDING_STATION_ACK tokens
SP2-194 | KEEP | THE DIFFERENCE IS THE ONE THAT STAYS
SP2-195 | KEEP
SP2-196 | KEEP
SP2-197 | KEEP | The graffiti corpus continuing past its authors — A’s merge declined: 007 is the hull’s own memory, 197 is the corpus growing.
SP2-198 | KEEP
SP2-199 | KEEP | THE ADMINISTRATIVE DEFINITION OF HOPE
SP2-200 | HONE | Comms sequence in first-contact order + one persisted flag + next-session mail row; no results-sheet edit.
SP3-001 | HONE | Absorb SP3-164’s debris-arc glint walk as a second venue; the wire posts both minutes.
SP3-002 | HONE | Merge target of the eclipse family: carry the station window-wave + PA call (SP3-015), thermal-tell shadow cache (SP1-162), running-light etiquette (SP1-158), shadow-band ripple (SP3-172); SP3-019 announces it. One moon, one eclipse, many ways to stand under it.
SP3-003 | HONE | Absorb SP3-008’s day-5 clockwork regularity and the apron’s double-shadow read.
SP3-004 | KEEP
SP3-005 | HONE | The comet anchor: road (SP1-068), race (SP1-123) and stone-fall read as one event on the perihelion window — one canon comet, three human responses.
SP3-006 | KEEP | Merge target of SP3-020.
SP3-007 | HONE | Sector-wide gain envelope keyed to the transit minute; the spatially-walking terminator is renderer work and the “no new renderer code” claim is false in that form.
SP3-008 | MERGE->SP3-003 | Same second-sun core; SP3-003 keeps the anomaly framing.
SP3-009 | HONE | Zone-occupancy rig boost is per-frame glue through tuneLook — relabel data+glue; keep the arc window as the trigger.
SP3-010 | HONE | Absorb SP3-040’s ice-halo fuse as the second plane-crossing venue.
SP3-011 | MERGE->SP3-171 | Same uncharted-beacon core; SP3-171 keeps the chart payoff.
SP3-012 | HONE | Absorb SP3-161’s mirrored-escort leg — the doctrine made public (the train hails you as sixth barge) and private (the escort) in one entry.
SP3-013 | HONE | Relabel data+glue (weather-volume gas row + one call-site read in the dirty vfx file).
SP3-014 | KEEP
SP3-015 | MERGE->SP3-002 | The station view is a leg of the umbra chain.
SP3-016 | HONE | Capture via scan pulse fired inside the alignment window; no photo-mode dependency.
SP3-017 | KEEP
SP3-018 | HONE | Long twilight as a mood-overlay data file merged through beginLookMood/tuneLook; note: resolveLookPost exists (lookMoods.js:339) — the cited seam was never a lie.
SP3-019 | HONE | Absorb SP3-037’s aurora line as the sibling bulletin — one bulletin grammar for all timed sky.
SP3-020 | MERGE->SP3-006 | Same plate-wink source; the Quiet Night double-pulse is the second observation. (A and B agree.)
SP3-021 | KEEP
SP3-022 | KEEP
SP3-023 | KEEP
SP3-024 | HONE | Merge target of SP1-149: one ring-shedding season; fold “the sift” harvest culture and the capped free-ice rule into the Anvil event, where rings actually fall and the seam is verified.
SP3-025 | KEEP | mass made audible — the most lawlike sound in the sector
SP3-026 | KEEP
SP3-027 | KEEP
SP3-028 | KEEP | Moonrise is not an eclipse entry — it is the moon existing; the sky needs its moon. B’s kill declined.
SP3-029 | KEEP
SP3-030 | KEEP
SP3-031 | HONE | One-watch rig overlay via the mood path — and for the record: resolveLookPost exists (lookMoods.js:339); the Pale Holiday’s “signals run strange” already sanctions the effect.
SP3-032 | MERGE->SP3-155 | Same invisible-mass core; SP3-155 keeps the flyable line.
SP3-033 | HONE | Absorb SP3-150’s permanent consequence: cut the strings and the chord loses its voice for good.
SP3-034 | KEEP
SP3-035 | KEEP
SP3-036 | KEEP
SP3-037 | MERGE->SP3-019 | Same bulletin pattern; one grammar for all timed sky.
SP3-038 | KEEP
SP3-039 | MERGE->SP3-170 | Same breathing-background core; SP3-170 keeps the sector-as-organism.
SP3-040 | MERGE->SP3-010 | Same plane-crossing flash; folds in as the halo fuse.
SP3-041 | KEEP
SP3-042 | KEEP
SP3-043 | KEEP
SP3-044 | KEEP | The fireball stays its own entry; SP3-196 is the season’s bracket, not a duplicate.
SP3-045 | KEEP
SP3-046 | KILL | Conceded — my own round-2 note said it: third and weakest. The Silence is a place with etiquette (SP1-093), not a weather front; “you went deaf” is SP1-093’s sensation rented twice.
SP3-047 | KEEP
SP3-048 | HONE | Absorb SP3-194’s per-kind jingles — one chime grammar, three weathers.
SP3-049 | KEEP
SP3-050 | KEEP
SP3-051 | KEEP
SP3-052 | KEEP
SP3-053 | HONE | Gas-volume falling motes only — nothing settles or sheds dust in vacuum; cut the hull-settling, keep the season.
SP3-054 | KEEP
SP3-055 | HONE | No bolt freezes mid-fork — the statue is the persistent ionized trace seen from distance; the hold-phase implementation is the honest version, keep the traces.
SP3-056 | KEEP
SP3-057 | KEEP
SP3-058 | KEEP
SP3-059 | KEEP
SP3-060 | KEEP
SP3-061 | HONE | The visible refraction edge IS the safe line — functional, taught once by the wire.
SP3-062 | KEEP
SP3-063 | MERGE->SP3-065 | Same paired-boulders core; SP3-065 keeps the clockwork. (Conceded to B.)
SP3-064 | MERGE->SP3-076 | Same collapse; SP3-076 keeps the seasonal memory.
SP3-065 | HONE | Merge target of SP3-063: the paired boulders keep the clock; articulation sleeps beyond 600 WU, sparks on player-near ticks only.
SP3-066 | KEEP
SP3-067 | KEEP
SP3-068 | KEEP
SP3-069 | KEEP
SP3-070 | KEEP
SP3-071 | KEEP | The jewelry-box moment is real and physics-honest — kept alive, below my 500 line.
SP3-072 | KEEP
SP3-073 | KEEP
SP3-074 | KEEP
SP3-075 | KEEP
SP3-076 | HONE | Absorb SP3-064’s shoot-the-pile trigger; terrain memory persists one season then heals.
SP3-077 | HONE | Cap the tailings field at 12 visible layers with oldest fade; unbounded growth fails perf law.
SP3-078 | KEEP
SP3-079 | KEEP
SP3-080 | KEEP
SP3-081 | KEEP | the obituary of a collision nobody caused
SP3-082 | KEEP | The event and the world’s paperwork are different verbs (SP2-051/SP2-192 precedent) — the chronicle’s photograph is canon presence.
SP3-083 | HONE | Absorb SP3-096’s annealing afterglow as the pour’s closing phase — pour, spread, anneal: one event with an arc.
SP3-084 | KEEP
SP3-085 | HONE | Absorb SP3-190’s five-stack whistle phrase and books-closed lamp step.
SP3-086 | KEEP
SP3-087 | KEEP
SP3-088 | KEEP
SP3-089 | KEEP
SP3-090 | KEEP
SP3-091 | KEEP
SP3-092 | HONE | Rename “The Drill Chord” — the Ascendant Choir keeps its word; the rising fifth stays.
SP3-093 | HONE | Announcement + apron flood dim only; the job director does not re-route traffic on a popup.
SP3-094 | KEEP
SP3-095 | HONE | Rename “The Nine-Second Hammer” — the Anvil is Tethys’s named planet; thirty-one years at nine seconds is the landmark this is.
SP3-096 | MERGE->SP3-083 | The pour’s third act; one event with an arc. (Conceded to B.)
SP3-097 | KEEP
SP3-098 | KEEP
SP3-099 | KILL | Conceded to B: the clockwork yard (SP3-090) owns mechanical patience; a sweep, a pulse and a dust line is not enough.
SP3-100 | KEEP
SP3-101 | KEEP | The hum arranged is the station singing to itself at rest; the hauling chorus is work — rest and labor are different songs. B’s merge declined.
SP3-102 | KEEP
SP3-103 | KEEP | The Drift Wake procession is a calendar rite (Senna’s roll is calendar canon); SP1-183 is one hull’s passing. Both stay.
SP3-104 | KEEP
SP3-105 | KEEP
SP3-106 | HONE | Absorb SP3-188’s midnight minute (90% audio duck) as the Quiet Night center beat.
SP3-107 | KEEP
SP3-108 | HONE | Rename “The Approach” — docking chatter needs no borrowed liturgy.
SP3-109 | HONE | Bay 7 is canon ground (R3-CARRIER, ticket Y3-C2) — make bay 7’s emptiness the joke the regulars explain, or move the weekly cargo to a numbered bay.
SP3-110 | KEEP
SP3-111 | KEEP
SP3-112 | HONE | Merge target of SP3-180: carry the witness pause — only names the player personally saw die get the two seconds.
SP3-113 | HONE | Absorb SP3-147’s apron doppler mix so the race exists for ears, not just eyes.
SP3-114 | KEEP
SP3-115 | KEEP
SP3-116 | KEEP
SP3-117 | HONE | Nothing glides in vacuum — ballistics: a folded plate thrown on a computed arc, burning in the apron’s heat wash; the thrower is the mystery.
SP3-118 | MERGE->SP3-182 | Same chime-plus-price-fold core — the market gets one gong. (Conceded to B on the round-1 texts.)
SP3-119 | KEEP
SP3-120 | KEEP
SP3-121 | KEEP
SP3-122 | KEEP
SP3-123 | KEEP
SP3-124 | KEEP
SP3-125 | KEEP
SP3-126 | KEEP | A deliberately deorbited moon has owners, filings and decades of paperwork; an anchor has none. Scale and agency differ — B’s merge declined.
SP3-127 | KEEP
SP3-128 | KEEP
SP3-129 | HONE | Rename the lost hull from an ordinary name pool — the protagonist is Wren; the chronicler’s line needs no coincidence.
SP3-130 | KEEP
SP3-131 | KEEP
SP3-132 | KEEP
SP3-133 | KEEP
SP3-134 | KEEP
SP3-135 | KEEP
SP3-136 | KEEP
SP3-137 | HONE | Audio pulse + proximity gate only; skip the HUD band-edge breathing.
SP3-138 | KEEP
SP3-139 | KEEP
SP3-140 | KEEP
SP3-141 | KEEP
SP3-142 | KEEP
SP3-143 | HONE | Rename “The Hauling Chorus” — a convoy’s work song; the Ascendant Choir keeps its word.
SP3-144 | HONE | The shift-turn stack must layer, not collide: the whistle leads (SP3-183), the per-type handoff liturgy follows (SP2-087), the four-note time signal rides underneath as the clock — one audible fabric per station.
SP3-145 | KEEP | the canon Pale Holiday jukebox line, promoted to an event
SP3-146 | MERGE->SP1-059 | Same ringing-rock core; SP1-059 keeps the cache.
SP3-147 | MERGE->SP3-113 | The race’s audio leg; one event, ears and eyes.
SP3-148 | MERGE->SP1-093 | Same silence core; the Room becomes a satellite site off one audio-gate seam. (A and B agree.)
SP3-149 | KEEP
SP3-150 | MERGE->SP3-033 | Same singing-lines physics; the fiddle keeps the venue and the permanence.
SP3-151 | HONE | Merge target of SP3-179: carry the year-in-numbers wire line under the 40-day chord.
SP3-152 | KEEP
SP3-153 | HONE | Two authored background accents cross-fading by proximity; drop the data-only focus-pull claim.
SP3-154 | HONE | Static seasonal void corridor keyed to the third-season gate; a moving crossing is bespoke background animation.
SP3-155 | HONE | Merge target of SP3-032: absorb the survey-buoy lamp ripple and the Archive survey framing.
SP3-156 | KILL | Unchanged, and now double-checked: resolveLookPost exists (lookMoods.js:339), so A’s seam correction was wrong — but feasibility was never my objection. A desaturation patch with no mass, no signal, no story is a post filter, not a place; SPX-C-03 carries the signal-containment thread with teeth.
SP3-157 | KEEP
SP3-158 | KEEP
SP3-159 | KEEP
SP3-160 | KEEP
SP3-161 | MERGE->SP3-012 | Same mirroring doctrine made public; the escort is the private leg.
SP3-162 | HONE | Merge target of SP3-165: absorb the three-plate lens-drift proof as the payoff plate; capture via scan pulse.
SP3-163 | HONE | Register the patch as its own tiny weather volume plus a forecast line that reads clear; “a footprint with no volume” is not a supported shape.
SP3-164 | MERGE->SP3-001 | Same specular walk; SP3-001 keeps the teaching ground.
SP3-165 | MERGE->SP3-162 | Same Archive verification mission; the three-plate proof is the payoff.
SP3-166 | KILL | Conceded to B: “Nobody has gone to look twice” is the entry’s own sentence — that is the case against it.
SP3-167 | KEEP
SP3-168 | KEEP
SP3-169 | KEEP
SP3-170 | HONE | Merge target of SP3-039: absorb the “radar reads nothing” instrument beat.
SP3-171 | HONE | Merge target of SP3-011: absorb the beacon-rhythm informal compass used among survey pilots.
SP3-172 | MERGE->SP3-002 | The partial-phase preamble of the same eclipse.
SP3-173 | KEEP
SP3-174 | KEEP
SP3-175 | KEEP
SP3-176 | KEEP
SP3-177 | KEEP
SP3-178 | KEEP
SP3-179 | MERGE->SP3-151 | Same year-boundary cadence; the chord keeps the wire line.
SP3-180 | MERGE->SP3-112 | By the entries’ own text SP3-180 is “the SP3-112 sequence with a witness check” — the sequence is the anchor; the pause rides in it.
SP3-181 | KEEP
SP3-182 | HONE | Merge target of SP3-118: open bright, close low, and a third stroke when prices tilt — the market telling you something.
SP3-183 | KEEP | The whistle is a physical siren, not a liturgy or a clock; three instruments, one shift turn — layered by the SP3-144 hone.
SP3-184 | KEEP
SP3-185 | KEEP
SP3-186 | KEEP
SP3-187 | KEEP
SP3-188 | MERGE->SP3-106 | Same Quiet Night; the midnight minute is the center beat.
SP3-189 | KEEP | “nobody scheduled and everyone keeps” — festival text verbatim
SP3-190 | MERGE->SP3-085 | Same festival chorus; folds into the wave.
SP3-191 | KEEP
SP3-192 | KEEP
SP3-193 | KEEP
SP3-194 | MERGE->SP3-048 | Same forecast-audio grammar; folds into the season bell.
SP3-195 | KEEP
SP3-196 | KEEP | Seasons have firsts and lasts; the last meteor is the weather year’s Tally Eve.
SP3-197 | KEEP
SP3-198 | KEEP
SP3-199 | HONE | Attribute the painted 500s in-world — a survey mark, the Tally, one person’s decade project; “the campaign left it tuned” is a meta voice and one attribution turns the joke into a story.
SP3-200 | KEEP
SPX-A-01 | KEEP | Adopted — replaces my killed SP1-050; the pointing chain keeps the navigation-archaeology romance.
SPX-A-02 | KEEP | Adopted — manifest archaeology; layered tape is this world’s geology.
SPX-A-03 | KEEP | Adopted — “we noticed the absence” is the world’s dry care.
SPX-A-04 | KEEP | Adopted — claim culture as maintenance; the re-painting is the claim.
SPX-A-05 | KEEP | Adopted — “the forms are load-bearing” is the house register.
SPX-A-06 | KEEP | Adopted — animist salvage; Latch-Child adjacency.
SPX-A-07 | KEEP | Adopted — the scale’s memory; weigh-slip canon extended.
SPX-A-08 | KEEP | Adopted — years of quiet devotion in one shared lamp.
SPX-A-09 | KEEP | Adopted — the pauses are exactly long enough to answer into; chained to SP2-029’s flag.
SPX-A-10 | KEEP | Adopted — being counted, gently; the count made public and kind.
SPX-A-11 | KEEP | Adopted — dock charm with one wilted row of honesty.
SPX-A-12 | KEEP | Adopted — the underwriter wants the paint verified; the convoy’s tally comes up one hull short, documented.
SPX-B-01 | KEEP | Adopted — first-hour texture with one corrected line as a real hint; the pool’s biggest hole, filled in register.
SPX-B-02 | KEEP | Adopted — generations of scored marks and a dockhand who says nothing.
SPX-B-03 | KEEP | Adopted — “It’s a promotion. Don’t make it a thing.” is Reach arithmetic as welcome.
SPX-B-04 | KEEP | Adopted — RESERVED FOR WHOEVER NEEDS IT; a rest stop the game never marks, in a thin sector.
SPX-B-05 | KEEP | Adopted — a loaded hold as a physics save or physics chase; 1210 pattern.
SPX-B-06 | KEEP | Adopted — nets on the surge path; licensed lines on the public schedule.
SPX-B-07 | KEEP | Adopted — the lock accepts any answer and the receipt inside settles the argument nobody checked.
SPX-B-08 | KEEP | Adopted — pure geometry ritual; the shadow predicate is honest math.
SPX-B-09 | KEEP | Adopted — a registry listing a crew of zero and a closed home port; the ledgers holding a ghost is the house style.
SPX-B-10 | KEEP | Adopted — thirty years of route knowledge sold for exact change; the torn page is the tuition.
SPX-C-01 | KEEP | amb_berth_avoid turned around onto the player as neighbor; never explained, never repeated.
SPX-C-02 | KEEP | Gives the 7713/7714 trap line its missing payoff — two hulls, one digit, one drink.
SPX-C-03 | KEEP | Replaces SP3-156: the late_xenolinguistics / Division 6 signal-containment thread is canon waiting; “ALL BANDS NOMINAL. THERE IS NO EXTRA BAND.”
SPX-C-04 | KEEP | Filecleaver Dorin is otherwise unused; the ledger is honest about what it does.
SPX-C-05 | KEEP | Thirty roaming stories; round 1 used one. The birds remember the OLD loft.
SPX-C-06 | KEEP | Hollow Station is named canon with no site presence; the paper is real, the race is real, the rock is one rock.
SPX-C-07 | KEEP | amb_sec6_air’s Quiet air booth gets its downstream; “PROVENANCE: HONORED.”
SPX-C-08 | KEEP | pers_voss_suspended’s cruelest sentence becomes a task — the system ate both; one hull carried the paper.
```

## MY-500

SP2-050, SP2-012, SP2-004, SP2-160, SP2-011, SP2-010, SP2-009, SP2-006, SP2-007, SP2-003, SP2-001, SP2-005, SP2-194, SP2-190, SP2-027, SP2-031, SP2-029, SP2-035, SP2-137, SP2-166, SP2-197, SP2-199, SP2-200, SP2-191, SP2-192, SP2-193, SP2-181, SP2-116, SP2-117, SP2-121, SP2-123, SP2-127, SP2-128, SP2-130, SP2-118, SP2-120, SP2-122, SP2-062, SP2-078, SP2-072, SP2-065, SP2-082, SP2-046, SP2-099, SP2-100, SP1-080, SP1-183, SP1-060, SP1-078, SP1-099, SP1-161, SP1-189, SP1-103, SP1-144, SP1-015, SP1-195, SP1-002, SP1-046, SP1-134, SP1-063, SP1-200, SP1-001, SP3-163, SP3-189, SP3-002, SP3-025, SP3-081, SP3-112, SP3-024, SP3-005, SP3-145, SP3-103, SPX-C-03, SPX-C-08, SPX-C-06, SPX-C-05, SPX-B-09, SPX-B-04, SPX-B-10, SPX-B-07, SPX-C-01, SPX-C-02, SPX-C-04, SPX-C-07, SPX-B-03, SPX-B-02, SPX-B-01, SPX-A-09, SPX-A-07, SPX-A-08, SPX-A-10, SPX-A-02, SPX-B-05, SPX-B-06, SPX-B-08, SPX-A-01, SPX-A-03, SPX-A-04, SPX-A-05, SPX-A-06, SPX-A-11, SPX-A-12, SP2-002, SP2-008, SP2-015, SP2-016, SP2-017, SP2-018, SP2-019, SP2-020, SP2-022, SP2-023, SP2-024, SP2-025, SP2-026, SP2-028, SP2-030, SP2-032, SP2-033, SP2-034, SP2-036, SP2-037, SP2-038, SP2-039, SP2-040, SP2-041, SP2-042, SP2-043, SP2-044, SP2-045, SP2-047, SP2-048, SP2-049, SP2-051, SP2-052, SP2-053, SP2-054, SP2-056, SP2-057, SP2-058, SP2-060, SP2-061, SP2-063, SP2-064, SP2-066, SP2-067, SP2-068, SP2-069, SP2-070, SP2-071, SP2-073, SP2-074, SP2-075, SP2-076, SP2-077, SP2-079, SP2-080, SP2-081, SP2-083, SP2-084, SP2-085, SP2-086, SP2-087, SP2-088, SP2-090, SP2-091, SP2-092, SP2-093, SP2-094, SP2-095, SP2-097, SP2-098, SP2-101, SP2-102, SP2-103, SP2-105, SP2-106, SP2-107, SP2-108, SP2-109, SP2-110, SP2-111, SP2-112, SP2-113, SP2-114, SP2-115, SP2-119, SP2-124, SP2-125, SP2-126, SP2-131, SP2-132, SP2-133, SP2-134, SP2-135, SP2-136, SP2-138, SP2-139, SP2-140, SP2-143, SP2-144, SP2-145, SP2-146, SP2-147, SP2-148, SP2-149, SP2-150, SP2-151, SP2-152, SP2-153, SP2-154, SP2-155, SP2-156, SP2-157, SP2-159, SP2-161, SP2-162, SP2-163, SP2-164, SP2-165, SP2-167, SP2-168, SP2-169, SP2-170, SP2-171, SP2-172, SP2-173, SP2-174, SP2-175, SP2-176, SP2-177, SP2-178, SP2-179, SP2-180, SP2-182, SP2-183, SP2-184, SP2-185, SP2-186, SP2-187, SP2-188, SP2-189, SP2-195, SP2-196, SP2-198, SP1-003, SP1-004, SP1-005, SP1-006, SP1-007, SP1-008, SP1-009, SP1-010, SP1-012, SP1-013, SP1-014, SP1-016, SP1-018, SP1-019, SP1-021, SP1-022, SP1-023, SP1-024, SP1-025, SP1-026, SP1-027, SP1-028, SP1-029, SP1-030, SP1-031, SP1-032, SP1-033, SP1-035, SP1-036, SP1-037, SP1-038, SP1-039, SP1-040, SP1-041, SP1-042, SP1-043, SP1-044, SP1-045, SP1-047, SP1-048, SP1-051, SP1-052, SP1-053, SP1-054, SP1-055, SP1-056, SP1-057, SP1-059, SP1-061, SP1-062, SP1-064, SP1-065, SP1-067, SP1-068, SP1-069, SP1-070, SP1-071, SP1-072, SP1-074, SP1-075, SP1-076, SP1-077, SP1-079, SP1-082, SP1-083, SP1-084, SP1-085, SP1-086, SP1-087, SP1-089, SP1-090, SP1-091, SP1-092, SP1-093, SP1-094, SP1-096, SP1-097, SP1-100, SP1-101, SP1-102, SP1-104, SP1-106, SP1-107, SP1-108, SP1-109, SP1-110, SP1-112, SP1-113, SP1-114, SP1-115, SP1-116, SP1-118, SP1-119, SP1-120, SP1-121, SP1-122, SP1-123, SP1-124, SP1-128, SP1-129, SP1-131, SP1-132, SP1-137, SP1-138, SP1-139, SP1-140, SP1-141, SP1-142, SP1-145, SP1-146, SP1-150, SP1-151, SP1-152, SP1-153, SP1-154, SP1-155, SP1-156, SP1-157, SP1-159, SP1-160, SP1-163, SP1-164, SP1-165, SP1-166, SP1-167, SP1-168, SP1-170, SP1-173, SP1-174, SP1-176, SP1-178, SP1-179, SP1-181, SP1-182, SP1-184, SP1-185, SP1-186, SP1-187, SP1-188, SP1-190, SP1-191, SP1-192, SP1-193, SP1-194, SP1-196, SP1-197, SP1-198, SP1-199, SP3-001, SP3-003, SP3-004, SP3-006, SP3-007, SP3-009, SP3-010, SP3-012, SP3-013, SP3-014, SP3-017, SP3-018, SP3-019, SP3-021, SP3-022, SP3-023, SP3-026, SP3-027, SP3-028, SP3-030, SP3-031, SP3-033, SP3-034, SP3-035, SP3-036, SP3-038, SP3-041, SP3-044, SP3-047, SP3-048, SP3-049, SP3-051, SP3-052, SP3-053, SP3-055, SP3-056, SP3-057, SP3-058, SP3-059, SP3-060, SP3-062, SP3-065, SP3-066, SP3-068, SP3-069, SP3-070, SP3-072, SP3-074, SP3-075, SP3-076, SP3-078, SP3-080, SP3-082, SP3-083, SP3-084, SP3-085, SP3-086, SP3-088, SP3-089, SP3-091, SP3-092, SP3-093, SP3-095, SP3-097, SP3-098, SP3-100, SP3-101, SP3-102, SP3-104, SP3-106, SP3-107, SP3-108, SP3-109, SP3-113, SP3-114, SP3-115, SP3-125, SP3-126, SP3-127, SP3-128, SP3-129, SP3-131, SP3-132, SP3-135, SP3-136, SP3-138, SP3-141, SP3-143, SP3-144, SP3-151, SP3-155, SP3-158, SP3-162, SP3-167, SP3-168, SP3-170, SP3-171, SP3-182, SP3-183, SP3-184, SP3-185, SP3-191, SP3-195, SP3-196, SP3-198, SP3-199, SP3-200
