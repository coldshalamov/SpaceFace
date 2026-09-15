<!-- LIFETIME: PROGRAM (current implementation 2026-09-15) -->
# Drift-bomb ordnance — the bomb bay combat verb

The preliminary eight-payload implementation landed in `cda8dfd5331b845ab895312f81083edb78b42a87`.
Its original report is preserved in that commit. The current design, review, implementation laws,
acceptance evidence and exact work for continuing agents are in
**[ORDNANCE_BOMBS_REFINEMENT.md](./ORDNANCE_BOMBS_REFINEMENT.md)**.

## Current player route

- Release selected bomb: `dropBomb` — default 9 / D-pad right.
- Select next payload: `cycleBomb` — default comma / D-pad left.
- Commit armed ordnance: existing `chargeDetonate` — default R / D-pad down.

The existing power rail now has a live BAY socket: selection, real cooldown and deployed count.
All controls are rebindable. Original bombs retain hostile-only proximity triggers and time fuzes;
remote command adds agency without removing automatic operation. Blasts still have friendly fire.

## Current engineering contract

Full current-velocity inheritance, no throw speed; analytic drift at 0.14/s for intact capsules.
Bombs own their kinematics with `physicsBody:false`. A 0.5-second safe phase precedes arming. Fuzes
commit a short warning; its end is capped by the original hard deadline. Relative swept proximity
catches fast crossings and clips to the arming time. Six deployed objects per owner / 24 per world:
full bays refuse drops rather than deleting traps. Payloads recharge independently behind a shared
0.35-second release latch.

Eight IDs remain: frag, concussion, singularity, goo, EMP, thermite, scrambler and anchor. Goo now
physically brakes motion relative to its slowing cloud through queued impulses; sticky mass/DoT
still belongs to the status kernel. Singularity now genuinely weakens during its field life.
Havoc's shove now has a real tangential component at unchanged total impulse. Dynamic loose mass
can participate; static asteroids are not pretended to move. Stations receive eligible damage.

Damage uses the combat router; impulses use existing physics ports; accepted shoves feed the
existing hitstun/provenance law. Bombs do not duplicate chain priming. A single reusable target
snapshot serves all payloads. A bounded source-following geometry batch adds warning and field
readability alongside the retained procedural bodies and burst VFX.

Transient save policy: selection and cooldowns reset; active bombs/fields do not serialize.
Sector/save/new-game cleanup releases persistent field presentation without dealing collapse damage.

## Validation and remaining work

The focused 53-test suite passes, including actual Rapier plus combat-status goo braking. Both
unmodified 47a goldens and reload comparisons pass; the source-only baseline is 13/15 because it
lacks `@floating-ui/dom` and binary render packages. Full-route visual/audio/feel/performance
acceptance is **not** claimed. The refinement document contains the acceptance matrix and concrete
jobs for media polish, audio adoption, NPC mirror, shootable counterplay and economy propagation.
