// Shipment 47-A: a JSON-compatible SG-05 fixture. This module exports data only—no callbacks.

const L = Object.freeze({
  title: 'loc.scenario.47a.title',
  offerQuinn: 'loc.scenario.47a.offer.quinn',
  offerKessler: 'loc.scenario.47a.offer.kessler',
  mine: 'loc.scenario.47a.active.mine',
  deliver: 'loc.scenario.47a.active.deliver',
  mira: 'loc.scenario.47a.dialogue.mira_manifest',
  hale: 'loc.scenario.47a.dialogue.hale_inspection',
  rook: 'loc.scenario.47a.dialogue.rook_offer',
  elroyEncounter: 'loc.scenario.47a.active.elroy_encounter',
  elroyDialogue: 'loc.scenario.47a.dialogue.elroy',
  elroyAftermath: 'loc.scenario.47a.dialogue.elroy_aftermath',
  slate: 'loc.scenario.47a.dialogue.slate_shipyard',
  voss: 'loc.scenario.47a.dialogue.voss_claim',
  faction: 'loc.scenario.47a.dialogue.vale_routes',
  chainScn: 'loc.scenario.47a.active.chain_scn',
  chainMts: 'loc.scenario.47a.active.chain_mts',
  chainFree: 'loc.scenario.47a.active.chain_free',
  asset: 'loc.scenario.47a.active.asset_seed',
  ashfall: 'loc.scenario.47a.active.ashfall_arrival',
  quinnEcho: 'loc.scenario.47a.dialogue.quinn_echo',
  ledger: 'loc.scenario.47a.dialogue.ledger',
  endgame: 'loc.scenario.47a.complete.endgame',
  fail: 'loc.scenario.47a.fail',
  abandon: 'loc.scenario.47a.abandon',
  endingA: 'loc.scenario.47a.aftermath.clean_uniform',
  endingB: 'loc.scenario.47a.aftermath.same_silence',
  endingC: 'loc.scenario.47a.aftermath.only_honest',
  endingD: 'loc.scenario.47a.aftermath.ledger_continues',
  endingE: 'loc.scenario.47a.aftermath.next_run',
  accept: 'loc.scenario.47a.choice.accept',
  askKessler: 'loc.scenario.47a.choice.ask_kessler',
  returnQuinn: 'loc.scenario.47a.choice.return_quinn',
  decline: 'loc.scenario.47a.choice.decline',
  signManifest: 'loc.scenario.47a.choice.sign_manifest',
  challengeManifest: 'loc.scenario.47a.choice.challenge_manifest',
  submitInspection: 'loc.scenario.47a.choice.submit_inspection',
  payHale: 'loc.scenario.47a.choice.pay_hale',
  acceptRook: 'loc.scenario.47a.choice.accept_rook',
  refuseRook: 'loc.scenario.47a.choice.refuse_rook',
  hailElroy: 'loc.scenario.47a.choice.hail_elroy',
  returnTarget: 'loc.scenario.47a.choice.return_target',
  spareElroy: 'loc.scenario.47a.choice.spare_elroy',
  continue: 'loc.scenario.47a.choice.continue',
  inspectHull: 'loc.scenario.47a.choice.inspect_hull',
  fileClaim: 'loc.scenario.47a.choice.file_claim',
  exposeClaim: 'loc.scenario.47a.choice.expose_claim',
  routeScn: 'loc.scenario.47a.choice.route_scn',
  routeMts: 'loc.scenario.47a.choice.route_mts',
  routeFree: 'loc.scenario.47a.choice.route_free',
  openChannel: 'loc.scenario.47a.choice.open_channel',
  takeLedger: 'loc.scenario.47a.choice.take_ledger',
  leaveLedger: 'loc.scenario.47a.choice.leave_ledger',
  endingAChoice: 'loc.scenario.47a.choice.ending_a',
  endingBChoice: 'loc.scenario.47a.choice.ending_b',
  endingCChoice: 'loc.scenario.47a.choice.ending_c',
  endingDChoice: 'loc.scenario.47a.choice.ending_d',
  endingEChoice: 'loc.scenario.47a.choice.ending_e',
  declineA: 'loc.scenario.47a.choice.decline_a',
  declineB: 'loc.scenario.47a.choice.decline_b',
  declineC: 'loc.scenario.47a.choice.decline_c',
  declineD: 'loc.scenario.47a.choice.decline_d',
  actorWren: 'loc.actor.wren.name',
  actorQuinn: 'loc.actor.quinn.name',
  actorKessler: 'loc.actor.kessler.name',
  actorMira: 'loc.actor.mira.name',
  actorHale: 'loc.actor.hale.name',
  actorRook: 'loc.actor.rook.name',
  actorSlate: 'loc.actor.slate.name',
  actorVoss: 'loc.actor.voss.name',
  actorElroy: 'loc.actor.elroy.name',
  actorVale: 'loc.actor.director_vale.name',
});

