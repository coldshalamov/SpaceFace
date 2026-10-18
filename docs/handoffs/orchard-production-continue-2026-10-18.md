# Orchard production composition and Continue — 18 October 2026

The complete Node production composition reproduced a source-loss defect: the NPC-job persistence
sweep stripped the canonical Orchard frame's independent persistent mark. A normal save then omitted
the authored body, and Continue rebuilt its durable record as a generic wreck. The narrow fix retains
existing persistence for bodies passing the canonical Orchard frame/pod identity checks. It neither
repairs an already stripped save nor changes the job, finite-custody, native-readiness or save owners.

## Source and ownership

- Reviewed public source: `d622bd383795351de88b3f9ba0046b16b25ad00a` (PR456).
- Execution parent: `7d82f9a7b587ba903538ae4777d2d7f56df57f30`; its `src/`, existing `test/`,
  `package.json` and lockfile bytes equal that reviewed source before this unit's changes.
- A fresh fetch observed `origin/master` at `9a4cae84eb27a346349ca30ff61440c12328f4e2`.
  The five owned paths have no differences between that upstream tree and the reviewed public tree.
  Validation remains pinned to the requested PR source; no separate upstream commits or open PRs were
  absorbed. The packet records the complete source/test binding and local commit identity.
- Read-only current PR file inspection found no ownership collision on these five paths. PR447's
  save/physics/readiness files and shared status documents remain untouched. The four unrelated
  public/execution tree differences in `BASELINE.json` remain preserved.
- Owned files: [NPC persistence](../../src/systems/npcJobsRuntime.js),
  [owner regression](../../test/npc-jobs-orchard-persistence.test.mjs),
  [production Continue regression](../../test/anvil-orchard-production-continue.test.mjs),
  [existing-harness adapter](../../test/fixtures/production-continue-finalizer.mjs), and this handoff.
  Package scripts and dependency files were not changed.

## Reproduction and correction

The production manifest selected 203 initialization owners and 158 update owners, tactical AI and
Flight V3. Only the manifest's Node exclusions (`render`, `vfx`, `feel`, `audio`, `ui`) were omitted.
Full traffic, NPC jobs, world, fields, machinery, mining, cargo, Chronicler and save were present.
The earlier focused traffic-work substitute omitted the owner that caused this failure.

The preserved observer wrapped each actual update without changing its inputs. Frame 435 spawned
with `persistent: true`, radius 70 and its canonical compound. `npcJobsRuntime` removed that flag
during the first full production tick. The subsequent ordinary save omitted the body. Continue
destroyed frame 435 during restore and materialized record `anvil_storm_orchard:frame` as wreck 111,
radius 18, mass 50, hull 1, `collides: false`, without canonical Orchard identity or native compound.
The original owner trace, save bytes, first failing tests and corrected-adapter failures are retained.

`jobPersistenceAnchorReason` now recognizes the existing `isOrchardFrame`/`isOrchardPod` predicates.
No mark is stamped, body repaired or amount normalized. Labels, generic landmarks, wrong records,
wrong assets and malformed source bodies still take the existing cleanup path. A strict identity
with malformed mutable collars/amount keeps its data for the existing validation owner; retention
confers no native or finite authority. Independent read-only review found no correctness blockers.

## Actual Continue boundary

The new regression uses `createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true })`
and the normal `game:load` event with slot `quick`. Main's actual source-executed defer hook chooses
`save.load('quick', { preferAsync: true })`; save restoration and native adoption precede the actual
main finalizer. Main's actual loading, flight, failure and first-picture hold functions execute through
the same source-execution seam already used by the neighboring Continue tests. The fixture emits the
public load event directly; it does not exercise title-screen UI or an ordinary cold-title navigation
sequence.

The positive fixture is explicitly positioned: it enters `sector_tethys_junction`, relocates the
player to `{ x: 15700, z: 6500 }`, prepares the physics backend, then runs one setup tick before saving.
The Continue consumer is therefore native-prepared, and the test's submitted-frame increment is a
synthetic presentation-port substitution. It does not demonstrate ordinary player navigation to the
Orchard or a real rendered first picture.

The adapter applies the resolved feature maps as the shipping Node worker host does, so event
callbacks between simulation steps see the production flags. It restores the prior maps on teardown.
Memory storage, paint scheduling, authored-library/visual verdicts and the graphics verdict are
explicit test ports. The successful presentation receipt is a manually incremented submitted-frame
marker. There is no GPU picture, browser UI, Electron or worker-message transport proof.

