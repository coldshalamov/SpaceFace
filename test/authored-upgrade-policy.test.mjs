import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTHORED_UPGRADE_OPENING_LIMIT,
  AUTHORED_UPGRADE_SETTLE_MS,
  AUTHORED_UPGRADE_STEADY_LIMIT,
  COMBATANT_ADMISSION_PRIORITY,
  OPENING_FRAME_ADMISSION_PRIORITY,
  authoredUpgradeConcurrencyLimit,
  combatantAdmissionPriority,
  openingFrameAdmissionPriority,
  survivalDefersArenaDressingJob,
} from '../src/render/authoredUpgradePolicy.js';
import { CAMERA_DIRECTOR_COMBAT_MAX_ZOOM } from '../src/render/cameraDirector.js';

test('steady flight stays serial; only loading and opening may overlap two jobs', () => {
  assert.equal(authoredUpgradeConcurrencyLimit({ mode: 'flight' }), AUTHORED_UPGRADE_STEADY_LIMIT);
  assert.equal(authoredUpgradeConcurrencyLimit({ mode: 'loading' }), AUTHORED_UPGRADE_OPENING_LIMIT);
  assert.equal(authoredUpgradeConcurrencyLimit({
    mode: 'flight',
    deferNoncriticalMeshStreaming: true,
  }), AUTHORED_UPGRADE_OPENING_LIMIT);
  assert.equal(authoredUpgradeConcurrencyLimit({
    mode: 'flight',
    firstPlayableFrameAt: 1000,
    nowMs: 1400,
  }), AUTHORED_UPGRADE_STEADY_LIMIT);
  assert.equal(AUTHORED_UPGRADE_SETTLE_MS, 0);
});

test('a hostile ship inside the fight-fit envelope takes the combatant rung', () => {
  const player = { id: 'player', team: 0, pos: { x: 0, z: 0 } };
  const live = { playerId: player.id, entities: new Map([[player.id, player]]) };
  const hostile = { id: 'hostile', type: 'ship', team: 1, alive: true, pos: { x: 200, z: 0 } };

  assert.equal(combatantAdmissionPriority(hostile, live), COMBATANT_ADMISSION_PRIORITY);
  assert.ok(COMBATANT_ADMISSION_PRIORITY > 0 && COMBATANT_ADMISSION_PRIORITY < 1,
    'the rung must sit between the player hull (0) and the critical starting hub (1)');

  assert.equal(combatantAdmissionPriority(
    { ...hostile, pos: { x: CAMERA_DIRECTOR_COMBAT_MAX_ZOOM, z: 0 } }, live,
  ), COMBATANT_ADMISSION_PRIORITY, 'the envelope edge still counts');
  assert.equal(combatantAdmissionPriority(
    { ...hostile, pos: { x: CAMERA_DIRECTOR_COMBAT_MAX_ZOOM + 1, z: 0 } }, live,
  ), null, 'beyond the envelope the job is ordinary background work');

  // Allied, law and same-team ships never take the rung — only genuinely hostile factions do.
  assert.equal(combatantAdmissionPriority({ ...hostile, team: 0 }, live), null);
  assert.equal(combatantAdmissionPriority({ ...hostile, team: 2 }, live), null);
  assert.equal(combatantAdmissionPriority(
    { ...hostile, team: 1 },
    { playerId: 'p', entities: new Map([['p', { id: 'p', team: 1, pos: { x: 0, z: 0 } }]]) },
  ), null, 'same team as the player is not hostile');

  // Non-ships, dead ships and the player himself never take the rung.
  assert.equal(combatantAdmissionPriority({ ...hostile, type: 'station' }, live), null);
  assert.equal(combatantAdmissionPriority({ ...hostile, alive: false }, live), null);
  assert.equal(combatantAdmissionPriority({ ...hostile, isPlayer: true }, live), null);

  // Unknown range or missing live state cannot promote.
  assert.equal(combatantAdmissionPriority({ ...hostile, pos: null }, live), null);
  assert.equal(combatantAdmissionPriority(hostile, { entities: new Map() }), null);
  assert.equal(combatantAdmissionPriority(hostile, null), null);
});

