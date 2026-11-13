// plantsRuntime — the single registration point for every standalone plant system.
// One init/update/destroy pass-through so the browser registry, the node factory table and
// the authoritative manifest each need exactly one 'plants' entry. Traffic-family plants
// (the *Ops mixins — farBerth, mistaken, ducklings, ...) are NOT registered here: they wire
// into src/systems/traffic.js's reaction object, the established family route.
// Scope: MODE_SCOPE_COMBAT_FLIGHT (flight + swarm + yard) — plants exist in both doors.
// Single-sim ownership: imported children are singletons. The first live runtime owns each
// child until destroy(); forked sims skip those children rather than stealing subscriptions.
// Generated from the module directory: add a module file, rerun the generator, done.

import { badMagnetPlant } from './badMagnetPlant.js';
import { brokenTollPlant } from './brokenTollPlant.js';
import { broodShortcutPlant } from './broodShortcutPlant.js';
import { chasedThiefPlant } from './chasedThiefPlant.js';
import { darkStretchPlant } from './darkStretchPlant.js';
import { deadLanePlant } from './deadLane.js';
import { deadStickPlant } from './deadStickPlant.js';
import { dingPlant } from './dingPlant.js';
import { dutchAfterYouPlant } from './dutchAfterYou.js';
import { emptyBerthPlant } from './emptyBerthPlant.js';
import { figureheadPlant } from './figureheadPlant.js';
import { gateGawkerPlant } from './gateGawkerPlant.js';
import { glassPaysPlant } from './glassPays.js';
import { goodPatchPlant } from './goodPatch.js';
import { litUpPlant } from './litUpPlant.js';
import { magpieReadsPlant } from './magpieReads.js';
import { measuringHullPlant } from './measuringHullPlant.js';
import { mooringAlarmsPlant } from './mooringAlarms.js';
import { movingHousePlant } from './movingHousePlant.js';
import { nightlyGhostPlant } from './nightlyGhostPlant.js';
import { onTheCallPlant } from './onTheCallPlant.js';
import { oneShotShortPlant } from './oneShotShortPlant.js';
import { otherSidePlant } from './otherSide.js';
import { outriderPlant } from './outriderPlant.js';
import { ownFaultPlant } from './ownFaultPlant.js';
import { pipsCountsPlant } from './pipsCounts.js';
import { pl104Inventory } from './pl104Inventory.js';
import { pl105Standoff } from './pl105Standoff.js';
import { pl106PartsSled } from './pl106PartsSled.js';
import { pl107EmptySlot } from './pl107EmptySlot.js';
import { pl124ParkedLight } from './pl124ParkedLight.js';
import { pl125UnderPaint } from './pl125UnderPaint.js';
import { pl126KeepingIt } from './pl126KeepingIt.js';
import { pl128TheSurge } from './pl128TheSurge.js';
import { pl129SomebodysCrate } from './pl129SomebodysCrate.js';
import { pl130TheStamp } from './pl130TheStamp.js';
import { pl146FirstCaller } from './pl146FirstCaller.js';
import { pl147FirstPart } from './pl147FirstPart.js';
import { pl148TheCount } from './pl148TheCount.js';
import { pl149SeedlingLean } from './pl149SeedlingLean.js';
import { pl150ItsSpot } from './pl150ItsSpot.js';
import { pl151NoPapers } from './pl151NoPapers.js';
import { pl152TheTally } from './pl152TheTally.js';
import { pl153TheMinute } from './pl153TheMinute.js';
import { pl155FairTrade } from './pl155FairTrade.js';
import { pl171Rattle } from './pl171RattleInB.js';
import { pl172ShadeMarket } from './pl172ShadeMarket.js';
import { pl173HesperLight } from './pl173HesperLight.js';
import { pl175First } from './pl175First.js';
import { pl178SlingshotHour } from './pl178SlingshotHour.js';
import { pl179KesslersNumber } from './pl179KesslersNumber.js';
import { pl180ChalkThief } from './pl180ChalkThief.js';
import { pl181HotCargo } from './pl181HotCargo.js';
import { pl182FlagTruce } from './pl182FlagTruce.js';
import { pl183TheWeather } from './pl183TheWeather.js';
import { pl190DroneRange } from './pl190DroneRange.js';
import { pl191StormLamps } from './pl191StormLamps.js';
import { pl192AgainMaybe } from './pl192AgainMaybe.js';
import { pl193OneShort } from './pl193OneShort.js';
import { pl195FixedX } from './pl195FixedX.js';
import { pl196MirrorRock } from './pl196MirrorRock.js';
import { pl199TheJug } from './pl199TheJug.js';
import { pl200TwoTaps } from './pl200TwoTaps.js';
import { pl201OddQueue } from './pl201OddQueue.js';
import { pl202KeptBerth } from './pl202KeptBerth.js';
import { pl203TheTour } from './pl203TheTour.js';
import { pl204TheHook } from './pl204TheHook.js';
import { pl205TheLitHull } from './pl205TheLitHull.js';
import { pl214PyrrhaBox } from './pl214PyrrhaBox.js';
import { pl215SomebodysStall } from './pl215SomebodysStall.js';
import { pl216BlueMinute } from './pl216BlueMinute.js';
import { pl230VennsWindow } from './pl230VennsWindow.js';
import { pl231MarshsLine } from './pl231MarshsLine.js';
import { pl232TheValidInstruction } from './pl232TheValidInstruction.js';
import { pl233TheFreshMark } from './pl233TheFreshMark.js';
import { pl234TheMiddleSeat } from './pl234TheMiddleSeat.js';
import { pl235CleanWeld } from './pl235CleanWeld.js';
import { pl236IvesMinute } from './pl236IvesMinute.js';
import { pl237HonkAtHeat } from './pl237HonkAtHeat.js';
import { pl238SeeHim } from './pl238SeeHim.js';
import { pl239RowansTap } from './pl239RowansTap.js';
import { pl245TheBellsHush } from './pl245TheBellsHush.js';
import { pl246WallTime } from './pl246WallTime.js';
import { pl247TheScandal } from './pl247TheScandal.js';
import { pl248CrossingShadow } from './pl248CrossingShadow.js';
import { pl252RegularsHour } from './pl252RegularsHour.js';
import { pl253WallDent } from './pl253WallDent.js';
import { radioObserverPlant } from './radioObserver.js';
import { ratRunPlant } from './ratRun.js';
import { redMinutePlant } from './redMinute.js';
import { reversedRobberyPlant } from './reversedRobberyPlant.js';
import { rungPlant } from './rungPlant.js';
import { ruthsKnockPlant } from './ruthsKnock.js';
import { sameTimeTomorrowPlant } from './sameTimeTomorrowPlant.js';
import { sennaReadsPlant } from './sennaReads.js';
import { shadowPilotPlant } from './shadowPilotPlant.js';
import { snaggedPodPlant } from './snaggedPod.js';
import { someonesCoursePlant } from './someonesCourse.js';
import { sponsorshipPlant } from './sponsorshipPlant.js';
import { stalledStringPlant } from './stalledStringPlant.js';
import { stillEvenPlant } from './stillEvenPlant.js';
import { sweeperRoutePlant } from './sweeperRoutePlant.js';
import { tankerWakePlant } from './tankerWakePlant.js';
import { theArchPlant } from './theArch.js';
import { theBrightOnePlant } from './theBrightOne.js';
import { theOldTrailPlant } from './theOldTrail.js';
import { theShelfPlant } from './theShelf.js';
import { theWindowThatDoesntPlant } from './theWindowThatDoesnt.js';
import { threeCountPlant } from './threeCount.js';
import { tickingCratePlant } from './tickingCratePlant.js';
import { twicePlant } from './twice.js';
import { twoRopesPlant } from './twoRopes.js';
import { waitingLinePlant } from './waitingLinePlant.js';
import { waveBackPlant } from './waveBackPlant.js';
import { weldersSparksPlant } from './weldersSparksPlant.js';
import { yourWakePlant } from './yourWake.js';

