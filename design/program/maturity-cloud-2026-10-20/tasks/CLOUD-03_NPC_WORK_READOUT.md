<!-- LIFETIME: DURABLE -->
# CLOUD-03 · Understand the worker before interfering

**Existing parent:** 477. **Disposition:** proposed bounded slice; reverify current code and claims before dispatch.
**Contract:** [cloud workflow](../07_CLOUD_EXECUTION.md). **Evidence:** [source ledger](../09_EVIDENCE.md).

## Player result and evidence

livingWorkStatusText already serves WORK/Hail; this is coverage and useful context, not a new
status system. Extend the projection for ordinary workers so the player can distinguish working,
waiting, returning, interrupted and unavailable, with the reason and next legitimate intervention.

**Verified entry points / owner trace:** `src/data/contactHail.js; src/ui/targetPanel.js; read-only npcJobs/npcJobsRuntime and stable world identity helpers`.
Some consumer coverage remains a hypothesis until traced. If this exact result is already present,
return the source/route evidence; do not duplicate it or count an audit as implementation.

## Write boundary and refusals

Own only the generic work-status mapper and its exact target/Hail consumption hunk, plus tests.
Do not edit job movement, worker manifests, route advancement, repair, custody, spawn quotas or
native arrival. Open worker PRs own specialized Orchard/Pallas/tender/salvor behavior.

## Implementation sequence

1. Inventory current phase/cue vocabulary from actual worker records and existing mapper. Preserve
   specialized cases already covered. Select three ordinary job families for the bounded extension.
2. Resolve actor life/job identity through existing helpers. A stale numeric ID, missing live owner
   or unobserved far actor yields “status unavailable”, never invented progress or a completed job.
3. At lock depth keep one short work phrase. At requested Hail depth add reason and destination or
   next action only when the source supplies them. Examples are semantics, not literal strings:
   waiting for escort; carrying a known load to a known buyer; disabled and repairable.
4. Gate any action wording on the existing interaction capability. Do not advertise Repair/Assist
   when the current actor cannot receive it. Do not label a planned delivery as delivered.
5. Preserve selected-target versus engaged-gun-target behavior. Avoid per-frame whole-world scans.

## Regression and interruption cases

All selected phases; missing job; foreign job; recycled entity/life; disabled worker; full receiver;
unknown destination; far/unresident actor; completed job; state transition while panel open;
selection differs from gun target; Continue remaps IDs. Specialized open-PR readouts remain intact.

## Done when

Following a working NPC, interrupting it and restoring its valid work produces a truthful changing
readout. Hail explains a real reason without commanding the NPC. Test production projections and
show one ordinary selected-target/Hail route; visual readability is assessed separately.

Finish with exact base/head, changed paths, actual commands/results, ordinary entry and remaining
acceptance. One focused test suite is not whole-game acceptance. Keep the broader parent open.

## Copy-ready agent prompt

> Implement CLOUD-03 by extending livingWorkStatusText and its existing consumers for three
> ordinary worker families. Preserve specialized worker PRs, stable identity and all job/cargo writers.
> Make interruption reasons useful but never invent state or permissions. Deliver tests and a draft PR,
> not a second NPC HUD or job controller.
