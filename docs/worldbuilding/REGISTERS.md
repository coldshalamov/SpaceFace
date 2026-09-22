# Faction registers

A writer opens one house sheet, or this index, and writes one bark. A reader
assigns that bark to its house without guessing.

These are writing rules. They are not lore. Lore stays on the sheets. Cited
example bytes stay in `src/data/barks.js` or `src/data/narrative.js`. Do not
rewrite those files.

## The eight

Canon houses from `orgs/factions-CANONICAL.md`. Not a ninth house.

| House | Sheet | Tell (primary; the sheet lists them all) | Cite |
|---|---|---|---|
| Concord | `sheets/factions/concord.md` | `Ref 44-C` | `src/data/barks.js#faction_scn.scan[0]` |
| Choir | `sheets/factions/choir.md` | `The Choir observes` | `src/data/barks.js#faction_choir.scan[0]` |
| Helix | `sheets/factions/helix.md` | `VARIANCE FILE OPEN` | `src/data/narrative.js#COMMS.story.story_b8_helix_audit` |
| Vael | `sheets/factions/vael.md` | `Clause 1` | `src/data/barks.js#faction_vael.scan[0]` |
| Quiet | `sheets/factions/quiet.md` | `Seen.` | `src/data/barks.js#faction_quiet.scan[0]` |
| Drift | `sheets/factions/drift.md` | `Long shift` | `src/data/barks.js#faction_dmc.scan[0]` |
| Reach | `sheets/factions/reach.md` | `Weigh-slip` | `src/data/barks.js#faction_reach.scan[3]` |
| MTS | `sheets/factions/mts.md` | `Nothing personal` | `src/data/barks.js#faction_mts.scan[0]` |

Required keys the validator can read: `register_rule`, `register_tell`,
`register_forbidden`, `register_example`, `register_example_cite`,
`voice_direction`.

- `register_tell` is one tell phrase per line, primary first. Matching is
  case-insensitive. A new bark should carry at least one tell from its own
  sheet; a bark that carries none is unassignable and the reader says so
  instead of guessing.
- `register_forbidden` is one forbidden term per line. A bark that uses its
  own house's forbidden terms is disqualified from that house.
- `register_example` must match the cited source bytes. Invented example
  text fails. An example that carries none of its own tells fails. An
  example that uses a forbidden term fails. A cite that names another
  house's bytes fails. An empty rule fails. A lore-only sheet fails.

## Free Frontier cite — not a ninth house

`sheets/factions/free-frontier.md` already has `voice_register`. Cite it. Do
not invent register keys on it. Do not make `faction_free` a ninth house.

`voice_register` bytes:

```text
Nobody's. The Frontier has no customs arm, no song, no flag — only a
contract board door at the B4 clearing station. The door says FREE CAPTAINS.
The freight says whatever the Quiet vetted it to say.
```

## Voice

Directed synthetic voice. No recorded actor. PQ-158.04 is the pipeline; each
sheet's `voice_direction` names its register. Helix has no bark table and no
voice register, so Helix filings render as text only.

| House | Sample | Fundamental | Rate | Bandpass |
|---|---|---|---|---|
| Concord | `bark_scn` | 110 Hz | 0.94x | 420–2600 Hz |
| MTS | `bark_mts` | 140 Hz | 1.04x | 380–3200 Hz |
| Drift | `bark_dmc` | 95 Hz | 0.90x | 280–2200 Hz |
| Reach | `bark_reach` | 155 Hz | 1.08x | 500–3400 Hz |
| Quiet | `bark_quiet` | 125 Hz | 0.78x | 360–1800 Hz |
| Choir | `bark_choir` | 170 Hz | 0.88x | 440–3000 Hz |
| Vael | `bark_vael` | 80 Hz | 0.86x | 220–1600 Hz |
| Helix | unvoiced filing | — | — | — |

## 7-of-8

The done-when is a blind reader assigning a bark to its faction 7 of 8 times.
The headless proof is fixed seed 17802 in `test/pq-178-02-registers.test.mjs`:
eight fresh barks written from the rules, each carrying its own tell and none
of its own forbidden terms, all assigned to the right house with none
assigned wrong. The live corpus sweep (266 lines, 7 bark tables) assigns 243
with zero misassigned; the 23 it returns are bare fragments and legacy lines
that predate their rules, and the reader abstains rather than guess.

A human playtest percentage is uninvented. Headless only:

```text
node scripts/check-faction-registers.mjs
node --test test/pq-178-02-registers.test.mjs
```
