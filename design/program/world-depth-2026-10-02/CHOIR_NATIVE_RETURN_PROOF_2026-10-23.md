<!-- LIFETIME: DURABLE -->
# Choir native service-return proof, 2026-10-23

Companion to PR528's reviewed source51e53f41e499ef2acd9c9a7755b25c57ffaf7b77. Run explicitly from repository root:

`node test/fixtures/choir-native-service-return.mjs`

The probe uses real selected npcJobsRuntime, flightV3, Rapier physics, combat, ships and economy owners, ordered by the production init/update manifests. Actual economy ticks drive the existing Choir producer. Mercy's already-completed evacuation is seeded so this probe targets runner recovery, not Mercy's rescue. The runner itself is spawned, approaches and is admitted through the real owner/job path; its approach finishes at117.683seconds with its job released.

Exactly one explicit native-body displacement moves that admitted living runner to2000units and clears velocity. All subsequent motion is autonomous. Existing job authority brings the same entity/world record back within the admission reach at200.167seconds; departure occurs at245.167seconds after45seconds of treatment. No departure is credited remotely. Another20seconds verifies one departure, unchanged successor schedule and one living original record. The fixture cleans up native authority, simulation and feature maps.

Author and root independently passed this portable fixture. Their runs overlap; this is one additional native acceptance probe, not two new cases. The original17new+10adjacent shipping test count and3review-only probes remain separate. Hash-qualified dependency audit covered852modules and loaded neither onboarding nor mainMenu; the unrelated upstream import fix does not substitute for a full current-master boot claim.

This closes the selected-owner native return-motion gap. It does not prove player-operated tether towing, native Save/Continue, visible presentation, complete production-world startup, or target-device performance. It introduces no production behavior or new asset. Existing PR report describes earlier pre-upstream-repair validation and remains historical evidence.
