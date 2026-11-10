// Original encounter content over the existing authored Hawser/Hitch hulls and wreck renderer.
// Claims below are advertised work intentions, not new law or exclusive mining ownership.
export const SALVAGE_OUTFITS_SCHEMA = 1;
export const SALVAGE_OUTFITS_OWNER = 'salvageOutfits';
export const SALVAGE_OUTFITS_LIMITS = Object.freeze({
  meetings: 64, activeMeetings: 3, offerRange: 650, deliveryRadius: 65,
  deliverySpeed: 12, overloadSeconds: 6, towDeadline: 240, memoryEvents: 12,
});

export const OUTFITS = Object.freeze([
  Object.freeze({ id: 'keel', name: 'Keel Union', captain: 'Nera Vale',
    factionId: 'faction_pitborn', shipDefId: 'ship_hawser', speed: 46,
    offset: Object.freeze({ x: -210, z: -125 }), safeMass: 360,
    greeting: 'Heavy frame is ours if we can lift it. The small pieces are worth your time. Want a clean split?',
    helped: 'You have brought our load home before. Better cut for a steady hand.',
    cheated: 'Last time you cut the piece you promised us. Independent claims today.',
    damaged: 'I remember your fire. Independent work today. Keep your distance.',
    kept: 'You kept the last split. Clear claims again today.',
  }),
  Object.freeze({ id: 'latch', name: 'Latchkey', captain: 'Kit Rill',
    factionId: 'faction_free', shipDefId: 'ship_kestrel', speed: 85,
    offset: Object.freeze({ x: 100, z: 145 }), safeMass: 130,
    greeting: 'Calling the bright one. Catch me before the receiver if you want it.',
    helped: 'I remember the tow. Small crate is yours; I owe you a clean run.',
    cheated: 'I remember that promise. Taking the small work first and keeping my distance.',
    damaged: 'I remember your fire. Taking the small work first and keeping my distance.',
  }),
]);

export const SALVAGE_PIECES = Object.freeze([
  Object.freeze({ id: 'core', label: 'Drive cradle', mass: 280, radius: 10,
    offset: Object.freeze({ x: 0, z: 0 }), pool: Object.freeze({ cmdty_scrap_metal: 12 }),
    parentType: 'ship_hawser', hull: 150 }),
  Object.freeze({ id: 'frame', label: 'Radiator frame', mass: 100, radius: 7,
    offset: Object.freeze({ x: 85, z: -85 }), pool: Object.freeze({ cmdty_scrap_metal: 7 }),
    parentType: 'ship_mule', hull: 95 }),
  Object.freeze({ id: 'cache', label: 'Sealed tooling rack', mass: 35, radius: 5,
    offset: Object.freeze({ x: -75, z: 90 }), pool: Object.freeze({ cmdty_scrap_metal: 4 }),
    parentType: 'ship_kestrel', hull: 60 }),
]);

export const SALVAGE_SITUATIONS = Object.freeze([
  Object.freeze({ id: 'split_drift', title: 'Three pieces, three claims',
    coreClaim: 'keel', latchTarget: 'frame', keelDelay: 0,
    line: 'Keel Union is lining up the drive cradle. Latchkey is racing for the radiator. The tooling rack is still open.' }),
  Object.freeze({ id: 'heavy_lift', title: 'A second pair of hands',
    coreClaim: 'keel', latchTarget: 'cache', keelDelay: 2,
    line: 'The heavy cradle needs the Hawser. Help deliver the separate radiator and share the completed haul.' }),
  Object.freeze({ id: 'overreach', title: 'More load than cable',
    coreClaim: 'latch', latchTarget: 'core', keelDelay: 9,
    line: 'Latchkey has called a cradle heavier than its working limit. Keel is still approaching. The small pieces remain useful.' }),
]);

export const outfit = id => OUTFITS.find(row => row.id === id);
export const piece = id => SALVAGE_PIECES.find(row => row.id === id);
export const situation = id => SALVAGE_SITUATIONS.find(row => row.id === id) || SALVAGE_SITUATIONS[0];
export const bodyKey = (meetingId, id) => `salvage-outfits:${meetingId}:cargo:${id}`;
export const crewKey = (meetingId, id) => `salvage-outfits:${meetingId}:crew:${id}`;
export const poolTotal = pool => Object.values(pool || {}).reduce((sum, qty) => sum + Math.max(0, Number(qty) || 0), 0);
export const distrustsPlayer = memory => memory?.lastEvent?.kind === 'cheated'
  || (memory?.cheated || 0) > (memory?.helped || 0);
// The receiver is a local receiving apron, accounted to the sector's existing salvage market.
export const SALVAGE_YARDS = Object.freeze({
  sector_ceres_belt: 'station_ceres', sector_vesta_forge: 'station_vesta_outlying_yard',
});
