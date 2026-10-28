# S-02 drafts — Ceres Belt

Three persona drafts. The Drifter wants the company town's working grammar on the rock;
the Skeptic wants the wrecks to pay off a player who pokes; the Archivist wants the belt's
dead and its ration economy to be remembered in place.

## The Drifter — "paper first, charges second"

Grounds: Ceres is a claim town. Every rock already has an owner; the game just doesn't show
the fence. Build the claim grammar and the ration economy into the belt itself.

1. **Claim-tag POI cluster on f_ceres_1's rim** — "Claim Forty-Tag", a pin array marking a
   worked claim (place_claim_mark), plus a contested re-stake marker: two claim pins on one
   rock, the second stamped over the first.
2. **The ration run made physical** — a drifting provisions crate POI off the Belt Outpost
   approach ("Short-Ration Pod") and a fuel-cell surplus rack at the refinery — the two
   marketEquilibriumFactors already shipped, made visible.
3. **Miner chatter** — DMC `scan`/`patrol-greeting` fills in the claim-town voice:
   tally-talk, wet-weigh jokes that aren't jokes, "paper first."

Schema: `sectors.js` POIs (inline pos, claim_mark / debris_chunk / container_rack /
cargo_pod bodies); `barkSituationFill.js` faction_dmc. Cost: pure data. The pick-pool is
pinned, so faces stay put.

## The Skeptic — "the belt keeps its dead in the open"

Grounds: "quiet dread" currently means one plate on one driller. A player who slows down in
the belt should keep finding aftermath — and one of the finds should be worth the stop.

1. **Wreck dressing near Wreck Cathedral** — a votive worklight ("Cathedral Vigil") and a
   scrap-cage of crew effects ("Widow's Tether") on the Cathedral's approach. Named dead in
   the plates: two of the Second Measure's manifest.
2. **A cache that pays** — one `cache` POI with `contents` (ore_copper, small) + a plate
   that tells who left it and why the claim lapsed. The Skeptic's rule: one real payoff,
   not ten vibes.
3. **The Pallas leg's only furniture** — a burned claim pin on the southwest corridor:
   the claim that outlived the crew, still transmitting.

Schema: POIs + one `contents` payoff; `rim_poi_lore` entries bind three-line scan text to
each new POI (Helios is excluded there; Ceres is not). Rejects the ration-crate idea as
econ trivia — poking should find dread, not bookkeeping.

## The Archivist — "the column is shorter than the names"

Grounds: the belt already canonically names its dead (Shaft 7's two unaccounted, Kessler's
nineteen-year scale, Elroy's recycler). The POI layer should hold those names in place, not
invent new ones.

1. **"Shaft Seven Marker" POI** — a memorial buoy at the closed-refinery side of the belt;
   the plate carries the two names the tally owes.
2. **rim_poi_lore three-liners** for every new POI — the scan answers in the belt's own
   tally voice.
3. **ballad_line appends** — four Ceres verses on the DMC-home channel (the wet weigh, the
   lapsed pin, the crew who missed the calm).

Schema: `sectors.js` + `100-rim-poi-lore.js` + `040-band.js`. Cost: pure data. Weakness:
memory-heavy, light on the working present — needs the Drifter's claim grammar to balance.
