# S-05 drafts — Pallas Drift

Three persona drafts. The Drifter wants the drift's working hospitality on the map;
the Archivist wants the missing counted; the Accountant wants the off-ledger economy
priced and legible. (S-11's shipped Faith Filing Ninth and Drift Tag already cover
claims-filed-on-trust and labor-tag culture — all three drafts work around them.)

## The Drifter — "the drift feeds you and forgets you, in that order"

Grounds: Drift Market's food surplus is the sector's social fact — the fringe's
kitchen — and hospitality needs furniture.

1. **"The Mess Line"** off the market's south approach (~900,-1100): a parked rack of
   ration pods staged for the outbound skiffs — the ration run's loading bay, visible.
2. **"Skerward Ward-Buoy"** on the southwest leg (~-1400,2100): a local-maintained
   marker that reads both directions — "last cheap air before Sker prices." Drift
   hospitality as lane furniture.
3. **Quiet approach texture** — `faction_quiet` bark fills: the den's etiquette spoken
   (no manifest, no memory, knock once).

Schema: sectors.js POIs + faction_quiet fill. The kitchen and the warning both get
built.

## The Archivist — "seventeen berths, and the count is a kindness"

Grounds: the Quiessence is a census of the still-warm. Drift culture's answer to the
missing is keeping their place — nobody has built the place.

1. **"The Eighteenth Mooring"** on the Quiessence's approach, outside its exclusion
   (~-1100,-1550): an empty kept mooring pin, lamp burning, for the freighter that
   never joined formation. The plate explains the custom: you keep the berth, you
   don't ask the name.
2. **rim_poi_lore** entries for the new POIs — the drift's customs told in scan text.
3. **Quiet Numbers** +2 lines: the census voice counting the mooring and the bell.

Schema: sectors.js POI + rim_poi_lore + 040-band numbers lines. Rejects adding a
second vigil POI — the mooring carries it; the belt's vigil already ships the form.

## The Accountant — "off the books is still a ledger"

Grounds: "no manifest, no memory" is an accounting practice, not an absence of one.
The nebula's edge should show where the unlogged economy parks its float.

1. **"Off-Books Berth"** at the nebula's south rim (~250,1350): cold lockers staged
   where the murk eats a scanner — freight that never met a manifest, tagged in
   grease-pencil tallies only.
2. **"The Quiet Bell"** on the Smuggler Den approach (~-950,700): a whistle-buoy the
   regulars ring once on approach — the den's doorbell, and the only record the
   house keeps of who called.
3. **The Margin or Static** +2 lines pricing the drift's two economies (the kitchen's
   surplus, the den's silence).

Schema: sectors.js POIs + 040-band. Rejects touching the market's surplus numbers —
economy lanes own those; flavor cites them.
