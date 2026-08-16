<!-- LIFETIME: DURABLE -->
# 17 — FACTION COMBAT IDENTITIES

8 factions exist; `factionDoctrines.js` and `factionPaletteClaims.js` exist. Standard: you
should know **who** is shooting you from silhouette, palette, and *how* they fight — before
checking a single UI element.

## Per-faction combat signature (author into doctrine data; names from factions data)

Each faction gets, in data: preferred mass class, preferred weapon family, one signature
behavior, one signature specialist, retreat discipline, and paint/palette claims. Example
fill (adapt to real faction names):

- **Navy/patrol types**: mediums and heavies, kinetic, tight wedge formations, PD screens,
  *disciplined retreat* (they break off cleanly and vector out). Fighting them feels
  professional and bad for you.
- **Pirate confabs**: light swarms + corsair mediums, impulse weapons (they want your cargo
  *intact*), anchor-snare specialists, *cowardly* — first real losses trigger the dump-and-run.
- **Corporate security**: mediums, energy weapons, shield projectors and tenders, stubborn —
  no retreat while an asset (convoy, site) lives.
- **Miner guilds**: industrials, repurposed beams and charge launchers, terrain masters —
  they fight *in* the rocks and herd you into them.
- **Zealots/monastic orders**: Ember-type volatile hulls, ram-adjacent behavior, no retreat,
  ever. Creepy and spectacular.
- **Frontier militia**: junk fits, mixed everything, unpredictable — the wildcard faction.

## Rules

- Palette claims are **exclusive per faction per scene** (existing claim system) and
  colorblind-redundant via silhouette + IFF glyph.
- Doctrine differences must be *felt in a fight*: if swapping faction data doesn't change how
  a wing behaves within 10 seconds of contact, the doctrine is flavor text — deepen it.
- Faction identity extends to their stations (22), ships' wear patterns (44), and barks (29).

## Acceptance

- Blind test (human gate): owner watches 3 fights against 3 factions, no UI labels, and names
  who's who. Pass = 3/3.
