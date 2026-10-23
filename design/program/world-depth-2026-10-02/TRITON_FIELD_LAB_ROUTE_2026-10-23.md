<!-- LIFETIME: DURABLE -->
# Triton Field Lab: the readings reach a real route

## Outcome and scope

The existing Field Lab sensor mast now has a bounded research interaction at its authored position, rather than only a descriptor promising a verb. Its three separated scanner bearings produce the normal causal offer at Triton Wake Lab; the resulting neighboring signal can be classified, tracked and investigated through the existing scanner/mission/economy owners. Resolved lab aftermath survives Save/Continue and return.

Allocation: `CLAIM_TRITON_FIELD_LAB_2026-10-23.md`, committed at `f648e5704cd71e1eedbdef96652074394f192dac`. The increment changes `src/data/poiBehaviorFamilies.js`, `src/systems/livingPoiBehaviors.js`, the new focused test, this report and its unique package.json CI command registration. No new asset, physics body, globally registered zone, mission type, reward authority or Save authority was added. Guide, traffic, mining and npcJobsRuntime are untouched.

## Before and after

The canonical `poi_triton_field_lab` is a `place_sensor_mast` at local `(1600,-700)`. World placement composes that local position with the sector origin. Neither existing research zone contains the lab. Seed 4242 originally records an authored `triangulate` descriptor but plans only Wake Lab Approach and Wake Glow; three actual scanner pulses at the globally transformed lab bearings yield zero progress, offers or aftermath.

The correction adds one stable `authored:poi_triton_field_lab` interaction with radius 300 WU. It uses the unchanged anomaly-research family: three positions separated by at least 180 WU, ordinary causal offer, six-day aftermath. Generic Wake/Glow selection remains unchanged, including its own saved aftermath pin. Exact POI identity binds the readout; an unrelated coincident body cannot receive it. Explicit zone IDs, missing/nonfinite positions and out-of-footprint pulses cannot bypass distance validation.

Seed 4242 measured route: three lab bearings → `station_triton` offer → accepted mission → owner-created signal in `sector_veil_nebula`, record `poicr:sector_veil_nebula:1ku5z1c` → scanner classification stages 1 and 2 → tracked close investigation → one mission completion, one economy grant, 960-credit increase and 13 research points. These are the existing owners' results, not injected completion or payout events.

## Verification

- Nine focused regressions pass. The original seven fail against the public baseline; the added departure regression also failed against the first candidate before the review correction.
- Existing `living-poi-behaviors.test.mjs`: 22/22 pass.
- Existing `poi-causal-contracts.test.mjs`: 8/9 pass. Its settlement test observes a second `destroyed` tombstone after `investigated`; the same exact target and failure reproduce without either candidate file. This unrelated pre-existing failure remains open; it is not suppressed or relabeled passing.
- Actual Save owner `save('quick')` and `load('quick')` retain the accepted causal mission and resolved Field Lab. Leave/return and subsequent scans do not repost its offer. Existing owner serialization deliberately does not preserve incomplete bearing progress: a 1/3 scan returns to 0/3. This increment preserves and tests that limitation rather than adding another progress-save contract.
- Generic research and lab aftermath coexist after deserialize/replan; expiry at day six reopens the lab under existing policy.
- Focused source closure: 1,003 actually loaded public inputs, each hash-checked before the two explicit candidate overlays. The ordered path/blob receipt SHA256 is `826012451b6dce81c3ecd31491cf73b9099dba0dae01bf836a3580e978dea427`. Public 250b53-to-5e5b619 comparison changes only two runtime files, neither loaded here, plus documentation.

Source baseline: public master `5e5b619b57c53be410e90c7e5f21bbb2fd0127f5`; behavior blob `da0ab6e1fb423bcfba412f9f42377bdbb4ff7720`; family data blob `857536aebe3cbc3fe6abbedf358e58abcd9ed66d`.

## Independent-review correction

Review found that a retained lab plan could resolve after departure, before the next sector activation. The existing sector-exit listener now suspends only this authored row with a transient flag. Position selection and interaction also require the authoritative current sector, and reject a conflicting supplied sector ID. The existing enter-epoch guard runs before valid same-activation reentry clears suspension. Unrelated exits do not suspend the lab. The flag never enters readouts or serialized data, and deserialize/New Game rebuild without it. Two added regressions cover the transition gap, stale arrivals, wrong-sector pulses and transient reset; the actual Save and full causal route tests still pass. Generic retained-plan behavior is unchanged.

## Limits

This is owner/API gameplay evidence with accelerated player positions and sector-entry inputs, plus fixture entities for annotation identity. No native flight, rendered appearance, live-camera usability, phone, whole-game performance or whole-world native restoration acceptance is claimed. The existing sensor-mast asset and its placed identity were inspected in source; there is no new visual asset to review. Work is event-driven with one extra bounded plan/readout, not a new per-frame loop. Publication, integration and ordinary-flight acceptance remain separate gates. SF-LIVING-WORLD and SF-SECTOR-COHERENCE remain open.

## Integration and review

Root and independent review reran all nine focused cases and verified the exact stale-departure red probe now stays at zero progress. Independent review also checked the inclusive 300-WU footprint and 180-WU bearing boundaries. The new check:triton-field-lab-route command expands the actual CI command graph from 309 to 310, with every preceding entry preserved and the new entry classified. No aggregate was run locally. This is reviewed source and owner/API evidence; repository delivery and actual CI outcomes remain to be verified.
