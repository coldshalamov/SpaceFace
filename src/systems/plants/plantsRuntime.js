// plantsRuntime — the single registration point for every standalone plant system.
// One init/update/destroy pass-through so the browser registry, the node factory table and
// the authoritative manifest each need exactly one 'plants' entry. Traffic-family plants
// (the *Ops mixins — farBerth, mistaken, ducklings, ...) are NOT registered here: they wire
// into src/systems/traffic.js's reaction object, the established family route.
// Scope: MODE_SCOPE_COMBAT_FLIGHT (flight + swarm + yard) — plants exist in both doors.
// Single-sim ownership: imported children are singletons. The first live runtime owns each
// child until destroy(); forked sims skip those children rather than stealing subscriptions.
// Covers src/systems/plants/*.js AND src/systems/plants/mercies/*.js (recursive scan).
// radioObserverMercy.js is deliberately absent: bandRadio constructs and drives it.
// Generated from the module directory: add a module file, rerun the generator, done.

import { afterHoursCoachPlant } from './afterHoursCoach.js';
import { anselsDishPlant } from './anselsDish.js';
import { isRacingCorridorSession } from '../../world/racingCorridor.js';
import { getSimStepProfiler, nowNs } from '../../core/simStepProfiler.js';
import { badMagnetPlant } from './badMagnetPlant.js';
import { borrowedBoostPlant } from './borrowedBoost.js';
import { borrowedLadderPlant } from './borrowedLadder.js';
import { brokenTollPlant } from './brokenTollPlant.js';
import { broodShortcutPlant } from './broodShortcutPlant.js';
import { carriedWordPlant } from './carriedWord.js';
import { chalkSeatPlant } from './chalkSeat.js';
import { chasedThiefPlant } from './chasedThiefPlant.js';
import { coatRackPlant } from './coatRack.js';
import { coffeeHatchPlant } from './coffeeHatch.js';
import { convoyGodmotherPlant } from './convoyGodmother.js';
import { coveredWindowPlant } from './coveredWindow.js';
import { crowdCoinPlant } from './crowdCoinPlant.js';
import { darkStretchPlant } from './darkStretchPlant.js';
import { deadLanePlant } from './deadLane.js';
import { deadStickPlant } from './deadStickPlant.js';
import { dingPlant } from './dingPlant.js';
import { dutchAfterYouPlant } from './dutchAfterYou.js';
import { emptyBerthPlant } from './emptyBerthPlant.js';
import { farePoolPlant } from './farePool.js';
import { figureheadPlant } from './figureheadPlant.js';
import { firstLightPlant } from './firstLight.js';
import { freeForgePlant } from './freeForgePlant.js';
import { gateGawkerPlant } from './gateGawkerPlant.js';
import { glassPaysPlant } from './glassPays.js';
import { goodPatchPlant } from './goodPatch.js';
import { goodWordPlant } from './goodWord.js';
import { gullDronePlant } from './gullDrone.js';
import { kidMechanicPlant } from './kidMechanic.js';
import { kindCheckerPlant } from './kindChecker.js';
import { lanternLoanPlant } from './lanternLoan.js';
import { litUpPlant } from './litUpPlant.js';
import { loanerGunPlant } from './loanerGunPlant.js';
import { looseBoltsPlant } from './looseBolts.js';
import { magpieReadsPlant } from './magpieReads.js';
import { mascotPlant } from './mascotPlant.js';
import { measuringHullPlant } from './measuringHullPlant.js';
import { medicMulePlant } from './medicMulePlant.js';
import { pl269KindnessLocker } from './mercies/pl269KindnessLocker.js';
import { pl270StashedMedal } from './mercies/pl270StashedMedal.js';
import { pl271MapInTheLid } from './mercies/pl271MapInTheLid.js';
import { pl272ForwardBeacon } from './mercies/pl272ForwardBeacon.js';
import { pl364KindnessLedger } from './mercies/pl364KindnessLedger.js';
import { pl365LampGarden } from './mercies/pl365LampGarden.js';
import { pl366RegistryHatch } from './mercies/pl366RegistryHatch.js';
import { pl367LingeringLift } from './mercies/pl367LingeringLift.js';
import { pl368ThankYouSlate } from './mercies/pl368ThankYouSlate.js';
import { pl369LastAllowance } from './mercies/pl369LastAllowance.js';
import { pl370HousewarmingPart } from './mercies/pl370HousewarmingPart.js';
import { pl371LaneTithe } from './mercies/pl371LaneTithe.js';
import { pl372WreckersCourtesy } from './mercies/pl372WreckersCourtesy.js';
import { pl373HearthLamp } from './mercies/pl373HearthLamp.js';
import { mooringAlarmsPlant } from './mooringAlarms.js';
import { movingHousePlant } from './movingHousePlant.js';
import { nightBellPlant } from './nightBell.js';
import { nightlyGhostPlant } from './nightlyGhostPlant.js';
import { onTheCallPlant } from './onTheCallPlant.js';
import { oneShotShortPlant } from './oneShotShortPlant.js';
import { openDoorPlant } from './openDoorPlant.js';
import { openHatchPlant } from './openHatch.js';
import { otherSidePlant } from './otherSide.js';
import { outriderPlant } from './outriderPlant.js';
import { overtimeMugPlant } from './overtimeMug.js';
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
import { pl258TowAlong } from './pl258TowAlong.js';
import { pl259SpareAndShare } from './pl259SpareAndShare.js';
import { pl260FiftiethVisit } from './pl260FiftiethVisit.js';
import { pl261OpenTank } from './pl261OpenTank.js';
import { pl262GatheredPile } from './pl262GatheredPile.js';
import { pl264LaneLight } from './pl264LaneLight.js';
import { pl267QueuePass } from './pl267QueuePass.js';
import { pl333NoQuestionsShelf } from './pl333NoQuestionsShelf.js';
import { pl334WindBreakChain } from './pl334WindBreakChain.js';
import { pl335DawnLine } from './pl335DawnLine.js';
import { pl336LampKeeper } from './pl336LampKeeper.js';
import { pl337HonorUrn } from './pl337HonorUrn.js';
import { pl338TowPost } from './pl338TowPost.js';
import { pl339SignalMirror } from './pl339SignalMirror.js';
import { pl340EchoCount } from './pl340EchoCount.js';
import { pl341RestringBuoys } from './pl341RestringBuoys.js';
import { pl342BleedVent } from './pl342BleedVent.js';
import { pl343LiftBell } from './pl343LiftBell.js';
import { pl344NeedsList } from './pl344NeedsList.js';
import { pl345KettleWindow } from './pl345KettleWindow.js';
import { pl346FixedRope } from './pl346FixedRope.js';
import { pl347SmallHullDrum } from './pl347SmallHullDrum.js';
import { pl348SeamKitchen } from './pl348SeamKitchen.js';
import { pl349MercyTug } from './pl349MercyTug.js';
import { pl350KeyWall } from './pl350KeyWall.js';
import { pl351SamplePad } from './pl351SamplePad.js';
import { pl352ChalkedName } from './pl352ChalkedName.js';
import { pl353CleanStamp } from './pl353CleanStamp.js';
import { pl354GoodHullRate } from './pl354GoodHullRate.js';
import { pl355TheUnit } from './pl355TheUnit.js';
import { pl356ParadeBerth } from './pl356ParadeBerth.js';
import { pl357WarmGrid } from './pl357WarmGrid.js';
import { pl358ApprenticesReturn } from './pl358ApprenticesReturn.js';
import { pl359EscortsGift } from './pl359EscortsGift.js';
import { pl360RainCheck } from './pl360RainCheck.js';
import { pl361SecondStart } from './pl361SecondStart.js';
import { pl362NameOnPlate } from './pl362NameOnPlate.js';
import { pl363FamilyRate } from './pl363FamilyRate.js';
import { radioObserverPlant } from './radioObserver.js';
import { ratRunPlant } from './ratRun.js';
import { redMinutePlant } from './redMinute.js';
import { rescueDividendPlant } from './rescueDividend.js';
import { reversedRobberyPlant } from './reversedRobberyPlant.js';
import { rungPlant } from './rungPlant.js';
import { ruthsKnockPlant } from './ruthsKnock.js';
import { sameTimeTomorrowPlant } from './sameTimeTomorrowPlant.js';
import { secondChairPlant } from './secondChair.js';
import { sennaReadsPlant } from './sennaReads.js';
import { shadowCoachPlant } from './shadowCoachPlant.js';
import { shadowPilotPlant } from './shadowPilotPlant.js';
import { sharedCabPlant } from './sharedCab.js';
import { silentMechanicsPlant } from './silentMechanics.js';
import { snaggedPodPlant } from './snaggedPod.js';
import { someonesCoursePlant } from './someonesCourse.js';
import { spareBedPlant } from './spareBed.js';
import { sponsorshipPlant } from './sponsorshipPlant.js';
import { stalledStringPlant } from './stalledStringPlant.js';
import { stillEvenPlant } from './stillEvenPlant.js';
import { surrenderDoorPlant } from './surrenderDoorPlant.js';
import { sweeperRoutePlant } from './sweeperRoutePlant.js';
import { tankerWakePlant } from './tankerWakePlant.js';
import { tapCheerPlant } from './tapCheerPlant.js';
import { theArchPlant } from './theArch.js';
import { theBrightOnePlant } from './theBrightOne.js';
import { theOldTrailPlant } from './theOldTrail.js';
import { theSamplerPlant } from './theSampler.js';
import { theShelfPlant } from './theShelf.js';
import { theWindowThatDoesntPlant } from './theWindowThatDoesnt.js';
import { threeCountPlant } from './threeCount.js';
import { tickingCratePlant } from './tickingCratePlant.js';
import { tipJarPlant } from './tipJar.js';
import { tipLinePlant } from './tipLine.js';
import { twicePlant } from './twice.js';
import { twoRopesPlant } from './twoRopes.js';
import { umbrellaCranePlant } from './umbrellaCrane.js';
import { underdogPlatePlant } from './underdogPlatePlant.js';
import { veteranSeatPlant } from './veteranSeatPlant.js';
import { veteranTapPlant } from './veteranTapPlant.js';
import { waitingLinePlant } from './waitingLinePlant.js';
import { walkingLunchPlant } from './walkingLunch.js';
import { waveBackPlant } from './waveBackPlant.js';
import { weldersSparksPlant } from './weldersSparksPlant.js';
import { windowWarmerPlant } from './windowWarmer.js';
import { yourWakePlant } from './yourWake.js';