const PLANTS = Object.freeze([
  badMagnetPlant,
  brokenTollPlant,
  broodShortcutPlant,
  chasedThiefPlant,
  darkStretchPlant,
  deadLanePlant,
  deadStickPlant,
  dingPlant,
  dutchAfterYouPlant,
  emptyBerthPlant,
  figureheadPlant,
  gateGawkerPlant,
  glassPaysPlant,
  goodPatchPlant,
  litUpPlant,
  magpieReadsPlant,
  measuringHullPlant,
  mooringAlarmsPlant,
  movingHousePlant,
  nightlyGhostPlant,
  onTheCallPlant,
  oneShotShortPlant,
  otherSidePlant,
  outriderPlant,
  ownFaultPlant,
  pipsCountsPlant,
  pl104Inventory,
  pl105Standoff,
  pl106PartsSled,
  pl107EmptySlot,
  pl124ParkedLight,
  pl125UnderPaint,
  pl126KeepingIt,
  pl128TheSurge,
  pl129SomebodysCrate,
  pl130TheStamp,
  pl146FirstCaller,
  pl147FirstPart,
  pl148TheCount,
  pl149SeedlingLean,
  pl150ItsSpot,
  pl151NoPapers,
  pl152TheTally,
  pl153TheMinute,
  pl155FairTrade,
  pl171Rattle,
  pl172ShadeMarket,
  pl173HesperLight,
  pl175First,
  pl178SlingshotHour,
  pl179KesslersNumber,
  pl180ChalkThief,
  pl181HotCargo,
  pl182FlagTruce,
  pl183TheWeather,
  pl190DroneRange,
  pl191StormLamps,
  pl192AgainMaybe,
  pl193OneShort,
  pl195FixedX,
  pl196MirrorRock,
  pl199TheJug,
  pl200TwoTaps,
  pl201OddQueue,
  pl202KeptBerth,
  pl203TheTour,
  pl204TheHook,
  pl205TheLitHull,
  pl214PyrrhaBox,
  pl215SomebodysStall,
  pl216BlueMinute,
  pl230VennsWindow,
  pl231MarshsLine,
  pl232TheValidInstruction,
  pl233TheFreshMark,
  pl234TheMiddleSeat,
  pl235CleanWeld,
  pl236IvesMinute,
  pl237HonkAtHeat,
  pl238SeeHim,
  pl239RowansTap,
  pl245TheBellsHush,
  pl246WallTime,
  pl247TheScandal,
  pl248CrossingShadow,
  pl252RegularsHour,
  pl253WallDent,
  radioObserverPlant,
  ratRunPlant,
  redMinutePlant,
  reversedRobberyPlant,
  rungPlant,
  ruthsKnockPlant,
  sameTimeTomorrowPlant,
  sennaReadsPlant,
  shadowPilotPlant,
  snaggedPodPlant,
  someonesCoursePlant,
  sponsorshipPlant,
  stalledStringPlant,
  stillEvenPlant,
  sweeperRoutePlant,
  tankerWakePlant,
  theArchPlant,
  theBrightOnePlant,
  theOldTrailPlant,
  theShelfPlant,
  theWindowThatDoesntPlant,
  threeCountPlant,
  tickingCratePlant,
  twicePlant,
  twoRopesPlant,
  waitingLinePlant,
  waveBackPlant,
  weldersSparksPlant,
  yourWakePlant,
]);

