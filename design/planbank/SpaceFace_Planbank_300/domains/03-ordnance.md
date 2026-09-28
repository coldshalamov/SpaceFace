# 03 — Weapons, drift bombs and force-field counterplay

**Current lane:** THE HAND / THE FIGHT  
**Build-map connections:** PQ-147, PQ-205; CV-AMMO, CR-CHAIN  
**15 proposed packets:** SF-031–SF-045

## Existing foundation, not a blank slate

There are already eight drift-bomb payloads, velocity inheritance and bounded active ordnance. Well/Repulsor/Cone use an existing field kernel; wind-up and decay already affect both force and presentation.

This is a source-informed working description, not a fresh gameplay acceptance claim. Read current source before treating any subfeature as missing. [Source provenance](../SOURCE_PROVENANCE.md) records scope and limitations.

## Domain contract

Extend the current bay, weapon and field owners rather than creating a second combat subsystem. Maintain owner/team provenance, seeded simulation, real forces and active caps. No damage aura disguised as machinery and no VFX-only force.

## Reusable implementation workflow

1. Read the payload definition and its complete arm/deploy/fuse/detonate/dispose path; reuse a payload where its law already covers the idea.
2. Write the proposed interaction in terms of body class, ownership, impulse/force, fuse and counter. Use simulation time and bounded queries.
3. Make chain events idempotent and propagate the original causal owner. Set caps and rejection behavior before adding presentation.
4. Expose ammunition, fuse or state through the existing bay/ORRERY surface only where a player decision needs it. Carry real phase timing into presentation and audio.
5. Test release while boosting, own/neutral/enemy bodies, simultaneous explosions, zero ammo, save/transition and pool reuse. Prove accounting once per payload.
6. Play at normal zoom with other effects enabled. A successful combination must be visibly attributable and a failed one must leave a readable reason and surviving counterplay.

## Ordinary-route proof

Equip through the ordinary acquisition route, deploy while moving, combine with one field and one tether interaction, then repeat against a civilian-containing encounter.

Choose one seed/route and compare it before and after; keep the scenario's meaningful variables fixed. Use both a competent intended action and a plausible mistake. Source or headless proof cannot establish visual, audio, feel or frame-pacing quality; inspect/listen/play the relevant route where tools permit, otherwise report that portion unproven.

## Authoritative INFERENCE depth bars

- [WF-05: Weapons Physics Tools And Modules](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-05_WEAPONS_PHYSICS_TOOLS_AND_MODULES.md)
- [WF-02: Enemy Roster And Encounters](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-02_ENEMY_ROSTER_AND_ENCOUNTERS.md)
- [WF-12: Vfx Camera Lighting And Visual Feel](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-12_VFX_CAMERA_LIGHTING_AND_VISUAL_FEEL.md)

Do not copy an entire workflow into a new instruction hierarchy. The selected packet resolves the creative direction; the live workflow still supplies the completeness bar. An existing compatible capability satisfies a dependency.

## Packets

- [SF-031 — Drift-bomb release that the pilot can predict](../plans/03-ordnance/SF-031-drift-bomb-release-that-the-pilot-can-predict.md) — deepening
- [SF-032 — Concussion demolition without hidden damage](../plans/03-ordnance/SF-032-concussion-demolition-without-hidden-damage.md) — deepening
- [SF-033 — A moving singularity that has a readable wake](../plans/03-ordnance/SF-033-a-moving-singularity-that-has-a-readable-wake.md) — deepening
- [SF-034 — Tarburst as temporary terrain rather than a stun button](../plans/03-ordnance/SF-034-tarburst-as-temporary-terrain-rather-than-a-stun-button.md) — deepening
- [SF-035 — EMP that reveals a recovery opportunity](../plans/03-ordnance/SF-035-emp-that-reveals-a-recovery-opportunity.md) — deepening
- [SF-036 — Thermite with a visible commitment cost](../plans/03-ordnance/SF-036-thermite-with-a-visible-commitment-cost.md) — deepening
- [SF-037 — Havoc that destabilizes without confiscating control](../plans/03-ordnance/SF-037-havoc-that-destabilizes-without-confiscating-control.md) — deepening
- [SF-038 — Ballast as a positional commitment](../plans/03-ordnance/SF-038-ballast-as-a-positional-commitment.md) — deepening
- [SF-039 — Field overlap with readable vector competition](../plans/03-ordnance/SF-039-field-overlap-with-readable-vector-competition.md) — deepening
- [SF-040 — Projectile bending with truthful ownership](../plans/03-ordnance/SF-040-projectile-bending-with-truthful-ownership.md) — deepening
- [SF-041 — A mine corridor with multiple solutions](../plans/03-ordnance/SF-041-a-mine-corridor-with-multiple-solutions.md) — deepening
- [SF-042 — Chain-reaction causality that survives simultaneous blasts](../plans/03-ordnance/SF-042-chain-reaction-causality-that-survives-simultaneous-blasts.md) — deepening
- [SF-043 — Ammunition decisions before an expedition](../plans/03-ordnance/SF-043-ammunition-decisions-before-an-expedition.md) — deepening
- [SF-044 — Enemy ordnance that teaches by mirroring](../plans/03-ordnance/SF-044-enemy-ordnance-that-teaches-by-mirroring.md) — deepening
- [SF-045 — An ordnance cleanup that leaves the fight intact](../plans/03-ordnance/SF-045-an-ordnance-cleanup-that-leaves-the-fight-intact.md) — deepening

## Owner reading map

- [`src/data/bombs.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/bombs.js)
- [`src/systems/bombs.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/bombs.js)
- [`src/systems/fields.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/fields.js)
- [`src/core/fields/fieldKernel.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/core/fields/fieldKernel.js)
- [`src/systems/weapons.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/weapons.js)
- [`src/render/bombPresentation.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/bombPresentation.js)
- [`src/data/fields.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/fields.js)
- [`src/systems/mines.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/mines.js)

[Return to index](../INDEX.md) · [Execution contract](../EXECUTION_CONTRACT.md)
