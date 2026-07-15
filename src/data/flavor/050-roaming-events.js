import { defineFlavorPack } from './catalog.js';

export const flavorOrder = 50;
export const flavorId = 'roaming_events';
export const flavorKind = 'event_flavor';

export default defineFlavorPack({
  id: flavorId,
  kind: flavorKind,
  description: 'Band, news, hail, and economy copy for two rare moving stories.',
  entries: [
    {
      id: 'insolvent', eventId: 'event_insolvent',
      economyHook: { kind: 'legacy_price_arbitrage', priceAgeYears: 43, settlement: 'historical_face_value' },
      lines: [
        { id: 'insolvent_hail_01', surface: 'hail', text: 'Meridian Interlogistics, Division Seven. Route service remains active.' },
        { id: 'insolvent_warning_01', surface: 'hail', text: 'You obstruct a scheduled delivery. Please become elsewhere.' },
        { id: 'insolvent_grievance_01', surface: 'hail', text: 'Formal grievance filed under the dissolved charter.' },
        { id: 'insolvent_grievance_02', surface: 'hail', text: 'Central office has not denied our route.' },
        { id: 'insolvent_status_01', surface: 'band', text: 'Shutdown request filed forty-three years ago. Response pending.' },
        { id: 'insolvent_status_02', surface: 'band', text: 'We remain employees in good standing.' },
        { id: 'insolvent_trade_01', surface: 'trade', text: 'Division Seven rates remain fixed at dissolution.' },
        { id: 'insolvent_trade_02', surface: 'trade', text: 'Modern credits clear at forty-three-year face value.' },
        { id: 'insolvent_trade_03', surface: 'trade', text: 'Trade completed. Receipt routed to a closed account.' },
        { id: 'insolvent_remittance_01', surface: 'band', text: 'Profit remittance failed. Delivery continues.' },
        { id: 'insolvent_supervisor_01', surface: 'hail', text: 'Supervisor approaching. Clear the historical lane.' },
        { id: 'insolvent_maintenance_01', surface: 'band', text: 'Maintenance remains approved. The approving office no longer exists.' },
        { id: 'insolvent_news_01', surface: 'news', text: 'Meridian denies owning the convoy using its logo.' },
        { id: 'insolvent_news_02', surface: 'news', text: 'Old gold crossed Helios exactly on the obsolete schedule.' },
        { id: 'insolvent_news_03', surface: 'news', text: 'Legacy freight sold. Current fines followed.' },
        { id: 'insolvent_departure_01', surface: 'news', text: 'The route closed. The haulers did not.' },
      ],
    },
    {
      id: 'slow_fleet', eventId: 'event_slow_fleet',
      economyHook: { kind: 'master_key_delivery', recipient: 'verge_layers', marketValue: null },
      lines: [
        { id: 'slow_fleet_contact_01', surface: 'hail', text: 'Unknown carrier requests docking in an extinct language.' },
        { id: 'slow_fleet_translation_01', surface: 'hail', text: 'Translation partial: clearance requested. Delivery awaiting receipt.' },
        { id: 'slow_fleet_time_01', surface: 'scan', text: 'External elapsed time: ninety thousand years.' },
        { id: 'slow_fleet_time_02', surface: 'scan', text: 'Shipboard clocks advanced one crew generation.' },
        { id: 'slow_fleet_recipient_01', surface: 'scan', text: 'Recipient station resolves as an asteroid field.' },
        { id: 'slow_fleet_cargo_01', surface: 'scan', text: 'Diplomatic cargo seals remain intact.' },
        { id: 'slow_fleet_formation_01', surface: 'scan', text: 'Five courier hulls hold formation without measurable drift.' },
        { id: 'slow_fleet_course_01', surface: 'band', text: 'The fleet has not changed course since emergence.' },
        { id: 'slow_fleet_proxy_01', surface: 'hail', text: "Reply accepted: recipient's proxy recognized." },
        { id: 'slow_fleet_stop_01', surface: 'band', text: 'The convoy slows for the first time on record.' },
        { id: 'slow_fleet_value_01', surface: 'trade', text: 'Cargo valuation failed. No credit market applies.' },
        { id: 'slow_fleet_archive_01', surface: 'trade', text: 'Archive buyers offer a reading room, not money.' },
        { id: 'slow_fleet_verge_01', surface: 'scan', text: 'Verge gates accept the diplomatic seals as master clearance.' },
        { id: 'slow_fleet_attack_01', surface: 'hail', text: 'Ancient weapons wake. Every modern warning light follows.' },
        { id: 'slow_fleet_news_01', surface: 'news', text: 'The Slow Fleet crossed Tethys without acknowledging the century.' },
        { id: 'slow_fleet_news_02', surface: 'news', text: 'A delivery outlived the nation waiting for it.' },
      ],
    },
  ],
});
