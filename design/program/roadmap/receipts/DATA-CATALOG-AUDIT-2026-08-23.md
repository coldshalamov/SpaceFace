# Data catalog audit - 2026-08-23

Cross-referenced every id across `ships`, `weapons`, `modules`, `attackTraits`, `enemyTypes` and
`commodities`.

## Result

- **155 distinct ids.**
- **0 referenced-but-undefined ids.** Every weapon named by a ship, every loot drop rolled by an
  enemy, and every `shipId` an enemy flies resolves to a real entry.
- **16 ids appear in two catalogs**, and that is the design, not a defect.

## The sixteen, and why they are correct

`mod_twin_mount`, `mod_triad_mount`, `mod_piercing_core`, `mod_forked_core`, `mod_bank_shot`,
`mod_smart_bank`, `mod_ion_payload`, `mod_incendiary_payload`, `mod_gravity_tag`, `mod_relay_arc`,
`mod_bank_relay`, `mod_tether_capacitor` and others are each **both** an entry in `MODULES` and an
entry in `ATTACK_TRAITS`.

That is the seam PQ-133.11 built. `attackModifiersFromFit()` takes the ids on a ship's fittings and
looks each one up directly in `ATTACK_TRAIT_BY_ID`. The shared id is what turns a Rig the player
bolts on into a modifier the attack compiler understands. Give either half a different id and the
lookup silently stops matching — the module would still fit, and the trait would simply never apply.

**Do not "de-duplicate" these.**

## Method

Twenty lines of node: import each catalog, collect every `id`, then diff the referenced ids against
the defined ones. Worth repeating after any catalog change; not worth delegating.
