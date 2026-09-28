# PB-SLICE-B — customs crossing with three honest approaches + refinery shortage solved by visible delivery

Board row 77. Pair: SF-289 (the customs weir has three honest ways through) + SF-290 (a starved
refinery is a real shortage the player can see, run, and physically resolve).

Status: **integrated + route-proven** — focused suite 12/12, adjacent law/customs 125/125,
economy 53/53, customs-post/patrol/encounter batch 41/41 runnable (one suite is red only on a
missing `@dimforge/rapier3d-compat` package in this environment — boots a full physics sim).

## What the player gets

**SF-289 — the gate reads the reader, and a runner is remembered.** Crossing a customs weir now
ends one of two ways, never silently: the manifest beam finishes and the transit is logged
(existing behavior), or the hull leaves the gate before the read completes and the booth flags it.
A fast pass that never fed the beam is a `speed_run`; breaking a partial read is a `read_bolt`.
Either emits `customs:weirBolt` + a `law:response` row + a booth alert line, and the gate
faction's scanners remember the hull through the existing `customsHotUntil` ledger — the same
record an evaded patrol scan writes, with the same decaying window. A mid-read bolt that let the
beam get at least halfway resolves through `runScan({source:'customs_weir_bolt'})` — bolting does
not erase a manifest the beam mostly kept. The three approaches are honest: stay slow and clean,
stay out entirely (free, recoverable), or run it and carry a visible, proportionate, decaying
flag.

**SF-290 — a starving yard is a lead, and relief lands.** `starvedIndustryNeedFor` reads the
same stock/baseEq fill the industry tick throttles on, so a posted shortage is the real hopper,
not a rolled event. When a neighbor-sector station's industry book has an input leg below 30%
fill, the local contract board posts a `cargo_delivery` relief run naming the starving input, the
destination yard, and why ("its line is idling on an empty hopper"). Accepting it is the ordinary
mission path; delivering it now matters — `cargo:delivered` feeds `applyStockPressure(..., 'sell',
qty)`, so contract freight lands as real market stock through the same authority as a sale, and
the starved line physically resumes. A fed neighborhood posts nothing.

## Implementation

- `src/systems/lawSecurity.js` — `_weirCrossedUnread(weir, prior, state)` on the seen→not-inside
  transition: classifies `speed_run` vs `read_bolt`, emits `law:response`/`law:voice`/
  `customs:weirBolt`, and resolves a ≥half-complete read through the economy scan path. The
  no-weir branch (sector exit while inside the gate) bolts on the recorded weir too — jumping
  away is still leaving the gate unread — and a stale foreign-weir record (Helios→Tethys jump,
  the two weir sectors are mutual neighbors) flags the first gate before the second takes over.
- `src/ui/customsPrompt.js` — `customs_weir_bolt` and `jump` join `customs_weir`/`dock` in the
  exclusion: those reads are already resolved synchronously, so the verb deck would offer dead
  verbs (the `jump` case was a same-class pre-existing gap found in review).
- `src/systems/encounterScripts.js` — a live patrolScan no longer stamps a weir-bolt or
  jump-gate bust as its own scan result; the gate's and the jump's busts belong to themselves.
- `src/systems/economy.js` — `starvedIndustryNeedFor(stationType, tier, market)` export;
  `customs:weirBolt` and `cargo:delivered` listeners; `_markFactionGatesHot` extracted as the
  single writer of `player.customsHotUntil` (the evaded-scan path now calls it).
- `src/systems/economyContracts.js` — `planOffer` checks `_starvedNeighborNeed` before the rolled
  field contract; `_starvedIndustryOffer` builds a board-shaped `cargo_delivery` offer through
  the same `affordableContractQuantity`/`quoteMissionEconomics`/`stableFieldOfferId` machinery as
  the existing relief template, cause tag `industry_starved`.
- `test/pb-slice-b-weir-bolt-starved-yard.test.mjs` — 9 focused cases.

## Tests (all authoritative state, seeded sim)

1. Lawful approach: hold the read → transit logged, clean exit, zero bolt events.
2. Speed run: one unread transit → exactly one `customs:weirBolt` (`speed_run`), law row, booth
   line, no scan resolution.
3. Read bolt: ≥half-read exit resolves `runScan` once; a shallow graze flags without resolving.
4. Sector exit mid-visit still bolts (leaving space is leaving the gate); Helios→Tethys jump
   flags the first gate even though the destination has its own weir; a completed transit that
   then leaves the sector is clean.
5. Refusal: never entering the gate costs nothing.
6. Bolt → `customsHotUntil[faction]` set to now+HOT window; repeat bolts take max, never stack.
7. `starvedIndustryNeedFor` names the hungriest input leg of a real yard book; a fed line → null.
8. A starving neighbor yields a posted board offer into the yard (dest station, real input,
   cause tag, honest summary); a calm neighborhood → null.
9. Contract delivery lands in the market: iron stock rises by the lot, the starved line's output
   rate resumes (>3× the starved trickle), and the yard eats the relief rather than banking it.

## Attribution / notes

- No new authority: the bolt reuses `customsHotUntil`, the scan path, and `law:response`; the
  relief offer reuses the existing delivery-mission and board contract shapes; the delivery
  reuses `applyStockPressure`.
- `cargo:delivered` had zero consumers before this — contract freight previously vanished at
  settlement. It now lands for every delivery type, not just the relief offer.