const LORE = Object.freeze({
  shipment: 'lore.shipment.47a',
  ref44c: 'lore.regulation.ref_44c',
  valeHoldings: 'lore.organization.vale_holdings',
  ledger: 'lore.ashfall.personal_ledger',
  quinn: 'lore.actor.quinn',
  kessler: 'lore.actor.kessler',
  mira: 'lore.actor.mira',
  hale: 'lore.actor.hale',
  rook: 'lore.actor.rook',
  slate: 'lore.actor.slate',
  voss: 'lore.actor.voss',
  elroy: 'lore.actor.elroy',
  vale: 'lore.actor.director_vale',
});

const CUE = Object.freeze({
  offer: 'cue.scenario.47a.offer',
  weight: 'cue.scenario.47a.weight_variance',
  manifest: 'cue.scenario.47a.manifest_rewrite',
  civilian: 'cue.scenario.47a.civilian_tag',
  weld: 'cue.scenario.47a.weld_knows',
  branch: 'cue.scenario.47a.branch',
  pending: 'cue.scenario.47a.payment_pending',
  ashfall: 'cue.scenario.47a.ashfall_ledger',
  ending: 'cue.scenario.47a.ending',
});

export const SHIPMENT_47A = Object.freeze({
  id: 'scenario_shipment_47a',
  schemaVersion: 1,
  contentVersion: 2,
  titleLocalizationId: L.title,
  autoStart: true,
  entry: 'offer_quinn',
  abandonNode: 'abandon_47a',

  referenceManifest: {
    localization: Object.values(L),
    lore: Object.values(LORE),
    cues: Object.values(CUE),
    subsystems: ['combat', 'npc', 'economy', 'faction', 'ui', 'locations', 'missions', 'world'],
  },

  actors: {
    wren: { localizationId: L.actorWren, role: 'player' },
    quinn: { localizationId: L.actorQuinn, loreId: LORE.quinn, role: 'contact' },
    kessler: { localizationId: L.actorKessler, loreId: LORE.kessler, role: 'clerk' },
    mira: { localizationId: L.actorMira, loreId: LORE.mira, role: 'manifest_router' },
    hale: { localizationId: L.actorHale, loreId: LORE.hale, role: 'customs' },
    rook: { localizationId: L.actorRook, loreId: LORE.rook, role: 'bounty_broker' },
    slate: { localizationId: L.actorSlate, loreId: LORE.slate, role: 'shipwright' },
    voss: { localizationId: L.actorVoss, loreId: LORE.voss, role: 'claim_filer' },
    elroy: { localizationId: L.actorElroy, loreId: LORE.elroy, role: 'whistleblower' },
    vale: { localizationId: L.actorVale, loreId: LORE.vale, role: 'director' },
  },

  facts: {
    '47a.accepted': { default: false },
    '47a.delivered': { default: false },
    '47a.weight_variance': { default: false },
    '47a.manifest_signed': { default: false },
    '47a.manifest_disputed': { default: false },
    '47a.inspection_submitted': { default: false },
    '47a.bribe_paid': { default: false },
    '47a.rook_contract': { default: false },
    '47a.elroy_killed': { default: false },
    '47a.elroy_spared': { default: false },
    '47a.voss_claim_filed': { default: false },
    '47a.voss_duplicate_exposed': { default: false },
    '47a.route_scn': { default: false },
    '47a.route_mts': { default: false },
    '47a.route_free': { default: false },
    '47a.asset_deployed': { default: false },
    '47a.at_ashfall': { default: false },
    '47a.has_ledger': { default: false },
    '47a.full_load': { default: false },
    '47a.no_active_contracts': { default: false },
    '47a.contract_complete': { default: false },
    '47a.declined.A': { default: false },
    '47a.declined.B': { default: false },
    '47a.declined.C': { default: false },
    '47a.declined.D': { default: false },
    '47a.failed': { default: false },
    '47a.abandoned': { default: false },
    '47a.47b_pending': { default: false },
  },

  variables: {
    factionRoute: { default: null },
    manifestDisposition: { default: null },
    declinedEndings: { default: [] },
  },

  migrations: [
    {
      from: 1,
      to: 2,
      ops: [
        { type: 'renameFact', from: '47a.weight_checked', to: '47a.weight_variance' },
        { type: 'mapNode', from: 'b1_manifest', to: 'manifest_mira' },
        { type: 'setVarDefault', id: 'declinedEndings', value: [] },
      ],
    },
  ],

  requiredOutcomes: [
    'clean_uniform', 'same_silence', 'only_honest', 'ledger_continues', 'next_run',
    'failed', 'abandoned',
  ],

  branches: [
    {
      id: 'shipment_47a_lifecycle',
      entry: 'offer_quinn',
      requiredPhases: ['offer', 'active', 'fail', 'abandon', 'complete', 'aftermath'],
      requiredOutcomes: ['clean_uniform', 'same_silence', 'only_honest', 'ledger_continues', 'next_run'],
    },
  ],

  eventRules: [
    {
      id: 'remember_full_load', event: 'cargo:full', once: true,
      actions: [{ type: 'setFact', fact: '47a.full_load', value: true }],
    },
    {
      id: 'remember_no_contracts', event: 'mission:activeCount',
      when: { payload: 'count', op: 'eq', value: 0 },
      actions: [{ type: 'setFact', fact: '47a.no_active_contracts', value: true }],
    },
    {
      id: 'remember_active_contracts', event: 'mission:activeCount',
      when: { payload: 'count', op: 'gt', value: 0 },
      actions: [{ type: 'clearFact', fact: '47a.no_active_contracts' }],
    },
  ],

  interrupts: [
    {
      id: 'player_lost_during_contract', event: 'player:death', priority: 100, to: 'fail_47a',
      when: {
        all: [
          { fact: '47a.accepted' },
          { not: { fact: '47a.contract_complete' } },
        ],
      },
      actions: [{ type: 'setFact', fact: '47a.failed', value: true }],
    },
    {
      id: 'elroy_lost_unresolved', event: 'entity:destroyed', priority: 90, to: 'fail_47a',
      when: {
        all: [
          { actor: 'elroy', field: 'entityId', op: 'eq', valueFrom: { payload: 'id' } },
          { not: { fact: '47a.elroy_killed' } },
          { not: { fact: '47a.elroy_spared' } },
        ],
      },
      actions: [{ type: 'setFact', fact: '47a.failed', value: true }],
    },
  ],

  nodes: [
    {
      id: 'offer_quinn', phase: 'offer', kind: 'dialogue', localizationId: L.offerQuinn,
      dialogue: {
        speakerActorId: 'quinn', localizationId: L.offerQuinn,
        fallback: 'Shipment 47-A. Simple ore run. The manifest is heavier than the cargo; do not make that your problem.',
      },
      onEnter: [
        { type: 'bindActor', actorId: 'quinn', binding: { ref: 'npc.quinn', stationId: 'station_helios' } },
        { type: 'cue', cueId: CUE.offer },
        { type: 'discoverLore', loreId: LORE.shipment },
      ],
      choices: [
        { id: 'accept_direct', localizationId: L.accept, fallback: 'Take Shipment 47-A.', to: 'active_mine' },
        { id: 'ask_kessler', localizationId: L.askKessler, fallback: 'Ask who signed the weight sheet.', to: 'offer_kessler' },
        { id: 'decline_offer', localizationId: L.decline, fallback: 'Walk away.', to: 'abandon_47a' },
      ],
    },
    {
      id: 'offer_kessler', phase: 'offer', kind: 'dialogue', localizationId: L.offerKessler,
      dialogue: {
        speakerActorId: 'kessler', localizationId: L.offerKessler,
        fallback: 'The scale is correct. The variance is administrative. Administrative things are correct by definition.',
      },
      onEnter: [
        { type: 'bindActor', actorId: 'kessler', binding: { ref: 'npc.kessler', stationId: 'station_helios' } },
        { type: 'setFact', fact: '47a.weight_variance', value: true },
        { type: 'cue', cueId: CUE.weight },
        { type: 'discoverLore', loreId: LORE.kessler },
      ],
      choices: [
        { id: 'accept_after_kessler', localizationId: L.accept, fallback: 'Accept anyway.', to: 'active_mine' },
        { id: 'return_to_quinn', localizationId: L.returnQuinn, fallback: 'Return to Quinn.', to: 'offer_quinn' },
        { id: 'decline_after_kessler', localizationId: L.decline, fallback: 'Refuse the run.', to: 'abandon_47a' },
      ],
    },
    {
      id: 'active_mine', phase: 'active', kind: 'objective', localizationId: L.mine,
      onEnter: [
        { type: 'setFact', fact: '47a.accepted', value: true },
        { type: 'directorBeat', beatId: 'director.47a.mine', payload: { stationId: 'station_helios', commodityId: 'cmdty_silicate' } },
        { type: 'consequence', subsystem: 'missions', effect: 'contract_accepted', payload: { contractId: '47-A' } },
      ],
      objectives: [
        {
          id: 'mine_silicate', event: 'mining:yield', target: 10,
          amount: { payload: 'qty', default: 0 },
          where: { payload: 'commodityId', op: 'eq', value: 'cmdty_silicate' },
          to: 'active_delivery',
        },
      ],
      timers: [
        { id: 'mine_deadline', durationS: 900, to: 'fail_47a', actions: [{ type: 'setFact', fact: '47a.failed', value: true }] },
      ],
    },
    {
      id: 'active_delivery', phase: 'active', kind: 'objective', localizationId: L.deliver,
      onEnter: [
        { type: 'directorBeat', beatId: 'director.47a.delivery', payload: { stationId: 'station_helios' } },
      ],
      objectives: [
        {
          id: 'dock_with_shipment', event: 'dock:docked', target: 1,
          where: { payload: 'stationId', op: 'eq', value: 'station_helios' },
          completeFact: '47a.delivered',
          actions: [
            { type: 'setFact', fact: '47a.weight_variance', value: true },
            { type: 'consequence', subsystem: 'economy', effect: 'withhold_payment', payload: { contractId: '47-A', amountCr: 1200 } },
            { type: 'cue', cueId: CUE.manifest },
          ],
          to: 'manifest_mira',
        },
      ],
      timers: [
        { id: 'delivery_deadline', durationS: 600, to: 'fail_47a', actions: [{ type: 'setFact', fact: '47a.failed', value: true }] },
      ],
    },
    {
      id: 'manifest_mira', phase: 'active', kind: 'dialogue', localizationId: L.mira,
      dialogue: {
        speakerActorId: 'mira', localizationId: L.mira,
        fallback: 'Your cargo arrived as industrial surplus. It left as ore. The database prefers the version that pays no one.',
      },
      onEnter: [
        { type: 'bindActor', actorId: 'mira', binding: { ref: 'npc.mira', stationId: 'station_tethys' } },
        { type: 'discoverLore', loreId: LORE.mira },
      ],
      choices: [
        {
          id: 'sign_corrected_manifest', localizationId: L.signManifest, fallback: 'Sign the corrected manifest.', to: 'hale_inspection',
          actions: [
            { type: 'setFact', fact: '47a.manifest_signed', value: true },
            { type: 'setVar', var: 'manifestDisposition', value: 'signed' },
          ],
        },
        {
          id: 'challenge_manifest', localizationId: L.challengeManifest, fallback: 'Demand the original record.', to: 'hale_inspection',
          actions: [
            { type: 'setFact', fact: '47a.manifest_disputed', value: true },
            { type: 'setVar', var: 'manifestDisposition', value: 'disputed' },
            { type: 'discoverLore', loreId: LORE.ref44c },
          ],
        },
      ],
    },
    {
      id: 'hale_inspection', phase: 'active', kind: 'dialogue', localizationId: L.hale,
      dialogue: {
        speakerActorId: 'hale', localizationId: L.hale,
        fallback: 'REF 44-C says the record is sealed. It also says you owe a handling fee. It says many useful things.',
      },
      onEnter: [
        { type: 'bindActor', actorId: 'hale', binding: { ref: 'npc.hale', factionId: 'faction_scn', stationId: 'station_customs' } },
        { type: 'discoverLore', loreId: LORE.hale },
      ],
      choices: [
        {
          id: 'submit_to_inspection', localizationId: L.submitInspection, fallback: 'Submit the ship and keep the receipt.', to: 'rook_offer',
          actions: [
            { type: 'setFact', fact: '47a.inspection_submitted', value: true },
            { type: 'consequence', subsystem: 'faction', effect: 'rep_delta', payload: { factionId: 'faction_scn', delta: 2, reason: '47a_compliance' } },
          ],
        },
        {
          id: 'pay_hale', localizationId: L.payHale, fallback: 'Pay the fee that is not a bribe.', to: 'rook_offer',
          actions: [
            { type: 'setFact', fact: '47a.bribe_paid', value: true },
            { type: 'consequence', subsystem: 'economy', effect: 'charge_credits', payload: { amountCr: 180, reason: '47a_ref44c' } },
          ],
        },
      ],
    },
    {
      id: 'rook_offer', phase: 'active', kind: 'dialogue', localizationId: L.rook,
      dialogue: {
        speakerActorId: 'rook', localizationId: L.rook,
        fallback: 'One target, two invoices. Concord calls him hostile. The medics call him late.',
      },
      onEnter: [
        { type: 'bindActor', actorId: 'rook', binding: { ref: 'npc.rook', stationId: 'station_tethys' } },
        { type: 'discoverLore', loreId: LORE.rook },
      ],
      choices: [
        {
          id: 'accept_rook_contract', localizationId: L.acceptRook, fallback: 'Take the target packet.', to: 'elroy_encounter',
          actions: [{ type: 'setFact', fact: '47a.rook_contract', value: true }],
        },
        {
          id: 'refuse_rook_contract', localizationId: L.refuseRook, fallback: 'Refuse the invoice; keep the coordinates.', to: 'elroy_encounter',
          actions: [{ type: 'clearFact', fact: '47a.rook_contract' }],
        },
      ],
    },
    {
      id: 'elroy_encounter', phase: 'active', kind: 'encounter', localizationId: L.elroyEncounter,
      onEnter: [
        {
          type: 'spawn', actorId: 'elroy',
          spec: {
            type: 'ship', team: 0, factionId: 'faction_free', pos: { x: 480, z: -120 },
            hull: 55, hullMax: 55, shield: 10, shieldMax: 10,
            data: { scenarioActorId: 'elroy', defId: 'ship_kestrel', nonHostileUntilProvoked: true },
          },
        },
        { type: 'directorBeat', beatId: 'director.47a.elroy', payload: { cueId: 'cue.scenario.47a.civilian_tag' } },
        { type: 'cue', cueId: CUE.civilian },
      ],
      objectives: [
        {
          id: 'resolve_elroy_by_force', event: 'entity:killed', actorId: 'elroy', payloadField: 'id', target: 1,
          actions: [
            { type: 'setFact', fact: '47a.elroy_killed', value: true },
            { type: 'discoverLore', loreId: LORE.elroy },
            { type: 'unbindActor', actorId: 'elroy' },
          ],
          to: 'elroy_aftermath',
        },
      ],
      choices: [
        { id: 'hail_elroy', localizationId: L.hailElroy, fallback: 'Open a channel before firing.', to: 'elroy_dialogue' },
      ],
    },
    {
      id: 'elroy_dialogue', phase: 'active', kind: 'dialogue', localizationId: L.elroyDialogue,
      dialogue: {
        speakerActorId: 'elroy', localizationId: L.elroyDialogue,
        fallback: 'I repaired the recycler allocation. Vale moved the catalyst under 47-A. The medicine was only ballast on paper.',
      },
      choices: [
        { id: 'return_to_target', localizationId: L.returnTarget, fallback: 'Close the channel and resume the contract.', to: 'elroy_encounter' },
        {
          id: 'spare_elroy', localizationId: L.spareElroy, fallback: 'Transmit a false kill code and let him run.', to: 'slate_shipyard',
          actions: [
            { type: 'setFact', fact: '47a.elroy_spared', value: true },
            { type: 'despawn', actorId: 'elroy', reason: 'spared' },
            { type: 'discoverLore', loreId: LORE.elroy },
            { type: 'consequence', subsystem: 'faction', effect: 'rep_delta', payload: { factionId: 'faction_free', delta: 6, reason: '47a_spared_elroy' } },
          ],
        },
      ],
    },
    {
      id: 'elroy_aftermath', phase: 'active', kind: 'dialogue', localizationId: L.elroyAftermath,
      dialogue: {
        speakerActorId: 'rook', localizationId: L.elroyAftermath,
        fallback: 'Payment cleared twice. One line says threat neutralized. The other says civilian vessel—registered. Then it disappears.',
      },
      choices: [
        { id: 'continue_after_elroy', localizationId: L.continue, fallback: 'Keep both receipts.', to: 'slate_shipyard' },
      ],
    },
    {
      id: 'slate_shipyard', phase: 'active', kind: 'dialogue', localizationId: L.slate,
      dialogue: {
        speakerActorId: 'slate', localizationId: L.slate,
        fallback: 'That seam was cut twice. The hull remembers even when the registry does not.',
      },
      onEnter: [
        { type: 'bindActor', actorId: 'slate', binding: { ref: 'npc.slate', stationId: 'station_forge' } },
        { type: 'bindActor', actorId: 'kessler', binding: { ref: 'npc.kessler', stationId: 'station_forge' } },
        { type: 'cue', cueId: CUE.weld },
        { type: 'discoverLore', loreId: LORE.slate },
      ],
      choices: [
        { id: 'inspect_variance_hull', localizationId: L.inspectHull, fallback: 'Inspect the hull named VARIANCE ADJUSTMENT.', to: 'voss_claim' },
      ],
    },
    {
      id: 'voss_claim', phase: 'active', kind: 'dialogue', localizationId: L.voss,
      dialogue: {
        speakerActorId: 'voss', localizationId: L.voss,
        fallback: 'The claim was mine. Then a second crew filed the same coordinates in the same minute. Both stamps are valid.',
      },
      onEnter: [
        { type: 'bindActor', actorId: 'voss', binding: { ref: 'npc.voss', stationId: 'station_ceres', factionId: 'faction_dmc' } },
        { type: 'discoverLore', loreId: LORE.voss },
      ],
      choices: [
        {
          id: 'file_voss_claim', localizationId: L.fileClaim, fallback: 'File Voss as the original claimant.', to: 'faction_choice',
          actions: [{ type: 'setFact', fact: '47a.voss_claim_filed', value: true }],
        },
        {
          id: 'expose_duplicate_claim', localizationId: L.exposeClaim, fallback: 'Publish both timestamps.', to: 'faction_choice',
          actions: [
            { type: 'setFact', fact: '47a.voss_duplicate_exposed', value: true },
            { type: 'consequence', subsystem: 'economy', effect: 'market_intel', payload: { stationId: 'station_ceres', tag: 'duplicate_claims' } },
          ],
        },
      ],
    },
    {
      id: 'faction_choice', phase: 'active', kind: 'dialogue', localizationId: L.faction,
      dialogue: {
        speakerActorId: 'vale', localizationId: L.faction,
        fallback: 'Three contracts. Three letterheads. One authorization field: V. DIRECTOR, ACTING.',
      },
      onEnter: [
        { type: 'bindActor', actorId: 'vale', binding: { ref: 'npc.director_vale', factionId: 'faction_scn' } },
        { type: 'cue', cueId: CUE.branch },
        { type: 'discoverLore', loreId: LORE.vale },
      ],
      choices: [
        {
          id: 'choose_scn_route', localizationId: L.routeScn, fallback: 'Take the Concord patrol packet.', to: 'faction_chain_scn',
          actions: [
            { type: 'setFact', fact: '47a.route_scn', value: true },
            { type: 'setVar', var: 'factionRoute', value: 'scn' },
            { type: 'consequence', subsystem: 'faction', effect: 'select_route', payload: { factionId: 'faction_scn' } },
          ],
        },
        {
          id: 'choose_mts_route', localizationId: L.routeMts, fallback: 'Take the Meridian freight packet.', to: 'faction_chain_mts',
          actions: [
            { type: 'setFact', fact: '47a.route_mts', value: true },
            { type: 'setVar', var: 'factionRoute', value: 'mts' },
            { type: 'consequence', subsystem: 'faction', effect: 'select_route', payload: { factionId: 'faction_mts' } },
          ],
        },
        {
          id: 'choose_free_route', localizationId: L.routeFree, fallback: 'Take the Free Frontier covert packet.', to: 'faction_chain_free',
          actions: [
            { type: 'setFact', fact: '47a.route_free', value: true },
            { type: 'setVar', var: 'factionRoute', value: 'free' },
            { type: 'consequence', subsystem: 'faction', effect: 'select_route', payload: { factionId: 'faction_free' } },
          ],
        },
      ],
    },
    {
      id: 'faction_chain_scn', phase: 'active', kind: 'objective', localizationId: L.chainScn,
      objectives: [
        {
          id: 'complete_patrol_chain', event: 'mission:completed', target: 2,
          where: { payload: 'type', op: 'eq', value: 'patrol_clear' },
          to: 'asset_seed',
        },
      ],
    },
    {
      id: 'faction_chain_mts', phase: 'active', kind: 'objective', localizationId: L.chainMts,
      objectives: [
        {
          id: 'complete_trade_chain', event: 'mission:completed', target: 3,
          where: { payload: 'type', op: 'eq', value: 'bulk_trade' },
          actions: [{ type: 'discoverLore', loreId: LORE.valeHoldings }],
          to: 'asset_seed',
        },
      ],
    },
    {
      id: 'faction_chain_free', phase: 'active', kind: 'objective', localizationId: L.chainFree,
      interrupts: [
        {
          id: 'free_route_busted', event: 'player:scannedByPatrol', priority: 110, to: 'fail_47a',
          when: { payload: 'hasContraband', op: 'eq', value: true },
          actions: [{ type: 'setFact', fact: '47a.failed', value: true }],
        },
      ],
      objectives: [
        {
          id: 'complete_covert_chain', event: 'mission:completed', target: 2,
          where: { payload: 'type', op: 'eq', value: 'smuggling_run' },
          to: 'asset_seed',
        },
      ],
    },
    {
      id: 'asset_seed', phase: 'active', kind: 'objective', localizationId: L.asset,
      onEnter: [
        { type: 'cue', cueId: CUE.pending },
        { type: 'directorBeat', beatId: 'director.47a.asset', payload: { owner: 'VALE HOLDINGS LLC' } },
      ],
      objectives: [
        {
          id: 'deploy_first_asset', event: 'asset:deployed', target: 1,
          completeFact: '47a.asset_deployed',
          actions: [{ type: 'discoverLore', loreId: LORE.valeHoldings }],
          to: 'ashfall_arrival',
        },
      ],
    },
    {
      id: 'ashfall_arrival', phase: 'active', kind: 'objective', localizationId: L.ashfall,
      objectives: [
        {
          id: 'reach_ashfall', event: 'sector:enter', target: 1,
          where: { payload: 'sectorId', op: 'eq', value: 'sector_ashfall_reach' },
          completeFact: '47a.at_ashfall',
          actions: [
            { type: 'cue', cueId: CUE.ashfall },
            { type: 'directorBeat', beatId: 'director.47a.ashfall', payload: { sectorId: 'sector_ashfall_reach', stationId: 'station_ashcache' } },
          ],
          to: 'quinn_echo',
        },
      ],
    },
    {
      id: 'quinn_echo', phase: 'active', kind: 'dialogue', localizationId: L.quinnEcho,
      dialogue: {
        speakerActorId: 'quinn', localizationId: L.quinnEcho,
        fallback: 'You made it to the place nobody routes to. Funny thing: your first manifest was filed from here.',
      },
      choices: [
        { id: 'open_ashfall_channel', localizationId: L.openChannel, fallback: 'Open the station channel.', to: 'ledger_choice' },
      ],
    },
    {
      id: 'ledger_choice', phase: 'active', kind: 'dialogue', localizationId: L.ledger,
      dialogue: {
        speakerActorId: 'vale', localizationId: L.ledger,
        fallback: 'Your callsign appears under COUNTERPARTY six weeks before launch. The ledger is not predicting you. It is scheduling you.',
      },
      choices: [
        {
          id: 'take_ledger', localizationId: L.takeLedger, fallback: 'Take the personal ledger.', to: 'endgame_hub',
          actions: [
            { type: 'setFact', fact: '47a.has_ledger', value: true },
            { type: 'discoverLore', loreId: LORE.ledger },
          ],
        },
        {
          id: 'leave_ledger', localizationId: L.leaveLedger, fallback: 'Leave the ledger on the desk.', to: 'endgame_hub',
          actions: [{ type: 'clearFact', fact: '47a.has_ledger' }],
        },
      ],
    },
    {
      id: 'endgame_hub', phase: 'complete', kind: 'dialogue', localizationId: L.endgame,
      dialogue: {
        speakerActorId: 'vale', localizationId: L.endgame,
        fallback: 'Shipment 47-A is complete in every column except payment. Choose what the ledger calls that.',
      },
      onEnter: [
        { type: 'setFact', fact: '47a.contract_complete', value: true },
        { type: 'consequence', once: '47a_contract_complete_intent', subsystem: 'missions', effect: 'contract_complete', payload: { contractId: '47-A', paymentStatus: 'pending' } },
      ],
      choices: [
        {
          id: 'accept_ending_a', localizationId: L.endingAChoice, fallback: 'A — The Clean Uniform.', to: 'aftermath_clean_uniform',
          when: { not: { fact: '47a.declined.A' } },
          actions: [{ type: 'recordOutcome', outcome: 'clean_uniform' }],
        },
        {
          id: 'accept_ending_b', localizationId: L.endingBChoice, fallback: 'B — The Same Silence.', to: 'aftermath_same_silence',
          when: { not: { fact: '47a.declined.B' } },
          actions: [{ type: 'recordOutcome', outcome: 'same_silence' }],
        },
        {
          id: 'accept_ending_c', localizationId: L.endingCChoice, fallback: 'C — The Only Honest Option.', to: 'aftermath_only_honest',
          when: {
            all: [
              { not: { fact: '47a.declined.C' } },
              { fact: '47a.full_load' },
              { fact: '47a.no_active_contracts' },
            ],
          },
          actions: [{ type: 'recordOutcome', outcome: 'only_honest' }],
        },
        {
          id: 'accept_ending_d', localizationId: L.endingDChoice, fallback: 'D — The Ledger Continues.', to: 'aftermath_ledger_continues',
          when: {
            all: [
              { not: { fact: '47a.declined.D' } },
              { fact: '47a.has_ledger' },
            ],
          },
          actions: [{ type: 'recordOutcome', outcome: 'ledger_continues' }],
        },
        {
          id: 'accept_ending_e', localizationId: L.endingEChoice, fallback: 'E — The Next Run.', to: 'aftermath_next_run',
          when: {
            all: [
              { fact: '47a.declined.A' },
              { fact: '47a.declined.B' },
              { fact: '47a.declined.C' },
              { fact: '47a.declined.D' },
            ],
          },
          actions: [
            { type: 'recordOutcome', outcome: 'next_run' },
            { type: 'setFact', fact: '47a.47b_pending', value: true },
          ],
        },
        {
          id: 'decline_ending_a', localizationId: L.declineA, fallback: 'Decline A.', to: 'endgame_hub',
          when: { not: { fact: '47a.declined.A' } },
          actions: [
            { type: 'setFact', fact: '47a.declined.A', value: true },
            { type: 'appendVar', var: 'declinedEndings', value: 'A', unique: true },
          ],
        },
        {
          id: 'decline_ending_b', localizationId: L.declineB, fallback: 'Decline B.', to: 'endgame_hub',
          when: { not: { fact: '47a.declined.B' } },
          actions: [
            { type: 'setFact', fact: '47a.declined.B', value: true },
            { type: 'appendVar', var: 'declinedEndings', value: 'B', unique: true },
          ],
        },
        {
          id: 'decline_ending_c', localizationId: L.declineC, fallback: 'Decline C.', to: 'endgame_hub',
          when: { not: { fact: '47a.declined.C' } },
          actions: [
            { type: 'setFact', fact: '47a.declined.C', value: true },
            { type: 'appendVar', var: 'declinedEndings', value: 'C', unique: true },
          ],
        },
        {
          id: 'decline_ending_d', localizationId: L.declineD, fallback: 'Decline D.', to: 'endgame_hub',
          when: { not: { fact: '47a.declined.D' } },
          actions: [
            { type: 'setFact', fact: '47a.declined.D', value: true },
            { type: 'appendVar', var: 'declinedEndings', value: 'D', unique: true },
          ],
        },
      ],
    },
    {
      id: 'fail_47a', phase: 'fail', kind: 'terminal', terminal: true, outcome: 'failed', localizationId: L.fail,
      onEnter: [
        { type: 'setFact', fact: '47a.failed', value: true },
        { type: 'consequence', subsystem: 'faction', effect: 'rep_delta', payload: { factionId: 'faction_scn', delta: -4, reason: '47a_failed' } },
        { type: 'consequence', subsystem: 'missions', effect: 'contract_failed', payload: { contractId: '47-A' } },
      ],
    },
    {
      id: 'abandon_47a', phase: 'abandon', kind: 'terminal', terminal: true, outcome: 'abandoned', localizationId: L.abandon,
      onEnter: [
        { type: 'setFact', fact: '47a.abandoned', value: true },
        { type: 'consequence', subsystem: 'missions', effect: 'contract_abandoned', payload: { contractId: '47-A' } },
      ],
    },
    {
      id: 'aftermath_clean_uniform', phase: 'aftermath', kind: 'terminal', terminal: true, outcome: 'clean_uniform', localizationId: L.endingA,
      onEnter: [
        { type: 'cue', cueId: CUE.ending, payload: { outcome: 'clean_uniform' } },
        { type: 'consequence', subsystem: 'faction', effect: 'appointment', payload: { factionId: 'faction_scn', rep: 700 } },
        { type: 'consequence', subsystem: 'ui', effect: 'stabilize_identification', payload: { accurate: true } },
      ],
    },
    {
      id: 'aftermath_same_silence', phase: 'aftermath', kind: 'terminal', terminal: true, outcome: 'same_silence', localizationId: L.endingB,
      onEnter: [
        { type: 'cue', cueId: CUE.ending, payload: { outcome: 'same_silence' } },
        { type: 'consequence', subsystem: 'economy', effect: 'routing_income', payload: { factionId: 'faction_quiet' } },
        { type: 'consequence', subsystem: 'ui', effect: 'hide_self_reputation', payload: {} },
      ],
    },
    {
      id: 'aftermath_only_honest', phase: 'aftermath', kind: 'terminal', terminal: true, outcome: 'only_honest', localizationId: L.endingC,
      onEnter: [
        { type: 'cue', cueId: CUE.ending, payload: { outcome: 'only_honest' } },
        { type: 'consequence', subsystem: 'world', effect: 'loop_to_pit', payload: { sectorId: 'sector_helios_prime', contractId: '47-A' } },
        { type: 'consequence', subsystem: 'ui', effect: 'cargo_stable_lie', payload: {} },
      ],
    },
    {
      id: 'aftermath_ledger_continues', phase: 'aftermath', kind: 'terminal', terminal: true, outcome: 'ledger_continues', localizationId: L.endingD,
      onEnter: [
        { type: 'cue', cueId: CUE.ending, payload: { outcome: 'ledger_continues' } },
        { type: 'consequence', subsystem: 'locations', effect: 'occupy_ashfall_desk', payload: { stationId: 'station_ashcache' } },
        { type: 'discoverLore', loreId: LORE.ledger },
      ],
    },
    {
      id: 'aftermath_next_run', phase: 'aftermath', kind: 'terminal', terminal: true, outcome: 'next_run', localizationId: L.endingE,
      onEnter: [
        { type: 'cue', cueId: CUE.ending, payload: { outcome: 'next_run' } },
        { type: 'consequence', subsystem: 'economy', effect: 'grant_credits', payload: { amountCr: 1200, reason: '47a_late_payment' } },
        { type: 'consequence', subsystem: 'missions', effect: 'open_contract', payload: { contractId: '47-B', status: 'pending' } },
      ],
    },
  ],
});
