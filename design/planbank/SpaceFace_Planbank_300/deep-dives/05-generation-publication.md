# Resolved specification — current-generation authored publication

Companion to [SF-257 — Publish authored sector assets only for their current generation](../plans/18-performance/SF-257-publish-authored-sector-assets-only-for-their-current-generation.md).

## Failure boundary

A record being READY when an asynchronous job starts does not guarantee it is still current when the job commits. D61 describes this gap and a silent fallback concern. Read [presentationPublisher](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/presentationPublisher.js), [renderer](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/renderer.js), [assetResidency](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/assetResidency.js) and [authoredAdmissionPolicy](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/authoredAdmissionPolicy.js). Preserve their actual current contract rather than layering a second publisher over them.

## Selected semantic contract

At commit, verify the current route/generation, exact candidate identity and continued eligibility. A superseded result may be discarded without damaging the new generation. An intentionally withdrawn optional candidate may be discarded without pretending the current route failed. A required still-current candidate that cannot publish is a real current readiness failure and must reach the existing visible failure/retry path. Neither case justifies silent generic fallback.

The following is **proposed decision pseudocode**, not an existing API or new manager:

```text
when prepared work completes:
    if its owner/generation is no longer current:
        release only its unowned resources; do not publish
    else if this exact candidate was intentionally withdrawn:
        release only resources no current consumer needs
    else if required current candidate cannot commit:
        preserve last valid scene/residency; report through current owner
    else:
        publish the complete candidate through existing publisher
        rotate residency only under the current successful commit contract
```

The implementation should reuse the existing identity/token mechanisms and reason codes wherever possible. Do not infer currentness from matching labels or a stale boolean alone.

## Ownership and cleanup

Prepared resources can be shared with a current consumer; a losing candidate must not dispose those shared resources. Conversely, a stale job cannot remain retained forever because it was once READY. Distinguish prepared-resource ownership from scene-publication ownership. Keep reference/lifetime release in the existing package/residency owner and make it idempotent.

Do not rotate the current resident set before its replacement is valid. Do not show a partial authored body to avoid waiting. Do not catch and suppress a real current failure merely because cancellation is common. Avoid a new retry loop with no bound or route-awareness.

## Interleaving test matrix

Prepare generation A, request B, finish A then B: only B may publish. Prepare A, request B, finish B then A: A must not overwrite or dispose B. Withdraw an optional candidate while another remains required: the optional withdrawal must not fail the route. Fail a required current candidate: preserve the last valid scene and surface the genuine problem. Cancel during publication preparation: no partial scene attachment or leaked reservation. Restore context during pending work: old GPU readiness must not authorize a new-context commit.

Exercise repeated callbacks and same-named records with different identities. Assert the current published identity, resident ownership, required-candidate state and emitted user-visible result—not merely the boolean return of one helper.

## Ordinary-route acceptance

Use the current jump/Works route where the failure appears, including rapid replacement of an in-progress route. Confirm the required authored bodies appear, no obsolete scene flashes into view and no silent fallback replaces the real body. Record any nonreproduction honestly. The planning session did not reproduce D61; a correct isolated token test alone cannot establish the complete scene transition.
