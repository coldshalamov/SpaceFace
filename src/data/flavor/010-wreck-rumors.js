import { defineFlavorPack } from './catalog.js';

export const flavorOrder = 10;
export const flavorId = 'wreck_rumors';
export const flavorKind = 'rumor_corpus';

// Every line carries `subjectId`: the real wreck, world one-off, or landmark the rumor points at.
// The corpus stays twelve entries D1-D12 in the reservation's native channels; the lines inside
// each source are the rumor count — short, dry, and pointed at places that exist in data.
export default defineFlavorPack({
  id: flavorId,
  kind: flavorKind,
  description: 'Native-format rumor copy for the twelve unique-loot wrecks.',
  entries: [
    {
      id: 'rumor_vigilant', programSlot: 'D1', wreckId: 'wreck_isc_vigilant',
      sources: [
        {
          id: 'losses_in_the_veil', sourceRef: 'news.losses_in_the_veil', channelId: 'news', nativeFormat: 'ticker_article',
          lines: [
            { id: 'vigilant_headline', subjectId: 'wreck_isc_vigilant', text: 'CONCORD ENDS VEIL SEARCH AFTER FINAL SURVEY LOSS' },
            { id: 'vigilant_budget', subjectId: 'wreck_isc_vigilant', text: 'Cairn Vesh finished the map. Concord finished her budget.' },
            { id: 'vigilant_obelisk', subjectId: 'resonance_obelisk', text: 'The Veil survey post logged one more pulse than it filed. The Obelisk keeps the difference.' },
            { id: 'vigilant_surge_shrine', subjectId: 'oneoff_surge_shrine', text: 'A comms mast on the storm line still rings in the burn. Crews leave it ribbons, not repair orders.' },
            { id: 'vigilant_cathedral', subjectId: 'wreck_cathedral', text: 'Concord denies the Vigilant and the cathedral in the Reach share a registry. The hulls disagree.' },
            { id: 'vigilant_pin', subjectId: 'oneoff_the_pin', text: 'A lane marker in Sedna still points down a corridor nobody finished paving.' },
            { id: 'vigilant_tender', subjectId: 'wreck_choir_tender', text: 'Recovery offices list one tender dark on the Ceres seam. Its manifest was never read aloud.' },
          ],
        },
        {
          id: 'vigilant_case_file', sourceRef: 'loss.vigilant', channelId: 'loss_investigation', nativeFormat: 'case_file',
          lines: [
            { id: 'vigilant_case', subjectId: 'wreck_isc_vigilant', text: 'RECALL ACKNOWLEDGED. VIGILANT CONTINUED ONE PASS. RECOVERY FUNDING: WITHDRAWN.' },
            { id: 'vigilant_epitaph', subjectId: 'wreck_isc_vigilant', text: 'Final course matches her unfinished survey line.' },
            { id: 'vigilant_xref_cathedral', subjectId: 'wreck_cathedral', text: 'CROSS-REFERENCE: CATHEDRAL SITE, IO REACH. SAME NAME. DIFFERENT INCIDENT. DO NOT MERGE DOCKETS.' },
            { id: 'vigilant_xref_coil', subjectId: 'wreck_lanebreaker_pale_coil', text: 'RELATED HOLDING: SEALED COIL, PHOEBE VAULT. VAEL CUSTODY. FILE SEPARATELY.' },
            { id: 'vigilant_xref_quadrille', subjectId: 'wreck_mts_quadrille', text: 'SEE ALSO: COURIER QUADRILLE, REACH SHELF. SEAL-LOG STILL PINGING ON A DEAD BAND.' },
            { id: 'vigilant_xref_silver', subjectId: 'wreck_mts_silver_draft', text: 'SHARED HANDWRITING: SILVER-DRAFT LEDGER, HELIOS FIELD. SAME CLERK. BOTH FILES OPEN.' },
          ],
        },
      ],
    },
    {
      id: 'rumor_ironsing', programSlot: 'D2', wreckId: 'wreck_dmc_ironsong',
      sources: [{
        id: 'ironsing_gun_intercept', sourceRef: 'comms.ironsing_gun', channelId: 'comms_intercept', nativeFormat: 'quiet_fence_intercept',
        lines: [
          { id: 'ironsing_offer', subjectId: 'wreck_dmc_ironsong', text: "QUIET RELAY: Buyer seeks the Ironsing gun. Captain's recording verified." },
          { id: 'ironsing_price', subjectId: 'wreck_dmc_ironsong', text: "Captain's song survives. Hull coordinates cost extra." },
          { id: 'ironsing_sic', subjectId: 'wreck_dmc_ironsong', text: 'FENCE ANNOTATION: seller refused the proper spelling twice.' },
          { id: 'ironsing_false_gate', subjectId: 'oneoff_false_gate', text: 'QUIET RELAY: a jump ring in the March never spun. It is a memorial now. The welds still pass inspection.' },
          { id: 'ironsing_double_entry', subjectId: 'wreck_isc_double_entry', text: 'Buyer asks which hull files under two names. Fence answers: the one still cooling.' },
          { id: 'ironsing_pinnace', subjectId: 'oneoff_held_dock_pinnace', text: 'Coordinates for a customs pinnace that died holding the Reach dock. Lamp service included in the price.' },
          { id: 'ironsing_toll', subjectId: 'wreck_dmc_ironsong', text: 'Cut-lane tolls run both directions now. One wreck still pays them.' },
        ],
      }],
    },
    {
      id: 'rumor_lighthouse', programSlot: 'D3', wreckId: 'wreck_isc_lighthouse',
      sources: [{
        id: 'lighthouse_campaign_reveal', sourceRef: 'campaign.lighthouse_reveal', channelId: 'campaign', nativeFormat: 'campaign_reveal',
        lines: [
          { id: 'lighthouse_answer', subjectId: 'wreck_isc_lighthouse', text: 'The Lighthouse fired once. Something answered through its keel.' },
          { id: 'lighthouse_seal', subjectId: 'wreck_isc_lighthouse', text: "Vale sealed the wreck inside Ashfall's moving burn." },
          { id: 'lighthouse_order', subjectId: 'wreck_isc_lighthouse', text: 'Retrieve the beam. Do not ask what returned fire.' },
          { id: 'lighthouse_iron_maw', subjectId: 'iron_maw', text: 'The Iron Maw wears seven capital colors. The Lighthouse fired once. Ashfall keeps both.' },
          { id: 'lighthouse_vault_maw', subjectId: 'vault_maw', text: 'Six stone petals meet around sealed records. The burn moves on schedule; the Maw does not.' },
          { id: 'lighthouse_ledger', subjectId: 'oneoff_the_ledger', text: 'A dead liner in the Reach still counts the mass nobody will file.' },
          { id: 'lighthouse_return_fire', subjectId: 'wreck_isc_lighthouse', text: 'The return-fire source shares the burn\u2019s own catalog number.' },
        ],
      }],
    },
    {
      id: 'rumor_pale_coil', programSlot: 'D4', wreckId: 'wreck_lanebreaker_pale_coil',
      sources: [{
        id: 'the_lost_coils', sourceRef: 'mission.the_lost_coils', channelId: 'mission', nativeFormat: 'research_mission_hook',
        lines: [
          { id: 'pale_coil_brief', subjectId: 'wreck_lanebreaker_pale_coil', text: 'Research brief: one sealed coil performed an impossible lateral jump.' },
          { id: 'pale_coil_dispute', subjectId: 'wreck_lanebreaker_pale_coil', text: 'VAEL FINDING: RELIC. VAEL FINDING: WEAPON. FILE REMAINS OPEN.' },
          { id: 'pale_coil_hook', subjectId: 'wreck_lanebreaker_pale_coil', text: 'Find the Pale-Coil before their argument becomes a verdict.' },
          { id: 'pale_coil_sphere', subjectId: 'shard_sphere', text: 'Sixty shards remember one note each. The Coil may be the verse they are missing.' },
          { id: 'pale_coil_answer', subjectId: 'oneoff_the_answer', text: 'An array at Phoebe still replies to a hail nobody sent.' },
          { id: 'pale_coil_class', subjectId: 'wreck_lanebreaker_pale_coil', text: 'VAEL FINDING: the drive class retains one surviving member. Class seat: vacant.' },
          { id: 'pale_coil_bell', subjectId: 'wreck_choir_bell_aegis', text: 'Addendum: a shrine bell in the Wake rings on the same interval the Coil jumped at.' },
        ],
      }],
    },
    {
      id: 'rumor_singing_bell', programSlot: 'D5', wreckId: 'wreck_choir_bell_aegis',
      sources: [{
        id: 'singing_bell_taunt', sourceRef: 'bark.singing_bell', channelId: 'bark', nativeFormat: 'vael_patrol_taunt',
        lines: [
          { id: 'singing_bell_taunt_line', subjectId: 'wreck_choir_bell_aegis', text: "Clause of warning: the singing bell won't break. Your tractor will." },
          { id: 'singing_bell_timing', subjectId: 'wreck_choir_bell_aegis', text: 'Pull between pulses. The shrine accepts no mistimed claim.' },
          { id: 'singing_bell_shrine', subjectId: 'wreck_choir_bell_aegis', text: 'We leave the Aegis extant. Worthy opposition remains evidence.' },
          { id: 'singing_bell_watcher', subjectId: 'tide_locked_watcher', text: 'Clause of regard: the carved eye watched a star that is gone. It watches your approach now.' },
          { id: 'singing_bell_tithe', subjectId: 'oneoff_watchers_tithe', text: 'Offerings left at the anomaly rim are not worship. They are accounting.' },
          { id: 'singing_bell_coil', subjectId: 'wreck_lanebreaker_pale_coil', text: 'The bell and the sealed Coil argue in the same register. Neither side concedes.' },
          { id: 'singing_bell_measure', subjectId: 'wreck_choir_bell_aegis', text: 'We measure your timing. The shrine measures your worth.' },
        ],
      }],
    },
    {
      id: 'rumor_tideline', programSlot: 'D6', wreckId: 'wreck_gravhand_tideline',
      sources: [{
        id: 'hand_that_fed_the_gulf', sourceRef: 'news.hand_that_fed_the_gulf', channelId: 'news', nativeFormat: 'drift_archaeology_wire',
        lines: [
          { id: 'tideline_headline', subjectId: 'wreck_gravhand_tideline', text: 'THE HAND THAT FED THE GULF STILL HOLDS' },
          { id: 'tideline_wire', subjectId: 'wreck_gravhand_tideline', text: 'Recovery tug Tideline remains coupled to an unidentified mass.' },
          { id: 'tideline_power', subjectId: 'wreck_gravhand_tideline', text: 'No recovery crew followed its tractor line to the far end.' },
          { id: 'tideline_held_note', subjectId: 'oneoff_held_note', text: 'A container addressed to a dead crew still rides the same debris line.' },
          { id: 'tideline_quiessence', subjectId: 'quiessence', text: 'Seventeen freighters hold formation at the Drift. The tug counted them and kept hauling.' },
          { id: 'tideline_pending', subjectId: 'wreck_gravhand_tideline', text: 'Recovery crews log the coupled mass as pending. The tractor logs it as held.' },
          { id: 'tideline_auction', subjectId: 'wreck_gravhand_tideline', text: 'Salvage rights to the far end of the line remain unauctioned.' },
        ],
      }],
    },
    {
      id: 'rumor_nestbreaker', programSlot: 'D7', wreckId: 'wreck_nestbreaker',
      sources: [{
        id: 'vraels_nestbreaker_legend', sourceRef: 'bar.sker.nestbreaker', channelId: 'bar', nativeFormat: 'sker_bartender_legend',
        lines: [
          { id: 'nestbreaker_legend', subjectId: 'wreck_nestbreaker', text: 'Vrael broke three Concord nests. Same rack. Same ugly laugh.' },
          { id: 'nestbreaker_fall', subjectId: 'wreck_nestbreaker', text: 'Fourth nest brought a capital. Drink before asking where.' },
          { id: 'nestbreaker_warning', subjectId: 'wreck_nestbreaker', text: 'His admirers call salvage theft. Bounty hunters call it work.' },
          { id: 'nestbreaker_shelf', subjectId: 'oneoff_impound_shelf', text: 'Everything the Reach ever seized is welded to a rack behind the Bazaar. Go count it.' },
          { id: 'nestbreaker_throne', subjectId: 'skerris_throne', text: 'The Throne grew a plate after every raid. Vrael hung the rack where the skull could see it.' },
          { id: 'nestbreaker_wall', subjectId: 'wreck_nestbreaker', text: 'The fourth nest\u2019s capital colors are a wall plate now. The wall is the bazaar\u2019s ledger.' },
          { id: 'nestbreaker_tag_post', subjectId: 'oneoff_tag_post', text: 'His admirers pay in writs. The hunters hang them on the Charon lane where the count can see.' },
        ],
      }],
    },
    {
      id: 'rumor_deepsurvey', programSlot: 'D8', wreckId: 'wreck_deepsurvey',
      sources: [{
        id: 'okars_deep_ping', sourceRef: 'bar.rift_observatory.deepsurvey', channelId: 'bar', nativeFormat: 'observatory_elder_favor',
        lines: [
          { id: 'deepsurvey_depth', subjectId: 'wreck_deepsurvey', text: 'Okar pinged deeper than the ice was willing to stay quiet.' },
          { id: 'deepsurvey_favor', subjectId: 'wreck_deepsurvey', text: "Do me one favor. I'll give you her last bearing." },
          { id: 'deepsurvey_warning', subjectId: 'wreck_deepsurvey', text: 'Ping twice and the ice pings back. Okar learned on three.' },
          { id: 'deepsurvey_seam_light', subjectId: 'oneoff_seam_light', text: 'A worklight still burns on the fissure lip. Okar paid the crew that left it on.' },
          { id: 'deepsurvey_cassandra', subjectId: 'wreck_choir_cassandra', text: 'The diplomatic yacht heard his third ping too. It did not survive answering.' },
          { id: 'deepsurvey_cold', subjectId: 'wreck_deepsurvey', text: 'Her suite came back colder than the ice that took her.' },
          { id: 'deepsurvey_filing', subjectId: 'wreck_deepsurvey', text: 'Ping once for the map. The Observatory files every answer the ice returns.' },
        ],
      }],
    },
    {
      id: 'rumor_smokesong', programSlot: 'D9', wreckId: 'wreck_smokesong',
      sources: [{
        id: 'tirrs_smokesong', sourceRef: 'bar.io_mercenary.smokesong', channelId: 'bar', nativeFormat: 'reach_mercenary_story',
        lines: [
          { id: 'smokesong_locks', subjectId: 'wreck_smokesong', text: 'Tirr walked through three missile locks on smoke alone.' },
          { id: 'smokesong_fall', subjectId: 'wreck_smokesong', text: 'Customs seeded her cloud with red tracer flechettes.' },
          { id: 'smokesong_bearing', subjectId: 'wreck_smokesong', text: 'Buy this round, then follow the red flechettes home.' },
          { id: 'smokesong_cathedral', subjectId: 'wreck_cathedral', text: 'The cathedral hull on the derelict shelf is not her. Scavengers nest there anyway.' },
          { id: 'smokesong_quadrille', subjectId: 'wreck_mts_quadrille', text: 'A courier died on that same shelf with its seal-log still pinging. Nobody read it yet.' },
          { id: 'smokesong_pinnace', subjectId: 'oneoff_held_dock_pinnace', text: 'She walked the dock pinnace\u2019s killbox the day it died holding the Reach.' },
          { id: 'smokesong_sort', subjectId: 'wreck_smokesong', text: 'Her cloud still sorts red from grey. The flechettes never sorted back.' },
        ],
      }],
    },
    {
      id: 'rumor_choir_tender', programSlot: 'D10', wreckId: 'wreck_choir_tender',
      sources: [{
        id: 'tragedy_at_helios', sourceRef: 'news.tragedy_at_helios', channelId: 'news', nativeFormat: 'tutorial_news_article',
        lines: [
          { id: 'choir_tender_headline', subjectId: 'wreck_choir_tender', text: 'TRAGEDY AT HELIOS: RELIEF FREIGHTER LOST' },
          { id: 'choir_tender_report', subjectId: 'wreck_choir_tender', text: 'Choir-Tender drifted off the yard after a reactor event.' },
          { id: 'choir_tender_choice', subjectId: 'wreck_choir_tender', text: 'Automated repair cargo remains aboard. Recovery rights are under review.' },
          { id: 'choir_tender_fleet', subjectId: 'candle_fleet', text: 'The Candle Fleet keeps twenty-four flames lit and one plinth dark.' },
          { id: 'choir_tender_tanker', subjectId: 'oneoff_great_tanker', text: 'A tanker older than the yard drifts off Helios. Her registry predates the yard.' },
          { id: 'choir_tender_keg', subjectId: 'oneoff_spare_keg', text: 'A bulk keg sits mid-hop off the berth. The yard lends it out and loses the log.' },
          { id: 'choir_tender_names', subjectId: 'wreck_choir_tender', text: 'Relief control files the wreck under open claim. The survivors file it under names.' },
        ],
      }],
    },
    {
      id: 'rumor_silver_draft', programSlot: 'D11', wreckId: 'wreck_mts_silver_draft',
      sources: [{
        id: 'silver_draft_clerk', sourceRef: 'bar.helios_meridian.silver_draft', channelId: 'bar', nativeFormat: 'nervous_meridian_clerk',
        lines: [
          { id: 'silver_draft_window', subjectId: 'wreck_mts_silver_draft', text: "Silver-Draft missed one filing window. Its cleaner won't miss two." },
          { id: 'silver_draft_buyers', subjectId: 'wreck_mts_silver_draft', text: 'Three houses want its ledger. None admit their signatures.' },
          { id: 'silver_draft_erasure', subjectId: 'wreck_mts_silver_draft', text: 'Pay now. Make the wreck, me, and this conversation disappear.' },
          { id: 'silver_draft_saint', subjectId: 'oneoff_toll_saint_box', text: 'The Toll Saint\u2019s box keeps plates nobody counted. Do not ask which office keeps the keepsakes.' },
          { id: 'silver_draft_buoy', subjectId: 'oneoff_answering_buoy', text: 'A buoy on the toll run answers for a hull that broke up years ago. Nobody owns the registry.' },
          { id: 'silver_draft_settling', subjectId: 'oneoff_the_settling', text: 'A spilled load on the Ceres run sorted itself by weight. Physics filed it before we did.' },
          { id: 'silver_draft_keg', subjectId: 'oneoff_tethys_tally_keg', text: 'The keg at the Tally carries two desks\u2019 stamps and no count. That is how a syndicate works.' },
        ],
      }],
    },
    {
      id: 'rumor_cassandra', programSlot: 'D12', wreckId: 'wreck_choir_cassandra',
      sources: [{
        id: 'cassandra_thread_reveal', sourceRef: 'campaign.cassandra_reveal', channelId: 'campaign', nativeFormat: 'campaign_thread_reveal',
        lines: [
          { id: 'cassandra_cargo', subjectId: 'wreck_choir_cassandra', text: 'Cassandra carried peace under a cloak nobody declared.' },
          { id: 'cassandra_hardliners', subjectId: 'wreck_choir_cassandra', text: 'Hardliners agreed on one point: the yacht must vanish.' },
          { id: 'cassandra_proof', subjectId: 'wreck_choir_cassandra', text: 'Treaty intact. Cloak telemetry names the saboteur.' },
          { id: 'cassandra_light', subjectId: 'oneoff_seam_light', text: 'The Observatory keeps a worklight burning on the fissure lip for what the ice returned.' },
          { id: 'cassandra_ping', subjectId: 'wreck_deepsurvey', text: 'Okar\u2019s third ping and Cassandra\u2019s last hail shared a frequency neither side admits.' },
          { id: 'cassandra_fissure', subjectId: 'wreck_choir_cassandra', text: 'The cloak telemetry\u2019s destination was a fissure the map refuses to hold still.' },
          { id: 'cassandra_weather', subjectId: 'wreck_choir_cassandra', text: 'Hardliners burned the yacht. The treaty draft is filed under weather.' },
        ],
      }],
    },
  ],
});
