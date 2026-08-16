<!-- LIFETIME: DURABLE -->
# 38 — DAMAGE STATES: hulls tell their story

In-world damage read (GDD §6.1 bans HP arcs in-world): a ship's condition is visible on the
ship. Applies to everyone — you, enemies, civilians.

## The bands (hull fraction → persistent dressing)

| Band | Dressing |
|---|---|
| 75% | Scorched decal patches; intermittent spark from one point |
| 50% | Active fires (pooled flame emitters), thin smoke trail, one flickering running-light group |
| 25% | Venting gas plumes, thick smoke, engine guttering (flame stutters), shed armor plates as real debris, listing idle animation |
| Disabled | Dark hull, emergency beacon strobe only, free tumble or drift — *this is the salvage/tow/readable state* |

## Behavior ties (not just paint)

- Flee telegraph (GDD §6.2): a fleeing NPC dumps cargo, pours smoke, and barks. The dump is
  physical and lootable — cowardice has a price tag.
- Damage states drive AI: 25% ships fight worse (slight thrust/aim degradation — *them*, not
  the player, I-2), making a wounded enemy visibly desperate.
- The player's own hull shows the same language (38 applies to you): your survival state is
  readable without looking at a bar.
- Repair: station repair clears the dressing progressively (you watch your ship get patched
  in the dock cam — small joy, near-zero cost).

## Persistence

- Scars (44): pre-repair, the *player's* hull keeps dent decals session-persistent; owner
  chooses "keep scars" vs full repaint at repair time. Cheap, beloved.

## Acceptance

- Human gate: four captures (one per band) of the same hull; owner ranks them by health
  correctly, instantly, 4/4.
