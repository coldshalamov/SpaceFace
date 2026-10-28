<!-- LIFETIME: DURABLE -->
# CLOUD-02 · Arrive somewhere, not anywhere

**Existing parent:** 464; first-hour integration 454. **Disposition:** proposed bounded slice; reverify current code and claims before dispatch.
**Contract:** [cloud workflow](../07_CLOUD_EXECUTION.md). **Evidence:** [source ledger](../09_EVIDENCE.md).

## Player result and evidence

buildPostcard currently takes log[0].text from the global market-news log. It already computes
sector, faction, hazard and way-of-life fields. Make its optional news/context belong to the place
actually entered, and add one legitimate next-action sentence from known local information.

**Verified entry points / owner trace:** `src/ui/sectorPostcard.js; read-only sector/zone/station catalogs and marketNews records`.
Some consumer coverage remains a hypothesis until traced. If this exact result is already present,
return the source/route evidence; do not duplicate it or count an audit as implementation.

## Write boundary and refusals

Edit sectorPostcard.js and at most one pure formatter beside it; add one test file. Read catalogs,
news provenance and current mission/navigation state without changing them. Do not edit sector
population, world navigation, input bindings, shared HUD layouts or story progression.

## Implementation sequence

1. Inspect actual news record provenance; accept a sector match or a station whose verified parent
   is this sector. Do not infer locality from prose or faction alone.
2. Choose the freshest eligible local record using its actual simulation timestamp/sequence and
   existing retention rules. Missing provenance is not proof of locality; show no news if none fits.
3. Derive at most one next-action sentence: current objective here, a publicly known station service,
   or an already revealed local activity. Never expose an undiscovered position or auto-set a course.
4. Keep the existing nonblocking card and dismissal behavior. Only the existing news voice slot may
   speak; the next-action line does not create a second competing transient voice.
5. Use human names, not internal IDs. Update only on arrival/meaningful change, not a world scan.

## Regression and interruption cases

Newest global item belongs elsewhere; correct local item is older; unknown provenance; known
station in another sector; tied timestamps; no news; unknown sector; destroyed/closed destination;
active tutorial/critical comms; same-sector re-entry; malformed records; Continue. Verify deterministic
selection and no course/state mutation.

## Done when

On entry, the card cannot announce another sector's unrelated incident as local. A next-action
sentence is supported by known current state or omitted. No stale private coordinates, input
blocking, duplicate speech or layout obstruction. Existing postcard route and focused tests pass.

Finish with exact base/head, changed paths, actual commands/results, ordinary entry and remaining
acceptance. One focused test suite is not whole-game acceptance. Keep the broader parent open.

## Copy-ready agent prompt

> Implement CLOUD-02 in the existing sectorPostcard. Filter arrival news by actual locality and
> provenance, add one truthful known-local next-action sentence, and preserve nonblocking/one-voice
> behavior. Do not spawn content or modify navigation. Include empty, stale and wrong-sector tests
> and one existing-screen verification; publish a draft PR only.
