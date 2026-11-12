# Foundry: preserve the room between Anchor and Mooring Line

Research parent: PR #942 `95ec14201c59c008446c51bf908e011f48e9d422`.
No gameplay source changed in this pass.

## Creative decision

Keep round24's existing mass-gap room. The preceding21–23 act teaches alternating ship pressure and the Anchor's committed snare.24 should change the question from reading a hull to choosing physical space: light pursuers arrive as throwable mass, a chord of breakable monoliths closes one bearing, and a heavier hull enters behind that chord. The player can use either opening, circle the ends or spend impact to fracture another route.25 remains its boss;26–28 retain the existing Mooring Line act. Do not append another generic foreground score that silently disables this room.

The practical toolbox is already present: `src/data/swarmMode.js` owns `isSwarmMassGapWave`, fodder roles, delayed heavy and the Mooring Line recipes; `src/systems/survivalWavePlanner.js` composes the plan; `src/systems/swarmArena.js::_installMassGapWall` borrows ordinary breakable debris and searches alternate interior gap slots; `waveMaterialization.js` owns gate bearing and real ship admission. No new model is needed. Ordinary weapons remain valid; throw/fracture are opportunities, not invented hard requirements.

## New native coverage

Exact-parent module loader; original native materialization, no relocated rocks or generated substitute scenery. Eight staged round24 starts at seeds1,2,3,4,5,4242,73311,31337 produced36 live asteroid bodies each. Both selected gap-center discs (26WU clearance radius against ambient rock radii) were free in every case. This tests centers, not every route through a corridor or every possible seed. Each run starts fresh at24; it does not include accumulated debris from an earned campaign.

Two separate seed73311 trials then flew the ordinary starter energy hull using input lane key events toward each original gap with the production Rapier, flightV3 and tactical-AI runtime. Left gap3 reached beyond the chord at tick150; right gap6 at tick160. Hull remained140/140 in both. Both crossed the wall plane at tick133. The left crossing was3.22WU off the gap center; the right was35.38WU off center and emitted3 player impact events, so the latter is a grazing passage, not a clean centerline or collision-free route claim. The runs stayed in `wave_intro`: there were no live enemy threats and no evidence of successful combat, throwing, wear damage or round completion. Unchanged hull in intro must not be used to infer damage safety in an active round. This is physical level traversal, not an earned run or rendered playtest.

## Limitation that does not yet justify a source edit

The installer falls back to the planned gap if all its alternate same-side interior slots are blocked. That could misdescribe a dense accumulated room; it did not reproduce in these fresh native rooms. Do not move existing rocks, weaken collision or add a geometry rewrite merely to resolve a hypothetical. Inspect a real late-run field before deciding a bounded solution.

## Open outcomes

- **SF-GAME / SF-SECTOR-COHERENCE — open, creative direction owner:** Earn24 from the second exit, inspect the accumulated field, fly both routes under the actual late-heavy pressure, and perform a real throw/fracture opportunity. Next executable action: use a verified post23 native save or earn that state; none was created here.
- **SF-WORLD-DIRECTION — active:** Preserve the learning sequence21–28 above and the wider game scope; this note accepts neither combat pacing nor visual atmosphere.
- **SF-LIVING-WORLD — unchanged:** No Adventure or persistent world consequence was changed by this Swarm study.
- **SF-ASSETBANK / SF-ASSET-QUALITY — review only:** Existing monolith debris and enemy hulls supply this scene; no new asset request is justified yet. Composition, lighting, readability and authored model appearance remain visually unreviewed in this pass.

No merge, deployment, scheduling or permissions changed. User-dependent operations are unchanged from the parent handoff; this note creates no new approval request.