test('a body the opening frame shows takes the opening-frame rung in any mode', () => {
  // The belt tail (ZERO_TO_HERO 7.3): after the results-to-belt bridge the visible set
  // compiled at 10-20 s behind staged station furniture because the flight rungs never
  // applied while the sector loaded. The opening-frame rung is the law of the glass as
  // ordering, and it must hold in the load window too.
  assert.ok(OPENING_FRAME_ADMISSION_PRIORITY > 1 && OPENING_FRAME_ADMISSION_PRIORITY < 2,
    'the rung must sit behind the critical hub (1) and ahead of the locked-target rung (2) and the arrival grade floor');
  const player = { id: 'player', team: 0, pos: { x: 0, z: 0 } };
  const base = {
    playerId: player.id,
    entities: new Map([[player.id, player]]),
    // Crucible applied zoom ~380: the composed glass is about +/-431 x +/-280 WU.
    camera: { liveZoom: 380, composedZoom: 380, fov: 50, aspect: 16 / 9, tilt: 60, focus: { x: 0, z: 0 } },
    world: { frameOrigin: { x: 0, z: 0 } },
    settings: { video: {} },
  };
  for (const mode of ['loading', 'flight', undefined]) {
    const live = { ...base, mode };
    assert.equal(
      openingFrameAdmissionPriority({ id: 'shown', type: 'ship', alive: true, pos: { x: 300, z: 0 } }, live),
      OPENING_FRAME_ADMISSION_PRIORITY,
      `a body inside the composed glass promotes in mode ${mode}`,
    );
    assert.equal(
      openingFrameAdmissionPriority({ id: 'shown-z', type: 'asteroid', alive: true, pos: { x: 0, z: 200 } }, live),
      OPENING_FRAME_ADMISSION_PRIORITY,
      'the glass is the full rectangle, not a disc',
    );
    assert.equal(
      openingFrameAdmissionPriority({ id: 'beyond', type: 'station', alive: true, pos: { x: 600, z: 0 } }, live),
      null,
      `provably off the glass keeps its ordinary rung in mode ${mode}`,
    );
    assert.equal(
      openingFrameAdmissionPriority({ id: 'beyond-z', type: 'station', alive: true, pos: { x: 0, z: 350 } }, live),
      null,
      'a body past the half-extent in Z keeps waiting',
    );
  }

  // The body's own radius counts: an edge-crossing hull promotes, the same pivot without
  // a body does not.
  assert.equal(
    openingFrameAdmissionPriority(
      { id: 'edge', type: 'station', alive: true, radius: 100, pos: { x: 500, z: 0 } }, base,
    ),
    OPENING_FRAME_ADMISSION_PRIORITY,
    'a body reaching into the glass is in the picture',
  );
  assert.equal(
    openingFrameAdmissionPriority({ id: 'edge', type: 'station', alive: true, pos: { x: 500, z: 0 } }, base),
    null,
  );

  // The look-at lead counts exactly like the survival defer: 600 WU from the player is
  // in the picture when the camera leads the hull.
  const led = { ...base, camera: { ...base.camera, focus: { x: 200, z: 0 } } };
  assert.equal(
    openingFrameAdmissionPriority({ id: 'led', type: 'place', alive: true, pos: { x: 600, z: 0 } }, led),
    OPENING_FRAME_ADMISSION_PRIORITY,
    'the composed frame shows what the look-at covers',
  );

  // The zoom is the frame being opened - the live picture or the zoom it opens toward,
  // never the player's requested wheel.
  assert.equal(
    openingFrameAdmissionPriority(
      { id: 'composed-only', type: 'ship', alive: true, pos: { x: 300, z: 0 } },
      { ...base, camera: { ...base.camera, liveZoom: undefined, composedZoom: 380 } },
    ),
    OPENING_FRAME_ADMISSION_PRIORITY,
    'composedZoom alone proves the opening frame',
  );
  assert.equal(
    openingFrameAdmissionPriority(
      { id: 'requested-only', type: 'ship', alive: true, pos: { x: 300, z: 0 } },
      { ...base, camera: { fov: 50, aspect: 16 / 9, tilt: 60, zoom: 380, focus: { x: 0, z: 0 } } },
    ),
    null,
    'a requested wheel with no composed frame proves nothing - fail closed',
  );

  // Fail closed on an uncomposed camera and on missing anchors: the arrival distance
  // grades must survive untouched until a frame exists.
  assert.equal(
    openingFrameAdmissionPriority(
      { id: 'early', type: 'ship', alive: true, pos: { x: 300, z: 0 } },
      { ...base, camera: { zoom: 380, focus: { x: 0, z: 0 } } },
    ),
    null,
  );
  assert.equal(
    openingFrameAdmissionPriority(
      { id: 'no-anchor', type: 'ship', alive: true, pos: { x: 300, z: 0 } },
      { ...base, camera: { ...base.camera, focus: null }, playerId: null, entities: new Map() },
    ),
    null,
    'no look-at anchor, no frame to show anything',
  );
  assert.equal(
    openingFrameAdmissionPriority(
      { id: 'half-focus', type: 'ship', alive: true, pos: { x: 300, z: 0 } },
      {
        ...base,
        playerId: null,
        entities: new Map(),
        camera: { ...base.camera, focus: { x: 400, z: Number.NaN } },
      },
    ),
    null,
    'a half-written focus is not an anchor - the glass would re-center on the world origin and fail open',
  );

  // Dead owners and unreadable poses never promote.
  assert.equal(openingFrameAdmissionPriority(
    { id: 'dead', type: 'ship', alive: false, pos: { x: 300, z: 0 } }, base,
  ), null);
  assert.equal(openingFrameAdmissionPriority(
    { id: 'no-pos', type: 'ship', alive: true, pos: null }, base,
  ), null);
  assert.equal(openingFrameAdmissionPriority(null, base), null);
  assert.equal(openingFrameAdmissionPriority({ id: 'x', type: 'ship', alive: true, pos: { x: 0, z: 0 } }, null), null);
});