// One bad plant must not take the boot down with it: lifecycle failures are logged per plant
// and skipped. init order is the generated order; none of them depend on each other.
function safeRun(name, fn) {
  try {
    fn();
    return true;
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) console.error('[plants] ' + name + ' lifecycle failed:', err);
    return false;
  }
}

const CHILD_OWNERS = new WeakMap();
const ownsContext = (runtime) => Object.hasOwn(runtime, '_ctx') && runtime._ctx != null;

export const plantsRuntime = {
  name: 'plants',
  init(ctx) {
    if (ownsContext(this)) return;
    this._ctx = ctx;
    this._boundPlants = [];
    for (const plant of PLANTS) {
      if (typeof plant.init !== 'function' || CHILD_OWNERS.has(plant)) continue;
      if (safeRun(plant.name, () => plant.init(ctx))) {
        CHILD_OWNERS.set(plant, this);
        this._boundPlants.push(plant);
      }
    }
  },
  update(dt, state) {
    if (!ownsContext(this) || state !== this._ctx.state) return;
    for (const plant of this._boundPlants) {
      if (typeof plant.update !== 'function') continue;
      safeRun(plant.name, () => plant.update(dt, state));
    }
  },
  destroy() {
    if (!ownsContext(this)) return;
    for (const plant of this._boundPlants) {
      if (CHILD_OWNERS.get(plant) !== this) continue;
      if (typeof plant.destroy === 'function') safeRun(plant.name, () => plant.destroy());
      CHILD_OWNERS.delete(plant);
    }
    this._boundPlants = [];
    this._ctx = null;
  },
};

export const PLANT_COUNT = PLANTS.length;
export default plantsRuntime;
