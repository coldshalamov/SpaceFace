# P3 — one pilot, one progression — diagnosis

**2026-11-06, Lane 4 (SHIP). Doc phase only; no `src/` edit before the owner approves.**

## 1. The player-visible problem

Nothing a player does adds up to a person. The ship gets better, the shop opens, a run gets perks,
a faction likes you — and none of it is *you*. `design/VISION.md` says progression must make the
player ask "what can I do now?"; today the only answer is "a bigger number".

## 2. The measured cause chain

- **Four stores, four currencies.** `src/data/tech.js` holds 35 research nodes (combat 17,
  industry 7, logistics 7, drives 4) bought with credits **and** research points. `src/data/swarmPerks.js`
  holds 6 run perks in fixed slots. The Swarm draft adds run-scoped cards. Career rank and faction
  standing are separate counters. Verified by reading each owner; none of them imports another.
- **Research is a catalogue, not a character.** Its nodes unlock *ships and modules*
  (`unlocks: { ships, modules }`); the tree cannot express "you can now do X".
- **The ship screen has no pilot.** The Ship Sheet (P1) shows the machine and nothing about the
  person flying it.
- **The vocabulary diverges.** A Crucible perk and an Adventure module can mean the same thing and
  share no word, so a Swarm player learns a different language from an Adventure player.

## 3. The architecture question

This is **not** a bug. Each of the four systems is sound inside its mode. The bottleneck is that
nobody owns the *player*: there is no module whose job is "this is what you can do now". A fifth
parallel system would make it worse, which is exactly what master plan P3 forbids.

Replacing the design costs one data file (40 nodes), one owner (`src/systems/pilot.js`), one save
migration, and per-node verb wiring released branch by branch. It buys one screen that answers the
owner's actual request — a character — and one vocabulary the run modes borrow instead of invent.

## 4. The road

`PILOT_TREE.md` in this folder: five verb branches (Gunnery, Line Work, Piloting, Engineering,
Salvage & Trade), 40 nodes, every node a verb change with a preview sentence, one XP bank fed by
every mode, research re-cast as the **blueprint catalogue** (where parts come from), run perks kept
run-scoped but tagged with the same five words.

## 5. Stop point

The owner approves the tree (§7 of `PILOT_TREE.md`). Then: `src/systems/pilot.js`, the data file,
the save migration, and the Ship Sheet's pilot strip. No implementation before that.
