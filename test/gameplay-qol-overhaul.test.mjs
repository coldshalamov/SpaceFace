import test from 'node:test';
import assert from 'node:assert/strict';
import { MAGNET_RANGE } from '../src/systems/mining.js';
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import { RECIPES } from '../src/data/audioRecipes.js';
import { admitReceipt } from '../src/ui/hudAttention.js';
import { getDerivedStats } from '../src/systems/ships.js';

test('1. Super-Wide Vacuum Cargo Attractor: range is 800+ WU', () => {
  assert.ok(MAGNET_RANGE >= 800, `Expected MAGNET_RANGE >= 800, got ${MAGNET_RANGE}`);
});

test('2. Cargo Capacity Expansion: baseline holds scaled across classes', () => {
  const starter = SHIPS.find((s) => s.id === 'ship_kestrel');
  const miner = SHIPS.find((s) => s.id === 'ship_pelican');
  const hauler = SHIPS.find((s) => s.id === 'ship_mule');
  const fighter = SHIPS.find((s) => s.id === 'ship_wasp');

  assert.ok(starter.cargo >= 250, `Starter ship cargo expected >= 250, got ${starter.cargo}`);
  assert.ok(miner.cargo >= 600, `Miner ship cargo expected >= 600, got ${miner.cargo}`);
  assert.ok(hauler.cargo >= 1500, `Hauler ship cargo expected >= 1500, got ${hauler.cargo}`);
  assert.ok(fighter.cargo >= 100, `Fighter ship cargo expected >= 100, got ${fighter.cargo}`);
});

test('3. Fuel & Ammo Friction Removed: weapons do not require ammo commodities', () => {
  for (const w of WEAPONS) {
    assert.equal(w.ammo, undefined, `Weapon ${w.id} still specifies consumable ammo: ${w.ammo}`);
  }
});

test('4. Resilient Self-Recharging Shields: player hulls receive generous shield and regen buffer', () => {
  const npcStats = getDerivedStats('ship_kestrel', [], null);
  const playerStats = getDerivedStats('ship_kestrel', [], { isPlayer: true });

  assert.ok(
    playerStats.shieldMax >= npcStats.shieldMax * 2.5,
    `Player shieldMax should be significantly larger than base (${playerStats.shieldMax} vs ${npcStats.shieldMax})`
  );
  assert.ok(
    playerStats.shieldRegenRate >= npcStats.shieldRegenRate * 2.5,
    `Player shieldRegenRate should be significantly larger than base (${playerStats.shieldRegenRate} vs ${npcStats.shieldRegenRate})`
  );

  // Electrical blowout recipe definitions
  const popRecipe = RECIPES.find((r) => r.id === 'sfx_shield_blowout_pop');
  const alarmRecipe = RECIPES.find((r) => r.id === 'sfx_shield_blowout_alarm');
  assert.ok(popRecipe, 'sfx_shield_blowout_pop recipe must be defined');
  assert.ok(alarmRecipe, 'sfx_shield_blowout_alarm recipe must be defined');
});

test('4b. Directional Shield Hit Shimmers & Invisible Idle Lattice', async () => {
  const { addShieldContact, clearShieldContacts, hasShieldContact } = await import('../src/render/weapons/shieldContacts.js');
  const { shouldPresentShieldBubble } = await import('../src/render/renderer.js');

  const testId = 9999;
  clearShieldContacts(testId);
  assert.equal(hasShieldContact(testId), false, 'No contact initially');
  assert.equal(shouldPresentShieldBubble(100, 0, false), false, 'Shield is 100% invisible at rest (flash=0, no contact)');

  addShieldContact(testId, 1, 0, 0, 1.0);
  assert.equal(hasShieldContact(testId), true, 'Contact registered on impact');
  assert.equal(shouldPresentShieldBubble(100, 0, hasShieldContact(testId)), true, 'Shield presents during active contact even if flash is 0');

  clearShieldContacts(testId);
  assert.equal(hasShieldContact(testId), false, 'Contacts cleared');
  assert.equal(shouldPresentShieldBubble(100, 0, hasShieldContact(testId)), false, 'Shield returns to invisible at rest');
});

test('4c. Complete Hull Protection While Player Shields Are Up', async () => {
  const { createDamageRouter } = await import('../src/combat/damage.js');
  const { createCombatCatalog } = await import('../src/combat/runtime.js');

  const catalog = createCombatCatalog();
  const state = {
    tick: 0,
    playerId: 1,
    combat: { traces: [] },
    entities: new Map(),
    settings: { gameplay: { difficulty: 'veteran' } },
  };
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    hull: 500,
    hullMax: 500,
    shield: 200,
    shieldMax: 200,
    armorHp: 100,
    radius: 14,
    pos: { x: 0, z: 0 },
  };
  const enemy = {
    id: 2,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 0, z: 0 },
    radius: 12,
  };
  state.entities.set(1, player);
  state.entities.set(2, enemy);

  const context = {
    state,
    catalog,
    bus: { emit: () => {} },
    attachments: null,
    helpers: {},
  };
  const router = createDamageRouter(context, { schedule: () => {} });

  // Enemy fires an attack with 50% penetration and 50% shield bypass
  const hitResult = router({
    attackerId: 2,
    targetId: 1,
    packet: {
      channels: { kinetic: 60 },
      penetration: 0.5,
      shieldBypass: 0.5,
    },
  });

  assert.equal(hitResult.ok, true);
  assert.equal(player.hull, 500, 'Player hull must suffer 0 damage while shield is up, preventing cheap bypass bleed');
  assert.equal(player.armorHp, 100, 'Player armor must suffer 0 damage while shield is up, preventing cheap bypass bleed');
  assert.ok(player.shield < 200, 'Player shield properly absorbed the attack');
});

test('5. Noise Discipline: radio dialogue and bark spam rejected from toast receipts', () => {
  const dialogBark = admitReceipt({ text: '"Concord Patrol. Stand by for routine transponder verification."', kind: 'info' });
  assert.equal(dialogBark.admit, false, 'Quoted dialog should be rejected from toast receipt lane');

  const barkChannel = admitReceipt({ text: 'Vessel identified. Stand down.', channel: 'bark' });
  assert.equal(barkChannel.admit, false, 'Bark channel should be rejected from toast receipt lane');

  const mechanicalReceipt = admitReceipt({ text: 'Sold 12 Platinum · +1200 cr', kind: 'good' });
  assert.equal(mechanicalReceipt.admit, true, 'Mechanical transaction receipt should pass through');
});