Loading remains frozen until the controlled verdict resolves; finalization itself consumes no sim
ticks. Flight control stays held until the explicit presentation receipt. One bounded full production
tick then retains exactly one canonical persistent source, its native body and a current native motor
pose, unchanged finite ledger, and one cargo-empty mass-55 carrier per worker. A rejected graphics
verdict preserves its classified failure, returns to menu and never hands over flight control.

The recoverable positive fixture is a separate production-generated setup with valid Chronicler
schema 1 and an unworked finite source: one setup tick, restore, one post-Continue tick. It makes no
claim about earning, productive refill, thermal continuity across loads, navigation or acceptance.

## Results and original failures

Commands, immutable test/source bindings, timestamps and original output are in the Library packet.

| Command / scope | Result |
| --- | --- |
| `node --test --test-concurrency=1 test/npc-jobs-orchard-persistence.test.mjs test/anvil-orchard-production-continue.test.mjs` | 8/8 pass, exit 0 |
| Same final eight tests, read-only loader supplying the exact public pre-fix NPC file | 3 pass / 5 fail, exit 1; canonical retention and production native-frame assertions fail |
| Owned tests plus `npc-jobs-runtime-wiring`, `anvil-orchard-visual-admission-continue`, `worker-continue-finalizer`, `authoritative-manifest`, `runtime-profiles` | 82/85 pass, exit 1; three existing toast-count failures |
| The three failing `worker-continue-finalizer` cases on the public baseline | Same three failures, expected toast count 1, actual 0, exit 1 |
| `npm run check:sim:compare` | Pass, deterministic legacy 47a, 720 ticks, reload at 600, existing telemetry unchanged |
| `npm run check:sim:v3:compare` | Pass, deterministic V3 47a, same cap/reload, existing telemetry unchanged |

The existing failures occur at assertions in `worker-continue-finalizer.test.mjs` lines 115, 171 and
272. Neither those tests nor their main/UI/readiness owners were changed or weakened. The broader
suite is not reported as green. The separate positive-fixture witness initially failed only while
serializing the live manifest's cyclic module graph; its first script/log/save are preserved, followed
by a successful witness serializing the manifest IDs and metadata instead. No production change was
made for that observer failure.

## Preserved accepted endpoint and remaining gap

The accepted empty-return endpoint stays byte-for-byte unchanged: tick 62525, 1,240,955 bytes,
SHA256 `9a437cf487709ae7e2b69c6283989c3c56042409937fec49729cef83aa171335`.
No isolated route segment or tick was added. The prior immutable archive remains 6,000,885 bytes,
SHA256 `d243aa4af61c98eaeccf61ec2a6222ea83a3eba42d25e2e107350203a2a44f27`.

Trying that exact endpoint through the full production load reproduced
`Invalid Chronicler snapshot: unsupported schemaVersion`, region `chronicler`, before finalization
(`finalizerCalls: 0`). Its focused export contains `chronicler: {}` because that owner was omitted.
The accepted input was not rewritten and the strict Chronicler validator was not relaxed. The new
test also preserves this refusal. This NPC fix does not make that historical endpoint a valid
production Continue save. A production-authored checkpoint is required for the next integrated work
unit; silently inventing Chronicler memory for the accepted artifact is not supported evidence.

The prior accepted route evidence retains its precise limits: 55 payload hashes verified; 5,964
consecutive capped ticks; one two-unit pickup/closing; source 30 + retained 8 + delivered 10 = 48;
physical empty return. Heat was already above the exit threshold at collect entry, so zero whole
units were harvested. There was no productive revised-source refill and freeing capacity was not
proved to cause the return. Movement/B used the shipped seam with the disclosed target/component
handler substitute. Contacts comprised 152 samples over 66 ticks, minimum signed distance
−2.549 WU; unchanged hull in that focused host does not establish safe full-game navigation.

Parent-reported Market CI diagnostics at the reviewed source indicate BUY succeeded despite a
15-second wait timeout. They were steering only: no Market code, assertion, deadline or browser run
was changed here. This unit performs no GitHub write, push, merge, deployment, credential creation,
security change or laptop action. Source/asset geometry, headless runtime integration, rendered visual
review and ordinary-route acceptance remain distinct; only the stated runtime integration is proved.

Next executable review is the eight-test command above after applying only the packet's five public
payloads to the reviewed source. The existing finalizer toast failures and the historical export's
Chronicler incompatibility remain separately recorded, without consuming more route segments.
