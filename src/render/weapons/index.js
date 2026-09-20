export {
  FLIGHT_MODE,
  BOLT_VARIANT,
  WEAPON_SOCKET_NAME,
  resolveWeaponRecipe,
  projectileSkipsVisualFactoryMesh,
  recipeUsesRibbonWake,
  recipeUsesSweptMuzzle,
  listWeaponRecipes,
  flightColorsForEntity,
  RIBBON_PROFILE,
  ribbonProfileForWidth,
} from './recipes.js';
export {
  WeaponDischargePool,
  DISCHARGE_CAPACITY,
  SURFACE_ROLE,
  IMPACT_KIND,
} from '../forceLanguage/weaponDischargePool.js';
export {
  worldSizeForPixels,
  resolveFloorWidth,
  CHASE_CAMERA_DISTANCE,
  CHASE_CAMERA_FOV_DEG,
  CHASE_CAMERA_VIEWPORT_HEIGHT,
  DEFAULT_BOLT_MIN_PIXELS,
} from './pixelFloor.js';
export { EnergyBoltPool, ENERGY_BOLT_CAPACITY, createEnergyBoltPrecompileMesh } from './energyBoltPool.js';
export { WeaponRibbonPool, WEAPON_RIBBON_CAPACITY, RIBBON_MIN_PIXELS } from './ribbonPool.js';
export { DistortionField, DISTORTION_CAPACITY } from './distortionField.js';
export { WeaponLightPool, WEAPON_LIGHT_POOL_SIZE, visiblePointLightBudget } from './weaponLights.js';
export { HullScorchPool, HULL_SCORCH_CAPACITY, heatForWeaponVariant, scorchHeatForAge } from './contactMarks.js';
export {
  addShieldContact,
  ageShieldContacts,
  readShieldContacts,
  clearShieldContacts,
  SHIELD_HIT_SLOTS,
} from './shieldContacts.js';
export { WeaponVfxPresenter, createWeaponVfxPresenter } from './presenter.js';
