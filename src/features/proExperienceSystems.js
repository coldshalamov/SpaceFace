// Fresh simulation owners shared by the browser and Node production registries.
// Presentation stays on the browser path; importing this table never loads Three.js.
import { createShipbreakingYardSystemEntries } from './shipbreakingYard/integration.js';
import { createRigWorkshopSystem } from './rigWorkshop/integration.js';
import { createSalvageTenderSystem } from './salvageTender/runtime.js';
import { createSalvageTenderPromptSystem } from './salvageTender/prompts.js';
import { salvageOutfits } from './salvageOutfits/index.js';
import { salvageOutfitsPrompt } from './salvageOutfits/integration.js';
import { createIndustrialDisastersSystem } from './industrialDisasters/runtime.js';

export function createProExperienceSystemEntries() {
  return [
    ...createShipbreakingYardSystemEntries(),
    ['rigWorkshop', createRigWorkshopSystem()],
    ['salvageTender', createSalvageTenderSystem()],
    ['salvageTenderPrompt', createSalvageTenderPromptSystem()],
    ['salvageOutfits', Object.create(salvageOutfits)],
    ['salvageOutfitsPrompt', Object.create(salvageOutfitsPrompt)],
    ['industrialDisasters', createIndustrialDisastersSystem()],
  ];
}
