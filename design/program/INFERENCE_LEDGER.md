<!-- LIFETIME: VOLATILE -->
# Inference ledger

**Two doors**

| Door | Who decides the unit | How |
|---|---|---|
| `NEXT` / PQ | Program already named it | `program-dispatch` |
| `INFERENCE` | **Agent invents it** after detecting a gap | detect → diagnose → implement → re-detect |

**INFERENCE is not PQ.** Do not wait for a human “concrete next unit.” The owner bottleneck is
exactly that. Run detection, find empty/cheap/samey structure in the shipped game data, improve it.

```bash
node scripts/inference-detect.mjs
# optional: node scripts/inference-detect.mjs --out=design/program/INFERENCE_DETECT_LAST.json
```

**After a finished unit:** +1 the surface; bump `refreshed`. Notes ≤6 words.

```yaml
refreshed: 2026-08-10
lastDetect: run inference-detect.mjs before choosing work
```

| Surface | Recent | Notes |
|---|---:|---|
| feel/combat constants | 5 | heavy recently |
| presentation juice | 4 | heavy recently |
| NPC jobs / living activity | 3 | Ceres cast |
| ship/part material craft | 2 | cathedral mid |
| enemy combat roles | 0 | detect often ranks high |
| economy / logistics | 0 | |
| stations / places | 1 | |
| weapons / physics tools | 0 | |
| story | 0 | |
| audio | 0 | |

**Anti-pile-on:** if Recent is already high for that surface, take the next detect gap instead.
