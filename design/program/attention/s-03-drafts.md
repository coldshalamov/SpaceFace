# S-03 drafts — Tethys Junction

Three persona drafts. The Drifter wants convoys that talk and lanes that work; the
Set Dresser wants the toll plaza's grammar extended down all four legs; the Skeptic
wants customs friction the player can actually trip over.

## The Drifter — "every leg out of the junction should sound like a road"

Grounds: the junction is a crossroads that behaves like a waiting room. Convoys need
voices and the three bare legs need lane grammar.

1. **Convoy-marshal furniture on the Io leg** — the southeast corridor (toward the
   Reach convoys) gets a marshal buoy pair: "Convoy Marshal Nine" (nav buoy) and a
   staggered "Form-Up Post" (tally post), the MTS convoy assembly point the Trade
   Hub's dispatch board keeps implying.
2. **The Ceres ore leg's overflow** — a "Weigh Spill Rack" (container rack) where the
   Tally's queue physically overflows west toward Ceres: the line that couldn't hold.
3. **Convoy radio lines** — MTS `patrol-greeting`/`scan` fills in convoy-marshal voice
   (count your hulls, hold the interval) + Fulfillment Routing lines that name the
   junction's legs.

Schema: sectors.js POIs + barkSituationFill faction_mts + 040-band routing lines.

## The Set Dresser — "one plaza, four roads"

Grounds: the Tally zone is a complete sentence; the other three legs are blank paper.
Extend the same furniture vocabulary so the whole junction reads as one place.

1. **Vesta leg: "Second Count Buoy"** — a decommissioned pre-Meridian count station
   (nav buoy, dead lamps) on the southwest corridor: the toll's older layer, Concord
   era, still mounted.
2. **Io leg: toll overrun dressing** — a "Refused Consignment" pair (cargo pod +
   cold locker) at the form-up point: freight that failed the count and was parked
   off-lane, still tagged.
3. **rim_poi_lore bindings** — three-line scan text for each new POI in the two-bureaucracy
   register (Meridian gold on Concord frames).

Schema: POIs + rim_poi_lore. All props from the admitted Tally vocabulary
(nav buoy, tally post, lane pin, container rack, cargo pod, cold locker, worklight).

## The Skeptic — "the toll should bite once"

Grounds: toll friction is currently decorative — you see a queue, you don't feel a
hold. One authored beat should make a player feel the desk's teeth, and the lane
stories should have an ending a scanner can find.

1. **"The Re-filed Hull"** — a derelict on the Vesta leg: a hauler impounded mid-lane
   when its desk collapsed, still flagged HELD, plate explaining the desk that died
   before the hold did. (Lane story with a punchline.)
2. **A real toll payoff** — one `cache` POI off the Io leg, "Toll Rebate Cache,"
   contents modest: the rebate desk's unclaimed float, findable by anyone who scans
   the marshal post's plate first.
3. **Static channel cross-talk** — two Static lines that heckle the new furniture by
   name (the junction's pirate counterpoint to the marshal voice).

Schema: POIs + 040-band static lines. Rejects more abstract routing lines — the
channel already has 60 entries; non-redundancy axis fails.
