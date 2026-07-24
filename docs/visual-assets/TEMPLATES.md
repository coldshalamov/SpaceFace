# Visual Asset Records

Store records beside an evidence packet tied to exact source/export/release hashes. YAML/JSON may
extend these shapes, but must preserve state, gate, reviewer, and candidate identity semantics.

## Asset brief

```yaml
schemaVersion: "1.0"
identity:
  assetId: REPLACE_ME
  familyId: ""
  role: REPLACE_ME_ROLE
  tier: B
  currentState: blockout
  targetState: accepted
  owner: ""
  sourcePaths: []
  generatorPaths: []
  releasePaths: []
  manifestPaths: []
  runtimeSelectorPaths: []
  activeLocksChecked: false
candidateIdentity:
  sourceHash: null
  exportHash: null
  releaseHash: null
playerFacingUse:
  normalRoutes: []
  simultaneousCount: { typical: null, worstRepresentative: null }
  supportedViews:
    - { name: gameplay_near, camera: "", projectedSizePx: [null, null], importance: primary }
  closeInspectionSupported: false
  marketingVisible: false
scaleAndInterfaces:
  units: metre
  dimensionsM: { length: null, height: null, width: null }
  forwardAxis: +X
  upAxis: +Y
  originAndPivot: ""
  sockets: []
  collisionRequirements: ""
  animationAndStateRequirements: []
artDirection:
  oneSentenceRead: ""
  roleSilhouette: ""
  familyLanguage: ""
  differentiators: []
  forbiddenReads: []
industrialDesign:
  primaryMasses: []
  negativeSpaces: []
  loadPaths: []
  thrustOrForcePaths: []
  accessAndService: []
  coolingAndHeat: []
  cargoToolWeaponOccupantLogic: []
  manufacturingProcesses: []
referenceBoard:
  boardPath: ""
  sources: { form: [], construction: [], materials: [], wearAndUse: [], scale: [], lighting: [] }
  provenanceComplete: false
modelingPlan:
  sourceStrategy: direct_to_game # high_low, sculpt_retopo, procedural_hybrid
  edgeRadiusFamilies: []
  topologyConstraints: []
uvAndBakePlan:
  uvStrategy: hybrid
  texelDensityPxPerM: { target: null, exceptions: [] }
  overlapAndMirroringPolicy: ""
  paddingPolicy: ""
  tangentConvention: MikkTSpace OpenGL
  cageStrategy: ""
  maps: { tangentNormal: true, ambientOcclusion: true, curvature: true, materialId: true }
  runtimePacking: R=AO,G=Roughness,B=Metallic
materialPlan:
  runtimeModel: glTF metallic-roughness
  roles:
    - name: primary_surface
      substrate: ""
      coatingOrFinish: ""
      roughnessBehavior: ""
      normalAndMicrostructure: ""
      wearAndContamination: ""
      decalsAndMarkings: ""
  transparencyStrategy: ""
  colorSpacePolicy: base/emissive sRGB; normal/ORM/masks non-color
lodAndOptimizationPlan:
  lods:
    - { id: LOD0, projectedSizePx: [null, null], visualPurpose: "", representation: "" }
    - { id: LOD1, projectedSizePx: [null, null], visualPurpose: "", representation: "" }
    - { id: LOD2, projectedSizePx: [null, null], visualPurpose: "", representation: "" }
  transitionStrategy: ""
  silhouetteAnchors: []
  instancingOrBatching: ""
performanceHypothesis:
  targetPlatform: ""
  representativeScene: ""
  baselineReport: ""
  provisionalEnvelope: {}
  notes: budgets are provisional until representative profiling
acceptance:
  requiredGates: [G0, G1, G2, G3, G4, G5, G6, G7]
  independentReviewRequired: true
  noP0P1: true
  exactReviewedHashRequired: true
assumptions: []
openDecisions: []
knownRisks: []
explicitExclusions: []
```

## Performance profile

Record exact platform/browser/Three revision/quality, route/scene/camera/resolution, visible counts,
warmup/sample/run count, and baseline/candidate:

- frame median/p95/p99/worst, CPU main-thread and GPU timing where available;
- `renderer.info` calls/triangles/points/lines/geometries/textures;
- GLB bytes, LOD triangles/exported vertices/primitives/draw estimates;
- material/texture/transparent primitive/node/bone/morph counts;
- texture source bytes and estimated GPU bytes;
- transfer, decode, first-visible, upload/stall notes;
- LOD switch projected size and transition evidence;
- visual premise preserved, headroom, deviations, reviewer/result.

The threshold source must name a baseline/profile decision, not a universal taste ceiling.

## Acceptance record

```json
{
  "schemaVersion": "1.0",
  "assetId": "REPLACE_ME",
  "tier": "B",
  "productionState": "integration_candidate",
  "candidate": {
    "sourceHash": "",
    "exportHash": "",
    "releaseHash": "",
    "repositoryCommit": ""
  },
  "technicalContractOk": false,
  "gates": {
    "G0": { "status": "pending", "evidence": [], "notes": "" },
    "G1": { "status": "pending", "evidence": [], "notes": "" },
    "G2": { "status": "pending", "evidence": [], "notes": "" },
    "G3": { "status": "pending", "evidence": [], "notes": "" },
    "G4": { "status": "pending", "evidence": [], "notes": "" },
    "G5": { "status": "pending", "evidence": [], "notes": "" },
    "G6": { "status": "pending", "evidence": [], "notes": "" },
    "G7": { "status": "pending", "evidence": [], "notes": "" }
  },
  "defects": [],
  "waivers": [],
  "performanceReport": "",
  "normalRouteEvidence": [],
  "visualAcceptance": {
    "status": "pending",
    "reviewer": "",
    "reviewedAt": null,
    "candidateHash": "",
    "evidencePacket": "",
    "decisionRationale": ""
  }
}
```

Gate status is `pending`, `pass`, `fail`, `not_applicable`, `blocked`, or specifically approved
`waived`. `accepted` requires `technicalContractOk: true`, G7 `pass`, no open P0/P1, exact candidate
identity, reviewer/date/evidence packet, and decision rationale.

## Review packet headings

- candidate identity and hashes;
- brief summary and supported cameras;
- baseline defects by severity/gate/region/evidence;
- substantive work tied to defects;
- form/orthographic/game-camera/family-lineup evidence;
- UV/checker/density/hard-edge/cage/map/bake evidence;
- material-role and varied-light/runtime evidence;
- LOD transition and representative profile;
- exact no-fallback runtime/behavior evidence;
- G0ΓÇôG7 result and rationale;
- P0/P1 blockers, P2, P3;
- provenance/tool versions/rebuild commands;
- independent `accept|reject|blocked` decision and next action.
