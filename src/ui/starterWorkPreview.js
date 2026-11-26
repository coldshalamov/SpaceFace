import { MODULES } from '../data/modules.js';
import { starterJobForShip, shipCarriesModule } from '../data/starterJobs.js';

// Read the same first ticket as the ordinary Helios board. This is a preview,
// never an offer, acceptance, payout, or a replacement for the current board.
const ROUTE = Object.freeze({
  starter_hitch: 'Cut iron at Helios',
  starter_pelican: 'Tow the 44-C buoy',
  starter_wasp: 'Ram the gate runner',
});

// The station's work lives behind its Jobs door (the old Contracts tab is gone), so the preview
// names the door a player will actually see at the berth.
export const STARTER_WORK_FALLBACK = Object.freeze(['Take a job', 'Pick work your fit can take from the Helios Jobs board.']);

export function starterWorkPreview(starter) {
  const fallback = [...STARTER_WORK_FALLBACK];
  const job = starterJobForShip(starter?.shipId);
  const heading = job && ROUTE[job.id];
  const step = job?.steps?.[0];
  const tool = job && MODULES.find(module => module.id === job.requiredModule)?.name;
  if (!heading || !step || !tool || starter?.id !== job.id) return fallback;
  if (!shipCarriesModule({ fittings: starter.fittedModules }, job.requiredModule)) {
    return ['Check the local fit', `Helios local work needs a ${tool}. Check your fittings, then the Jobs board.`];
  }
  const condition = job.requiredModule === 'mod_ram_plate' ? `${tool}; guns do not count` : tool;
  return [heading, `First local ticket: “${step.title}.” ${condition}. On the Helios Jobs board.`];
}

// Update the existing row in place so a new hull/fit replaces the previous job.
export function paintStarterWorkPreview(heading, detail, starter) {
  const [title, text] = starterWorkPreview(starter);
  heading.textContent = title;
  detail.textContent = text;
}
