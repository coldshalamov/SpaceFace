# Cinder: earned delivery and docked law choices

## Status and source

This is an evidence report for an unpublished seven-file candidate over PR #939 head `91e2e1822be2b8b786284df84c3fa8f4a9432577` (parent tree `56aa960a0b5bdc42a343b9d5e5041540b7f88cb3`). At handoff the PR is open, draft and unmerged, its head is unchanged, and the repository owner has admin permission. This report does not authorize publication, merge or deployment.

The exact parent was reconstructed as an immutable-base overlay over `f95de0eb1ba7560839209936afba48c7b96fe41a`. Candidate work stayed in sparse overlays; the shared working tree was not edited. Local model work was not claimed. No denied path is included.

The six code/test files frozen for independent review are:

- `src/ui/station/lawFineDesk.js` (new)
- `src/ui/station/stationApp.js`
- `scripts/lib/simReadModel.mjs`
- `src/systems/lawSecurity.js`
- `test/law-fine-desk-mounted.test.mjs` (new)
- `test/law-fine-station-shell.test.mjs` (new)

This document is the seventh file. Reviewed overlay SHA-256: `62bf0df25d96d07fadedf9e009a73e1739b157cdde597358f9b5f13adecc5f55`. Reviewed changes SHA-256: `4d72789e72b67dad302b50fd61a55e10c370ecfd0f31cfebc5017cd691f7a721`. No executable source changed after that review.

## Diagnosis and repair

The previous WANTED delivery ended with a lawful patrol collision destroying the last original marked hull. Its terminal loss must remain a loss. A separate, naturally earned branch was available earlier at Tethys, before entering the Cinder field, with a small payable/workable fine and all three Cinder target slots still unissued and uncompleted.

The real obstacle was a missing docked law affordance. The existing flight prompt hides while docked; the production law owner rejects its choices after leaving the berth. Station statistics showed debt but provided no fine choices. Invoking the law engine directly was possible, but did not establish a player-accessible route.

The station shell now mounts a compact Law desk beside its persistent vitals. It presents Pay, Work, or Carry the warrant for the current offered fine and displays authoritative work progress. It sends the existing `law:fineChoice` intent. The read-model change mirrors only `lawSecurity.fineOffer`. Economy, heat, docking, patrol, towing, receiving brake, wreck provenance, and mission owners are unchanged.

Independent review exposed asynchronous correctness failures in the first version. A queued Pay could charge a replacement offer, and clearing heat before command consumption could leave the interface pending. The final widget binds new choices to cause, station, amount, wanted tier, and offer serial. The law owner checks that identity and the current applicable tariff at consumption, rejects stale answers, and acknowledges inapplicable choices. New serials advance beyond restored current serials. A replacement offer requires a fresh choice; legacy unbound adapter intents retain their existing behavior. Pending answers survive hide/show, unrelated credit events do not acknowledge them, and cleanup is idempotent. The law delta is three insertion hunks, 42 inserted lines, with the parent's original line endings preserved.

## Earned route and result

The starting saved slot came from the prior earned Furnace/Tethys run, not a fabricated completed Cinder fixture. It had the accepted Cinder contract, 1,223 credits, heat 0.2, two stolen commodity units, other outstanding obligations, and all three Cinder target slots still unissued and uncompleted.

The native production-runtime route used:

1. Real approach motion and a `resolveDockRange` berth assertion at Tethys; the mounted production Law desk's Work button and the real four-second law shift. This cleared the current fine, without a credit debit or erasing unrelated obligations.
2. Canonical jettison of the two stolen units into persistent pods, a real timed 432-credit refuel, then route/navigation intents through Vesta to Charon. Transit costs left 690 credits. A real collision left minor heat 0.012, below wanted status; bounty and debt stayed zero. All three Cinder slots remained live across Continue.
3. Native keyboard/mouse combat. Cinder One's original wreck was destroyed by traffic shortly after the player's kill. Cinder Two's original wreck survived at 1 HP; the third mark escaped. Those outcomes were not rewritten. The combat harness's `shots: 0` counter is invalid telemetry and is not a verified shot count.
4. A native pointer/F latch to Cinder Two's original wreck, marker `aft_18f0du9`, mass 16, and keyboard thrust/Brake towing. No hull, pose, velocity, cargo, credit, or mission grant was injected. The existing receiving brake actually ran for 2,004 ticks (about 33.4 simulated seconds). The tow was a long pendulum/southern approach, not a good handling demonstration: 24,000 ticks, 1,193.49 WU net post-latch displacement, 800 sampled positions, and a sampled peak hull speed of 23.86 WU/s.
5. A budget-end save just outside Rook's 100 WU receiving ring: original hull approximately `(9333.244, 28124.913)`, distance 101.491 WU, speed 1.830 WU/s, 1 HP. Production title Continue restored it; normal line restoration/release behavior let its existing momentum carry it into the ring. No late position or velocity correction was made.

On final reviewed source, the original crossed at `(9331.9076, 28129.3658)`, 99.942 WU from Rook's center, about 2.53 simulated seconds after the saved tick. The sale and contract payout are separate canonical events:

- One Rook sale, original marker `aft_18f0du9`, 16 mass, 25 credits.
- One completed Cinder receipt, `m_5:completed`, 700 contract credits, completion method `clear_and_tow`.
- Credits: 690 + 25 + 700 = 1,415. Rook deals: one; Quiet Line deals: zero.
- Production Save and title Continue preserve the receipt, balance and one sale. The original hull is absent and there is no second sale or duplicate payout.

