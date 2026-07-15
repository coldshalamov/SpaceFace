import { defineFlavorPack } from './catalog.js';

export const flavorOrder = 10;
export const flavorId = 'wreck_rumors';
export const flavorKind = 'rumor_corpus';

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
            { id: 'vigilant_headline', text: 'CONCORD ENDS VEIL SEARCH AFTER FINAL SURVEY LOSS' },
            { id: 'vigilant_budget', text: 'Cairn Vesh finished the map. Concord finished her budget.' },
          ],
        },
        {
          id: 'vigilant_case_file', sourceRef: 'loss.vigilant', channelId: 'loss_investigation', nativeFormat: 'case_file',
          lines: [
            { id: 'vigilant_case', text: 'RECALL ACKNOWLEDGED. VIGILANT CONTINUED ONE PASS. RECOVERY FUNDING: WITHDRAWN.' },
            { id: 'vigilant_epitaph', text: 'Final course matches her unfinished survey line.' },
          ],
        },
      ],
    },
    {
      id: 'rumor_ironsing', programSlot: 'D2', wreckId: 'wreck_dmc_ironsong',
      sources: [{
        id: 'ironsing_gun_intercept', sourceRef: 'comms.ironsing_gun', channelId: 'comms_intercept', nativeFormat: 'quiet_fence_intercept',
        lines: [
          { id: 'ironsing_offer', text: "QUIET RELAY: Buyer seeks the Ironsing gun. Captain's recording verified." },
          { id: 'ironsing_price', text: "Captain's song survives. Hull coordinates cost extra." },
          { id: 'ironsing_sic', text: 'FENCE ANNOTATION: seller refused the proper spelling twice.' },
        ],
      }],
    },
    {
      id: 'rumor_lighthouse', programSlot: 'D3', wreckId: 'wreck_isc_lighthouse',
      sources: [{
        id: 'lighthouse_campaign_reveal', sourceRef: 'campaign.lighthouse_reveal', channelId: 'campaign', nativeFormat: 'campaign_reveal',
        lines: [
          { id: 'lighthouse_answer', text: 'The Lighthouse fired once. Something answered through its keel.' },
          { id: 'lighthouse_seal', text: "Vale sealed the wreck inside Ashfall's moving burn." },
          { id: 'lighthouse_order', text: 'Retrieve the beam. Do not ask what returned fire.' },
        ],
      }],
    },
    {
      id: 'rumor_pale_coil', programSlot: 'D4', wreckId: 'wreck_lanebreaker_pale_coil',
      sources: [{
        id: 'the_lost_coils', sourceRef: 'mission.the_lost_coils', channelId: 'mission', nativeFormat: 'research_mission_hook',
        lines: [
          { id: 'pale_coil_brief', text: 'Research brief: one sealed coil performed an impossible lateral jump.' },
          { id: 'pale_coil_dispute', text: 'VAEL FINDING: RELIC. VAEL FINDING: WEAPON. FILE REMAINS OPEN.' },
          { id: 'pale_coil_hook', text: 'Find the Pale-Coil before their argument becomes a verdict.' },
        ],
      }],
    },
    {
      id: 'rumor_singing_bell', programSlot: 'D5', wreckId: 'wreck_choir_bell_aegis',
      sources: [{
        id: 'singing_bell_taunt', sourceRef: 'bark.singing_bell', channelId: 'bark', nativeFormat: 'vael_patrol_taunt',
        lines: [
          { id: 'singing_bell_taunt_line', text: "Clause of warning: the singing bell won't break. Your tractor will." },
          { id: 'singing_bell_timing', text: 'Pull between pulses. The shrine accepts no mistimed claim.' },
          { id: 'singing_bell_shrine', text: 'We leave the Aegis extant. Worthy opposition remains evidence.' },
        ],
      }],
    },
    {
      id: 'rumor_tideline', programSlot: 'D6', wreckId: 'wreck_gravhand_tideline',
      sources: [{
        id: 'hand_that_fed_the_gulf', sourceRef: 'news.hand_that_fed_the_gulf', channelId: 'news', nativeFormat: 'drift_archaeology_wire',
        lines: [
          { id: 'tideline_headline', text: 'THE HAND THAT FED THE GULF STILL HOLDS' },
          { id: 'tideline_wire', text: 'Recovery tug Tideline remains coupled to an unidentified mass.' },
          { id: 'tideline_power', text: 'No recovery crew followed its tractor line to the far end.' },
        ],
      }],
    },
    {
      id: 'rumor_nestbreaker', programSlot: 'D7', wreckId: 'wreck_nestbreaker',
      sources: [{
        id: 'vraels_nestbreaker_legend', sourceRef: 'bar.sker.nestbreaker', channelId: 'bar', nativeFormat: 'sker_bartender_legend',
        lines: [
          { id: 'nestbreaker_legend', text: 'Vrael broke three Concord nests. Same rack. Same ugly laugh.' },
          { id: 'nestbreaker_fall', text: 'Fourth nest brought a capital. Drink before asking where.' },
          { id: 'nestbreaker_warning', text: 'His admirers call salvage theft. Bounty hunters call it work.' },
        ],
      }],
    },
    {
      id: 'rumor_deepsurvey', programSlot: 'D8', wreckId: 'wreck_deepsurvey',
      sources: [{
        id: 'okars_deep_ping', sourceRef: 'bar.rift_observatory.deepsurvey', channelId: 'bar', nativeFormat: 'observatory_elder_favor',
        lines: [
          { id: 'deepsurvey_depth', text: 'Okar pinged deeper than the ice was willing to stay quiet.' },
          { id: 'deepsurvey_favor', text: "Do me one favor. I'll give you her last bearing." },
          { id: 'deepsurvey_warning', text: 'Ping twice and the ice pings back. Okar learned on three.' },
        ],
      }],
    },
    {
      id: 'rumor_smokesong', programSlot: 'D9', wreckId: 'wreck_smokesong',
      sources: [{
        id: 'tirrs_smokesong', sourceRef: 'bar.io_mercenary.smokesong', channelId: 'bar', nativeFormat: 'reach_mercenary_story',
        lines: [
          { id: 'smokesong_locks', text: 'Tirr walked through three missile locks on smoke alone.' },
          { id: 'smokesong_fall', text: 'Customs seeded her cloud with red tracer flechettes.' },
          { id: 'smokesong_bearing', text: 'Buy this round, then follow the red flechettes home.' },
        ],
      }],
    },
    {
      id: 'rumor_choir_tender', programSlot: 'D10', wreckId: 'wreck_choir_tender',
      sources: [{
        id: 'tragedy_at_helios', sourceRef: 'news.tragedy_at_helios', channelId: 'news', nativeFormat: 'tutorial_news_article',
        lines: [
          { id: 'choir_tender_headline', text: 'TRAGEDY AT HELIOS: RELIEF FREIGHTER LOST' },
          { id: 'choir_tender_report', text: 'Choir-Tender drifted off the yard after a reactor event.' },
          { id: 'choir_tender_choice', text: 'Automated repair cargo remains aboard. Recovery rights are under review.' },
        ],
      }],
    },
    {
      id: 'rumor_silver_draft', programSlot: 'D11', wreckId: 'wreck_mts_silver_draft',
      sources: [{
        id: 'silver_draft_clerk', sourceRef: 'bar.helios_meridian.silver_draft', channelId: 'bar', nativeFormat: 'nervous_meridian_clerk',
        lines: [
          { id: 'silver_draft_window', text: "Silver-Draft missed one filing window. Its cleaner won't miss two." },
          { id: 'silver_draft_buyers', text: 'Three houses want its ledger. None admit their signatures.' },
          { id: 'silver_draft_erasure', text: 'Pay now. Make the wreck, me, and this conversation disappear.' },
        ],
      }],
    },
    {
      id: 'rumor_cassandra', programSlot: 'D12', wreckId: 'wreck_choir_cassandra',
      sources: [{
        id: 'cassandra_thread_reveal', sourceRef: 'campaign.cassandra_reveal', channelId: 'campaign', nativeFormat: 'campaign_thread_reveal',
        lines: [
          { id: 'cassandra_cargo', text: 'Cassandra carried peace under a cloak nobody declared.' },
          { id: 'cassandra_hardliners', text: 'Hardliners agreed on one point: the yacht must vanish.' },
          { id: 'cassandra_proof', text: 'Treaty intact. Cloak telemetry names the saboteur.' },
        ],
      }],
    },
  ],
});
