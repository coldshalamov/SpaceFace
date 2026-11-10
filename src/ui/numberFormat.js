// The implementation moved to ../core/numberFormat.js so sim-side code (src/combat/) can share it
// without importing presentation — the combat-grammar ownership check forbids src/combat → src/ui
// imports. This shim keeps the module's UI-era import path alive for the HUD and the focused
// locale test. Re-export only; no code lives here.
export {
  FALLBACK_NUMBER_LOCALE,
  resolveNumberLocale,
  formatNumber,
  formatCount,
  localeGroupsThousands,
} from '../core/numberFormat.js';
