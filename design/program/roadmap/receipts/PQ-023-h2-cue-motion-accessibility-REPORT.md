<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-023
leafId: PQ-023.h2-verdict
acceptance: focused_green
disposition: PASS
candidateCommit: f373e8a71cd314d236b9fb15dbe7944aa5e5d2b5
-->

# PQ-023 cue-motion and Cathedral-accessibility review

```yaml
packet: PQ-023
dispatchUnit: PQ-023.h2-verdict
reviewMode: solo-integrator-self-review
browserCandidateCommit: f373e8a71cd314d236b9fb15dbe7944aa5e5d2b5
electronHarnessCommit: e2bb01650d02530583d5238c6d58bb9dc064705b
reviewDisposition: PASS
cathedralAccessibilityDisposition: KEEP
ordinaryCapitalDenseDisposition: KEEP
impactDifferentiationDisposition: REVISE
smallDestructionDisposition: REVISE
performanceEvidenceClaimed: false
physicalControllerClaimed: false
```

## Split verdict

**KEEP the Cathedral damage/recovery language and accessibility projection.** Normal recovery and
damage communicate opposite states with explicit `Cathedral hull restored.` / `Cathedral hull
failed.` captions, noncolor `ring` / `bracket` shapes, and non-assertive / assertive urgency. Reduced
motion and flash replace the animated response with a steady `static_dim` fixture while preserving
the same caption text and state. The four transitions retain exact semantic parity in source Electron.

**KEEP ordinary/capital destruction, reduced-mode semantics, and dense-scene composition.** Ordinary
destruction has a readable hot ignition-to-ring lifecycle. Capital destruction is materially longer
and larger, with multiple ignition zones, travelling breakup, debris, and a broad final rupture. The
reduced sequence keeps the destructive state without rapid flash/motion. In the dense sequence the
target, source, connected beam, and HUD decision surfaces remain readable; the deterministic trace
keeps all `18/18` critical cues and accounts for every intentionally suppressed flavor cue.

**REVISE flak/autocannon differentiation.** The profile receipt names autocannon
`directional-fragments` and flak `proximity-burst`, but `src/render/vfx.js` contains no
`proximity-burst` switch branch. The flak profile therefore falls through the same default kinetic
incidence-gouge/fragment-fan path used by autocannon. Original-resolution temporal sheets agree with
the code: both impacts resolve as sparse, small orange/metal flecks at the ordinary camera and do not
separate at a glance. Different profile metadata is not different player-visible behavior.

**REVISE small destruction salience.** Its five-frame lifecycle is present and bounded, but most of
the ordinary-camera sequence is only a minute orange speck beside the ship. It does not yet read as a
complete small-body destruction event. The repair must strengthen the compact hot-core/asymmetric
fragment read without turning it into a scaled ordinary ring or weakening the ordinary/capital
hierarchy.

## Exact repair direction

Preserve event ownership, weapon mechanics, cue IDs, pool/capacity budgets, cleanup, reduced-mode
policy, critical-cue arbitration, ordinary/capital lifecycles, Cathedral cues, and accepted
Browser/Electron semantics. Add a real `proximity-burst` renderer branch whose outward fragment-cloud
silhouette and temporal spread remain distinct from the autocannon's tight directional incidence fan
at the normal camera. Increase the compact small-destruction hot core and asymmetric breakup enough
to land without borrowing the ordinary ring grammar.

Add seconds-scale regressions that fail when `proximity-burst` falls through the default branch and
when the small class loses its distinct compact lifecycle. Then capture only the changed autocannon,
flak, small-destruction, reduced, and dense representative cells in Browser and source Electron. A
causal review must pass before matched H3 performance is spent; the valid Cathedral continuation and
other weapon/destruction evidence are retained.

## Evidence reviewed

- the original 1440x900 combat reel and original-resolution impact, destruction, reduced, and dense
  contact sheets in `evidence/h1/row6-pq023-cues/`;
- the accepted 1440x900 Cathedral continuation reel, all 12 Browser frames, four Electron frames,
  Browser report, and semantic parity receipt;
- the deterministic dense-scene suppression trace;
- live `vfxProfiles.js` impact profiles and the corresponding `vfx.js` renderer dispatch.

No runtime, harness, headed evidence, or performance evidence was changed or rerun by this review.
