# Gang Sheet — The Maw Brotherhood

```yaml
id: gang_maw_brotherhood
name: The Maw Brotherhood
type: cult / warband (the dreadnought's congregation)
parent_faction: unaffiliated (they worship the Iron Maw; the Iron Maw does not worship back)
home_sector: world_ashfall (S9 — they orbit the Boss Arena Signal; they believe the dreadnought is a god)
size: ~15 hands, 3 ships that fly in the dreadnought's sensor shadow
leader: npc_jhira   # Jhira the Maw-Bride — see Notes
colors: hulls painted in the dreadnought's heat-signature pattern; they want to be mistaken for it
ship_archetype: tier-1 raiders flown as escort for something they cannot control
narrative_function: |
  The Maw Brotherhood believe the Iron Maw dreadnought at the Ashfall
  approach is a sleeping god, and that they are its congregation. They are
  wrong. The dreadnought is a Concord-asset dreadnought running an
  autonomous patrol loop, spawned by world.js:_spawnBossIfDue, and it
  destroys the Brotherhood's ships as readily as anyone else's when they
  wander into its engagement envelope. The Brotherhood interprets this as
  the god's testing of the faithful. The Brotherhood is the tragicomic
  element — true believers in a machine that does not know they exist.
dostoyevsky_layer:
  theme: the_holy_fool   # the corrupted mirror — innocence weaponized against itself
  expression: |
    The Maw Brotherhood are the holy fool as tragedy. Their devotion is
    real. Their god is a procedural spawn. The innocence is constitutive,
    not chosen — and the structure (the dreadnought's patrol loop) destroys
    them on a schedule. The Brothers die for a god that files them under
    HOSTILE on contact.
lecarre_layer:
  theme: the_unwitting_decoy
  expression: |
    The Brotherhood's orbit of the Iron Maw is operationally useful — their
    ships clutter the dreadnought's targeting, their corpses litter the
    approach, their presence makes the boss arena look like a contested
    warzone rather than a gate. Marsh has never cultivated them. Marsh
    doesn't need to. The Brotherhood's faith is the operation's camouflage.
canon_refs:
  - ../../story/ENDGAME-B7-REDESIGN.md#the-kurtz-figure-ashfall-reach   # the Iron Maw reconciliation
  - ../../DOSTOYEVSKY-LAYER.md#the-holy-fool
  - ../../LECARRE-LAYER.md#the-handler-and-the-cast
appears_in_chapters: [B6, B7]
```

## Jhira the Maw-Bride (the prophet)

**Voice:** *The liturgical.* Jhira speaks in the register of scripture — declarative, present-tense, full of "the Maw wills" and "the Maw devours." Jhira is not insane. Jhira has simply organized her life around a single proposition (the dreadnought is a god) and now everything must be reconciled to the proposition or the proposition collapses. The Brothers who die in the engagement envelope "lacked faith." The ships that survive "were found worthy." The dreadnought's patrol loop is "the Maw's hunger." Jhira has built a theology around a spawn script.

**The scheme:** the Brotherhood escort pilgrims (paying pilgrims) to "the Maw's presence." The pilgrims who survive the approach (few do) are charged a second fee for "the blessing of passage." The pilgrims who die are "taken." The fee structure is a protection racket dressed as religion. Jhira keeps the fees. Jhira believes.

**The strut:** Jhira thinks the player is a pilgrim or a heretic. The player is neither. The player is the bait of an intelligence operation approaching a procedural boss. The collision between Jhira's theology and the operation's cartography is the tragicomic set-piece — two utterly incompatible readings of the same dreadnought, neither aware of the other, both filed under REF 44-C in different columns.

**Coercion hook:** the player approaching Ashfall must get past the Brotherhood's patrol (they will challenge the player's "faith"), the dreadnought (it will challenge the player's hull), or both. The Brotherhood can be bribed (a "pilgrim's offering"), fought, or — for the player who reads Jhira's scripture closely — given a "relic" (any fragment of hull plating works; the Brotherhood cannot tell Vethari hull from debris) that earns "passage."