const PLANTS = Object.freeze([
  afterHoursCoachPlant,
  anselsDishPlant,
  badMagnetPlant,
  borrowedBoostPlant,
  borrowedLadderPlant,
  brokenTollPlant,
  broodShortcutPlant,
  carriedWordPlant,
  chalkSeatPlant,
  chasedThiefPlant,
  coatRackPlant,
  coffeeHatchPlant,
  convoyGodmotherPlant,
  coveredWindowPlant,
  crowdCoinPlant,
  darkStretchPlant,
  deadLanePlant,
  deadStickPlant,
  dingPlant,
  dutchAfterYouPlant,
  emptyBerthPlant,
  farePoolPlant,
  figureheadPlant,
  firstLightPlant,
  freeForgePlant,
  gateGawkerPlant,
  glassPaysPlant,
  goodPatchPlant,
  goodWordPlant,
  gullDronePlant,
  kidMechanicPlant,
  kindCheckerPlant,
  lanternLoanPlant,
  litUpPlant,
  loanerGunPlant,
  looseBoltsPlant,
  magpieReadsPlant,
  mascotPlant,
  measuringHullPlant,
  medicMulePlant,
  pl269KindnessLocker,
  pl270StashedMedal,
  pl271MapInTheLid,
  pl272ForwardBeacon,
  pl364KindnessLedger,
  pl365LampGarden,
  pl366RegistryHatch,
  pl367LingeringLift,
  pl368ThankYouSlate,
  pl369LastAllowance,
  pl370HousewarmingPart,
  pl371LaneTithe,
  pl372WreckersCourtesy,
  pl373HearthLamp,
  mooringAlarmsPlant,
  movingHousePlant,
  nightBellPlant,
  nightlyGhostPlant,
  onTheCallPlant,
  oneShotShortPlant,
  openDoorPlant,
  openHatchPlant,
  otherSidePlant,
  outriderPlant,
  overtimeMugPlant,
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
  pl258TowAlong,
  pl259SpareAndShare,
  pl260FiftiethVisit,
  pl261OpenTank,
  pl262GatheredPile,
  pl264LaneLight,
  pl267QueuePass,
  pl333NoQuestionsShelf,
  pl334WindBreakChain,
  pl335DawnLine,
  pl336LampKeeper,
  pl337HonorUrn,
  pl338TowPost,
  pl339SignalMirror,
  pl340EchoCount,
  pl341RestringBuoys,
  pl342BleedVent,
  pl343LiftBell,
  pl344NeedsList,
  pl345KettleWindow,
  pl346FixedRope,
  pl347SmallHullDrum,
  pl348SeamKitchen,
  pl349MercyTug,
  pl350KeyWall,
  pl351SamplePad,
  pl352ChalkedName,
  pl353CleanStamp,
  pl354GoodHullRate,
  pl355TheUnit,
  pl356ParadeBerth,
  pl357WarmGrid,
  pl358ApprenticesReturn,
  pl359EscortsGift,
  pl360RainCheck,
  pl361SecondStart,
  pl362NameOnPlate,
  pl363FamilyRate,
  radioObserverPlant,
  ratRunPlant,
  redMinutePlant,
  rescueDividendPlant,
  reversedRobberyPlant,
  rungPlant,
  ruthsKnockPlant,
  sameTimeTomorrowPlant,
  secondChairPlant,
  sennaReadsPlant,
  shadowCoachPlant,
  shadowPilotPlant,
  sharedCabPlant,
  silentMechanicsPlant,
  snaggedPodPlant,
  someonesCoursePlant,
  spareBedPlant,
  sponsorshipPlant,
  stalledStringPlant,
  stillEvenPlant,
  surrenderDoorPlant,
  sweeperRoutePlant,
  tankerWakePlant,
  tapCheerPlant,
  theArchPlant,
  theBrightOnePlant,
  theOldTrailPlant,
  theSamplerPlant,
  theShelfPlant,
  theWindowThatDoesntPlant,
  threeCountPlant,
  tickingCratePlant,
  tipJarPlant,
  tipLinePlant,
  twicePlant,
  twoRopesPlant,
  umbrellaCranePlant,
  underdogPlatePlant,
  veteranSeatPlant,
  veteranTapPlant,
  waitingLinePlant,
  walkingLunchPlant,
  waveBackPlant,
  weldersSparksPlant,
  windowWarmerPlant,
  yourWakePlant,
]);

