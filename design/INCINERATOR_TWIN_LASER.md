# Incinerator Twin Laser — implementation and acceptance

Tier-4 medium spinal battery, available through Capital Weapons research in Adventure and the native Swarm armory from cleared wave 10 (compatible front-facing M/L slot required). 180 combined direct thermal DPS, 24 capacitor/s, 46 heat/s against 23 base dissipation, range 340 WU. Each aperture pays half the direct damage; cap/heat are charged once per fitted battery. Two batteries occupy four distinct stable nose lanes. No gimbal, projectile, attack-rate or artificial firing interval; capacitor exhaustion and normal venting still stop the hold.

Each beam resolves first physical skin and pylon interception through the existing combat sweep. Only material damage ignites exposed hull/armor. The existing burning status reaches three stacks and its expiry extends to 240 ticks after the last next-tick application; periodic clocks are not restarted. The status service coalesces duplicate first applications and extends active status without generating per-tick status receipts. Existing immunity, attribution, environmental heat and destruction policies remain authoritative.

Both simulation and presentation use separate generation-keyed beam identities. The post-combat receipt includes the clipped endpoint, source-local seat, contact class and (when available) target-local seat with occupant generation. The renderer uses the existing presented-pose fence to seat the two drawn apertures and moving contact points, not a shared generic socket. A miss retains parallel rays; clipped cover stays clipped. No simulation decision is made in VFX. The retained red HDR shader draws a steady hot filament and soft red halo, with a localized material-only hot tip. Existing bounded particle/sprite/light owners add molten contact fire, sparks and smoke. No repeated white full-power flash; reduced flash dims the retained beam and suppresses bright sparks. Existing status matter scales flame tongues and embers with stack count and follows actual hull pose.

## Acceptance
- Real fitting and late-wave shelf test; fixed forward geometry and multi-battery seats.
- Independent first-skin clipping, damage/cap accounting, shields, burn periodic clock and exact expiry.
- Worker event projection and two retained beam slots, accessibility and release.
- Native visual review: held beam, blocked ray, both rays on a moving target, release and burning flight, expiry, reduced-flash/motion and bloom-off. The isolated lab is visual evidence, not proof the whole game is stable.

Use the focused CI contract; do not weaken the unrelated failing master checks. Direct game playtesting and final artistic sign-off are still required.

## Reproducible visual review

The released-asset VFX lab includes **Incinerator Twin**, a deterministic two-ray receipt fixture using the production ray entry function, beam pool, fire-receipt consumer and status matter owner. It shows both rays feeding a living released Kestrel hull, then the victim retreating with hull-attached residual burning until expiry. It is an isolated visual fixture, not a full gameplay performance benchmark. Open `scripts/vfx-gameplay-demo.html` from the local dev server, or inspect the Living VFX review workflow's artifact (normal bloom and reduced-motion/flash, bloom disabled). The workflow runs the focused simulation/renderer contracts before attempting captures.
