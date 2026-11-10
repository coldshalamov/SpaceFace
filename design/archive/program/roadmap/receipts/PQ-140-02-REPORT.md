<!-- LIFETIME: RECEIPT -->
# PQ-140.02 — Four specialists, one plan each

```text
DONE  PQ-140.02 — four named plans on live hulls. A loaded Massline dies after the spool telegraph. A parked well dies after the charge telegraph. The anchor's snare is a 235 WU field the player cannot kite through. The warden holds a screen point short of the hunt. Two bastions share a silhouette; mass 420 vs 96 and crawl vs dart separate them.

WHAT I FOUND     The roster already had the four hulls and doctrines. The raider contested a line and never cut it (cut() requires ownership). The ghost's EMP was a gun, not a well-collapse. Specialist verbs on the decision tick used getCombatKernel(state), which throws. A cooldown of `last|0` blocked the first cut.

WHAT I CHANGED   Four frozen plans. After attach_window the raider breaks the player's line through breakAttachment. After fire_window the ghost collapses player wells through fields.disruptNear. Tactical AI passes the live kernel and the doctrine phase. Capture parks one unique hull at a time beside the Hitch at the shipping chase camera.

WHAT YOU WILL FEEL   A blade that has telegraphed TETHER will cut the rock you are on. A lance that has telegraphed CHARGE will drop the well you parked. A heavy bastion drags a snare you have to break or leave. A lighter bastion stands between you and the pack.

THE NUMBERS      bar | before | after | target
                 loaded line vs raider in attach_window | contested, still latched | broken specialist_cut | plan broken
                 parked well vs ghost in fire_window | well stays | kernel size 0 | plan broken
                 anchor snare | authored 235 WU | live snapshot ≥ 200 WU | cannot kite through
                 warden screen point | hunt the threat | between ward (200) and threat (900) | screens the pack

THE FRAMES       design/program/roadmap/receipts/PQ-140-02-tether_cutter.png, PQ-140-02-field_disruptor.png, PQ-140-02-anchor.png, PQ-140-02-cargo_protector.png. Ledger: PQ-140-02-silhouettes.json. Authored hulls, unique ids, Kestrel plus one specialist. Heavy bastion fills more of the frame than the light one. The two fighters sit at Hitch scale; catalog silhouettes corsair_blade and sniper_lance.

NEXT             PQ-140.03 fodder is ammunition. PQ-174.03 roles in the swarm.
```

## Review

Silhouette stills at the shipping chase camera (zoom 144), HUD text off. Four scenarios in `test/pq-140-02-specialists.test.mjs`.

- Bugbot ([Review](63c16463-6249-42e8-adf7-64a2880cd0b9)): no findings. Verbs key on enemy hull id (`quiet_ghost` only for disrupt, not the shared `ranged_disengager` doctrine).
- Critic ([Critic](34046345-c340-41b6-984f-9f7c56e700c1)): PASS. Second hull in every still. Blade vs dark-winged fighter vs heavy H vs light H. Bastions share family and separate by scale.

## Checks

| Check | Result |
|---|---|
| `node --test test/pq-140-02-specialists.test.mjs test/tether-control-raider.test.mjs test/field-anchor-controller.test.mjs test/combat-doctrines.test.mjs test/wf02-escort-screen-doctrine.test.mjs` | 24 pass |
| `npm run check:combat` | green |
| `npm run check:baseline` | 14/15; legacy 47-A hash `ecd131b…` vs expected `76116bb…` (pre-existing, not this leaf). sim-v3 green. |
| `node scripts/capture-pq140-02-specialists.mjs` | four stills + ledger |

No new doctrine IDs. No Crucible AI fork. No new hulls.