const CHILD_OWNERS = new WeakMap();
const ownsContext = (runtime) => Object.hasOwn(runtime, '_ctx') && runtime._ctx != null;
const RESET_EVENTS = new Set(['game:new', 'game:newGame', 'save:loaded', 'sector:exit']);

// Returns true when the plant came up clean. Init failures are logged and the child is
// simply not owned; one bad plant never takes the boot down.
function safeRun(name, fn) {
  try {
    fn();
    return true;
  } catch (err) {
    reportPlantFailure(name, err);
    return false;
  }
}

function reportPlantFailure(name, err) {
  if (typeof console !== 'undefined' && console.error) console.error('[plants] ' + name + ' lifecycle failed:', err);
}

export const plantsRuntime = {
  name: 'plants',
  init(ctx) {
    if (ownsContext(this)) return;
    this._ctx = ctx;
    this._boundPlants = [];
    // Campaign plants subscribe to sector entry and gameplay directly. Suppress their
    // handlers in standalone Circuits while still delivering run and sector cleanup.
    const plantBus = Object.create(ctx.bus);
    plantBus.on = (event, listener, options) => ctx.bus.on(event, RESET_EVENTS.has(event) ? listener : (payload) => {
      if (!isRacingCorridorSession(ctx.state)) return listener(payload);
      return undefined;
    }, options);
    const plantContext = { ...ctx, bus: plantBus };
    for (const plant of PLANTS) {
      if (typeof plant.init !== 'function' || CHILD_OWNERS.has(plant)) continue;
      if (safeRun(plant.name, () => plant.init(plantContext))) {
        CHILD_OWNERS.set(plant, this);
        this._boundPlants.push(plant);
      }
    }
  },
  update(dt, state) {
    if (!ownsContext(this) || state !== this._ctx.state) return;
    if (isRacingCorridorSession(state)) return;
    const plants = this._boundPlants;
    for (let i = 0; i < plants.length; i++) {
      const plant = plants[i];
      if (typeof plant.update !== 'function') continue;
      // The ordered tick can reach every child. Isolate failures at the call so a
      // routine update does not allocate a callback for each plant.
      const prof = getSimStepProfiler();
      const t0 = prof.active ? nowNs() : 0;
      try {
        plant.update(dt, state);
        // Per-plant attribution (no-freeze world speed): only while the profiler is armed.
        if (prof.active) prof.record(`plants.${plant.name || i}`, nowNs() - t0);
      } catch (err) {
        reportPlantFailure(plant.name, err);
      }
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