test('a live survival run defers only what the composed frame cannot show', () => {
  const player = { id: 'player', team: 0, pos: { x: 0, z: 0 } };
  // Crucible applied zoom ~380: the composed glass is about ±431 x ±280 WU plus the 48 WU skirt.
  const live = {
    playerId: player.id,
    entities: new Map([[player.id, player]]),
    run: { kind: 'survival', phase: 'wave' },
    camera: { liveZoom: 380, fov: 50, aspect: 16 / 9, tilt: 60, focus: { x: 0, z: 0 } },
    world: { frameOrigin: { x: 0, z: 0 } },
  };

  for (const type of ['station', 'asteroid', 'fx', 'place']) {
    assert.equal(
      survivalDefersArenaDressingJob({ id: `${type}-glass`, type, pos: { x: 400, z: 0 } }, live),
      false, `${type} inside the composed frame still admits`,
    );
    assert.equal(
      survivalDefersArenaDressingJob({ id: `${type}-runway`, type, pos: { x: 460, z: 0 } }, live),
      false, `${type} in the skirt runway still admits`,
    );
    assert.equal(
      survivalDefersArenaDressingJob({ id: `${type}-beyond`, type, pos: { x: 600, z: 0 } }, live),
      true, `${type} provably beyond the band defers while the run holds the arena`,
    );
  }

  // A body far from the player is NOT deferred when the look-at lead puts it on the glass.
  const led = { ...live, camera: { ...live.camera, focus: { x: 200, z: 0 } } };
  assert.equal(survivalDefersArenaDressingJob(
    { id: 'station-led', type: 'station', pos: { x: 600, z: 0 } }, led,
  ), false, '600 WU from the player is on-glass when the camera leads the hull');

  // The body's own radius counts: a large landmark reaching the skirt stays queued.
  assert.equal(survivalDefersArenaDressingJob(
    { id: 'station-big', type: 'station', radius: 200, pos: { x: 650, z: 0 } }, live,
  ), false);

  // Before the camera composes a frame nothing is provably off-glass — fail open.
  const unread = { ...live, camera: { zoom: 144, tilt: 60, focus: null } };
  assert.equal(survivalDefersArenaDressingJob(
    { id: 'station-early', type: 'station', pos: { x: 2000, z: 0 } }, unread,
  ), false);

  // Ships and wrecks are fight-relevant bodies — never deferred no matter the band.
  assert.equal(survivalDefersArenaDressingJob(
    { id: 'hostile', type: 'ship', team: 1, pos: { x: 2000, z: 0 } }, live,
  ), false);
  assert.equal(survivalDefersArenaDressingJob(
    { id: 'wreck', type: 'wreck', pos: { x: 2000, z: 0 } }, live,
  ), false);

  // No live survival run — nothing defers.
  assert.equal(survivalDefersArenaDressingJob(
    { id: 'station', type: 'station', pos: { x: 2000, z: 0 } },
    { ...live, run: { kind: 'survival', phase: 'inactive' } },
  ), false);
  assert.equal(survivalDefersArenaDressingJob(
    { id: 'station', type: 'station', pos: { x: 2000, z: 0 } },
    { ...live, run: null },
  ), false);
  assert.equal(survivalDefersArenaDressingJob(
    { id: 'station', type: 'station', pos: { x: 2000, z: 0 } },
    { ...live, run: { kind: 'adventure', phase: 'active' } },
  ), false);
});
