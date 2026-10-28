# PQ-137.10 (hitstun half) — the 60-cell hitstun curve, seed 4242, real path

4 sources x 3 hulls x 5 levels. `k` is MEASURED |dV| / cruise, never intended.
Cruise is `entity.data.derived.propulsion.combatSpeed`. Helm-loss is contiguous zero-thrust ticks
after the event / 60. Helm owner is the public bus event inside that window.

| source | hull | mass | cruise | k intended | k measured | helm-loss s | entry spin rad/s | helm owner |
|---|---|---:|---:|---:|---:|---:|---:|---|
| gun | ship_wasp | 16 | 210 | 0.05 | 0.0500 | 0.4833 | 0.0000 | none |
| gun | ship_wasp | 16 | 210 | 0.15 | 0.1500 | 0.4833 | 0.0000 | none |
| gun | ship_wasp | 16 | 210 | 0.30 | 0.3000 | 0.4833 | 0.0000 | none |
| gun | ship_wasp | 16 | 210 | 0.60 | 0.6000 | 0.4833 | 0.0000 | none |
| gun | ship_wasp | 16 | 210 | 1.30 | 1.3000 | 2.8167 | 0.0000 | combat:collisionConsequence |
| gun | ship_drifter | 48 | 195 | 0.05 | 0.0500 | 0.4833 | 0.0000 | none |
| gun | ship_drifter | 48 | 195 | 0.15 | 0.1500 | 0.4833 | 0.0000 | none |
| gun | ship_drifter | 48 | 195 | 0.30 | 0.3000 | 0.4833 | 0.0000 | none |
| gun | ship_drifter | 48 | 195 | 0.60 | 0.6000 | 0.4833 | 0.0000 | none |
| gun | ship_drifter | 48 | 195 | 1.30 | 1.3000 | 2.6167 | 0.0000 | combat:collisionConsequence |
| gun | ship_atlas | 200 | 170 | 0.05 | 0.0500 | 0.4833 | 0.0000 | none |
| gun | ship_atlas | 200 | 170 | 0.15 | 0.1500 | 0.4833 | 0.0000 | none |
| gun | ship_atlas | 200 | 170 | 0.30 | 0.3000 | 0.4833 | 0.0000 | none |
| gun | ship_atlas | 200 | 170 | 0.60 | 0.6000 | 0.4833 | 0.0000 | none |
| gun | ship_atlas | 200 | 170 | 1.30 | 1.3000 | 3.8833 | 0.0000 | combat:collisionConsequence |
| rope_throw | ship_wasp | 16 | 210 | 0.05 | 0.0538 | 0.0000 | 0.0000 | none |
| rope_throw | ship_wasp | 16 | 210 | 0.15 | 0.1538 | 0.0000 | 0.0000 | none |
| rope_throw | ship_wasp | 16 | 210 | 0.30 | 0.3000 | 4.1333 | 5.9603 | massline:tumbled |
| rope_throw | ship_wasp | 16 | 210 | 0.60 | 0.6000 | 4.1333 | 5.9603 | massline:tumbled |
| rope_throw | ship_wasp | 16 | 210 | 1.30 | 1.3000 | 4.1333 | 5.9603 | massline:tumbled |
| rope_throw | ship_drifter | 48 | 195 | 0.05 | 0.0532 | 0.0000 | 0.0000 | none |
| rope_throw | ship_drifter | 48 | 195 | 0.15 | 0.1532 | 0.0000 | 0.0000 | none |
| rope_throw | ship_drifter | 48 | 195 | 0.30 | 0.3000 | 3.5000 | 4.4349 | massline:tumbled |
| rope_throw | ship_drifter | 48 | 195 | 0.60 | 0.6000 | 3.5000 | 4.4349 | massline:tumbled |
| rope_throw | ship_drifter | 48 | 195 | 1.30 | 1.3000 | 3.5000 | 4.4349 | massline:tumbled |
| rope_throw | ship_atlas | 200 | 170 | 0.05 | 0.0523 | 0.0000 | 0.0000 | none |
| rope_throw | ship_atlas | 200 | 170 | 0.15 | 0.1523 | 0.0000 | 0.0000 | none |
| rope_throw | ship_atlas | 200 | 170 | 0.30 | 0.3023 | 0.0000 | 0.0000 | none |
| rope_throw | ship_atlas | 200 | 170 | 0.60 | 0.6000 | 1.4833 | 0.8684 | massline:tumbled |
| rope_throw | ship_atlas | 200 | 170 | 1.30 | 1.3000 | 1.4833 | 0.8684 | massline:tumbled |
| well_fling | ship_wasp | 16 | 210 | 0.05 | 0.0538 | 0.0000 | 0.0000 | none |
| well_fling | ship_wasp | 16 | 210 | 0.15 | 0.1538 | 0.0000 | 0.0000 | none |
| well_fling | ship_wasp | 16 | 210 | 0.30 | 0.3038 | 0.0000 | 0.0000 | none |
| well_fling | ship_wasp | 16 | 210 | 0.60 | 0.6038 | 0.0000 | 0.0000 | none |
| well_fling | ship_wasp | 16 | 210 | 1.30 | 1.3038 | 1.3333 | 0.0000 | combat:collisionConsequence |
| well_fling | ship_drifter | 48 | 195 | 0.05 | 0.0532 | 0.0000 | 0.0000 | none |
| well_fling | ship_drifter | 48 | 195 | 0.15 | 0.1532 | 0.0000 | 0.0000 | none |
| well_fling | ship_drifter | 48 | 195 | 0.30 | 0.3032 | 0.0000 | 0.0000 | none |
| well_fling | ship_drifter | 48 | 195 | 0.60 | 0.6032 | 0.0000 | 0.0000 | none |
| well_fling | ship_drifter | 48 | 195 | 1.30 | 1.3032 | 1.4333 | 0.0000 | combat:collisionConsequence |
| well_fling | ship_atlas | 200 | 170 | 0.05 | 0.0523 | 0.0000 | 0.0000 | none |
| well_fling | ship_atlas | 200 | 170 | 0.15 | 0.1523 | 0.0000 | 0.0000 | none |
| well_fling | ship_atlas | 200 | 170 | 0.30 | 0.3023 | 0.0000 | 0.0000 | none |
| well_fling | ship_atlas | 200 | 170 | 0.60 | 0.6023 | 0.0000 | 0.0000 | none |
| well_fling | ship_atlas | 200 | 170 | 1.30 | 1.3023 | 3.9500 | 0.0000 | combat:collisionConsequence |
| collision | ship_wasp | 16 | 210 | 0.05 | 0.0394 | 1.5000 | 6.0000 | combat:collisionConsequence |
| collision | ship_wasp | 16 | 210 | 0.15 | 0.0699 | 1.5000 | 6.0000 | combat:collisionConsequence |
| collision | ship_wasp | 16 | 210 | 0.30 | 0.1316 | 1.5000 | 6.0000 | combat:collisionConsequence |
| collision | ship_wasp | 16 | 210 | 0.60 | 0.2359 | 1.7000 | 6.0000 | combat:collisionConsequence |
| collision | ship_wasp | 16 | 210 | 1.30 | 1.2744 | 1.5000 | 6.0000 | combat:collisionConsequence |
| collision | ship_drifter | 48 | 195 | 0.05 | 0.0111 | 1.5000 | 6.0000 | combat:collisionConsequence |
| collision | ship_drifter | 48 | 195 | 0.15 | 0.0511 | 1.5000 | 6.0000 | combat:collisionConsequence |
| collision | ship_drifter | 48 | 195 | 0.30 | 0.1471 | 1.5000 | 6.0000 | combat:collisionConsequence |
| collision | ship_drifter | 48 | 195 | 0.60 | 0.4311 | 1.5000 | 6.0000 | combat:collisionConsequence |
| collision | ship_drifter | 48 | 195 | 1.30 | 1.4708 | 3.9667 | 6.0000 | combat:collisionConsequence |
| collision | ship_atlas | 200 | 170 | 0.05 | 0.0487 | 1.5000 | 6.0000 | combat:collisionConsequence |
| collision | ship_atlas | 200 | 170 | 0.15 | 0.0475 | 1.5000 | 6.0000 | combat:collisionConsequence |
| collision | ship_atlas | 200 | 170 | 0.30 | 0.0136 | 1.5000 | 6.0000 | combat:collisionConsequence |
| collision | ship_atlas | 200 | 170 | 0.60 | 0.0353 | 1.5000 | 6.0000 | combat:collisionConsequence |
| collision | ship_atlas | 200 | 170 | 1.30 | 0.9558 | 1.5000 | 6.0000 | combat:collisionConsequence |

cells measured: 60/60
cruise field: data.derived.propulsion.combatSpeed
proof: {"backend":"rapier-dynamic","sg02Ready":true,"sg02Bodies":2,"sg02DynamicBodies":2,"rapierContacts":0,"contactCaptureEnabled":true,"featuresOutsideStep":{"tumble":false,"weaponImpulseConsequences":false},"physicsBackend":"rapier-dynamic","flightBackend":"v3","aiBackend":"sg06-tactical","profileId":"production"}