An independent reviewer replayed the finish from the copied earned tow save on the final frozen overlay with mandatory 25 + 700 assertions. The result was structurally identical. This proves the native physics/economy/mission/save path; it is not a rendered browser playthrough.

## Other outcomes and final-source checks

- Final-source native Work: real production button action at the verified Tethys berth, four-second shift, credits remain 1,223, heat becomes zero; the current composed obligation remains paid after Continue. The separate 250-credit Ceres obligation remains open.
- Final-source native Pay: duplicate button clicks cause one 250-credit debit (1,223 to 973), heat clears, and the current composed obligation remains paid after Continue. The separate Ceres obligation remains open.
- Final-source Continue of the prior WANTED terminal-loss save, twice: original `aft_1pgx7p8` remains absent, zero sales, zero balance, zero contract reward. The loss does not become a new salvage opportunity.
- Early probes are retained, not counted as delivery proof: a corridor-mouth docking probe without a berth assertion, a controller that stopped on an already-cleared slot, and an exit route trapped against station geometry that let the remaining marks escape.
- Initial final-source Work/Pay checks incorrectly expected the transient paid offer to remain. Those oracle failures are retained. The corrected tests assert the canonical durable composed obligation; production intentionally retires the transient fine offer after heat clears.

## Validation and provenance boundaries

On the final frozen source:

- 187 aggregate tests pass: Cinder retention/departure/escape/report/intake, Rook market and receiving brake, campaign logs, runtime/clock checks, cone/field regressions, plus 11 new mounted/transport tests and one station-shell test.
- Independent fine-desk review reports 39 combined tests passed and separate stale-price, cleared-heat, hide/show, interrupted-work and same-price replacement checks. No remaining confirmed behavior blocker was found.
- Independent delivery review reran the final finish, 11 mounted tests and one station-shell test. It also verified the inherited and new quick-save checksums and exact-parent/source hash closures with zero mismatches.
- Scenario 47a, seed 47, 720 ticks, input tape `test/47a.inputs.json`, repeat 1, reload at 600: both exact parent and candidate report deterministic true, one reload, and identical result/baseline SHA-256 `ebbfe82a6bf1e87ac1912942751e661fe6cf4ba42e69a2ddce360c408385061b`.

The long route was performed across explicitly frozen source cohorts. Tethys departure used an earlier widget revision. Combat and tow used their recorded overlays; neither changed their physics, economy or mission source. The final guarded UI/owner revision was separately rerun for both law choices, preserved loss, and successful sale/contract/Continue. There was no single fresh full-route run on the final six-file revision. The manifest maps every observed import/read to its cohort's source bytes; earlier revisions are not relabeled as final.

The native harness calls production handlers and feeds native input events programmatically. It uses Node-safe rendering exclusions and a fake DOM. The station-shell test does call `createStationApp`, but its fake query selector manufactures nodes and uses fixed bounding boxes. These checks prove wiring, owner behavior, lifecycle and native simulation; they do not prove DOM parsing, visible geometry, pointer reachability, keyboard focus, contrast, audio, frame rate, or human playability. Browser acceptance remains blocked by unavailable browser infrastructure. An actual worker thread, whole New Game-to-Cinder rendered journey, and full CI remain unverified. `rendered: false` throughout.

## Evidence and reproduction

Scratch evidence root: `/workspace/shared/cinder-lawful-delivery/`. These are engineering artifacts in the current execution workspace, not public document links.

- `HANDOFF.md`, `manifest.json`, `paths.json`, `candidate.patch`, `source/`: exact candidate, source closure and patch application check.
- `native/tethys-lawful/slots.json` -> `native/clean-combat/slots.json` -> `native/clean-tow/slots.json` -> `native/final-finish-continue/result.json` and `slots.json`: earned route and payout chain.
- `native/final-law-work-verified/result.json`, `native/final-law-pay-canonical/result.json`, `native/continue-wanted-loss/result.json`: final-source alternate outcomes.
- `final-aggregate.log`, `reviewed-tests.log`, `final-sim.log`, `parent-sim.log`: final source checks.
- `*-overlay.json`, `*-audit-cohort.json`, `evidence/`: per-run executable-source snapshots and observed import/read hashes, including unsuccessful probes.
- `/workspace/shared/cinder-law-fine-ui/`: six-file source and focused review inputs.
- `/workspace/scratch/d2415e46e35b/cinder-independent-audit/`: independent final replay, mounted/shell logs and source audit.

Run from `/workspace/shared/SpaceFace` using the exact loader and filesystem hook, not the dirty working tree:

```sh
D=/workspace/shared/cinder-lawful-delivery
HELIOS_OVERLAY="$D/final-reviewed-overlay.json" HELIOS_RUN=final-aggregate \
  node --require "$D/exact-fs.cjs" --loader "$D/exact-loader.mjs" "$D/run-aggregate.mjs"
HELIOS_OVERLAY="$D/final-reviewed-overlay.json" HELIOS_RUN=final-sim \
  node --require "$D/exact-fs.cjs" --loader "$D/exact-loader.mjs" \
  scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 \
  --inputs test/47a.inputs.json --hash --repeat 1 --reload-at 600
```

The native replay scripts write saves/results to their embedded evidence destinations. Copy a script and change only its output destination, then add that script under its original virtual path to a copy of the matching overlay before rerunning. Do not overwrite the recorded evidence. Source hashes, not the mutable working tree, identify the tested candidate.
