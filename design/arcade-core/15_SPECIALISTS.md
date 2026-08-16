<!-- LIFETIME: DURABLE -->
# 15 — SPECIALISTS: the counterplay class

Specialists exist to disrupt what the player is doing (VISION) — each one attacks one of the
player's verbs, and each has a physical, readable counter. They are why "one loadout solves
everything" fails. Most are mediums mechanically; they're their own doc because their job is
*rules*, not mass.

| Entry | Attacks your… | Mechanic (existing tech) | Your counter | Tell |
|---|---|---|---|---|
| **Tether-cutter** (exists in checks — surface it) | Massline | Severs your line on a charge-up | Kill it first, or bait the cut and re-latch | Glowing shear rig, charge whine |
| **PD screen** | Missiles/ordnance | Flak bubble intercepts ordnance (flak exists) | Guns and beams; or shove *it* into your mine | Puff interceptor flashes around it |
| **Jammer** | Radar/targeting | Sensor fuzz bubble: contacts smear inside radius (presentation-only; sim stays exact) | Kill it, or close inside the fuzz | Antenna fan, static shimmer |
| **Shield projector** | Your DPS | Projects bonus shield onto allies (Bulwark link, 13) | EMP strip, or physically separate it from its wing with a mine | Beam tethers to allies |
| **Tender** | Attrition | Repair drone that patches hulls (bounded pool, not infinite) | Kill it; or catch its drone with a well and throw both | Green weld-flashes |
| **Minelayer** | Your chase lines | Seeds mines (mines.js) | Detonate from range; repulsor the field back at it | Rack spine, drifting payload |
| **Anchor** | Your mobility | Projects the anchor-snare field (exists in fields.js!) | Destroy the source hull — the field dies with it | Field rim, slow turn |
| **Kiter** | Your patience | Long-range plinker that never closes | Ignore it and kill its wing; it has no damage race | Distant tracer flashes |

## Rules

- One specialist per wing at most, until late sectors. The puzzle must stay readable.
- Every specialist effect is **visible as a world effect**, never just a debuff icon (I-4
  spirit): the jammer's fuzz is on your radar, the projector's beams are lines in space.
- Specialists are *priority-readable*: when one is present, its tell is the loudest non-lethal
  thing on screen.
- No specialist affects *player controls* directly (I-2) — they attack information, ordnance,
  shields, and positioning, never your hands.

## Acceptance

- Per entry: bot route where its counter works and a route where ignoring it is visibly
  punished.
