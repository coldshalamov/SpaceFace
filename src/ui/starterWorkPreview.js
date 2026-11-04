import { starterJobForShip, shipCarriesModule } from '../data/starterJobs.js';

// Read the same first ticket as the ordinary Helios board. This is a preview,
// never an offer, acceptance, payout, or a replacement for the current board.
const ROUTE = Object.freeze({
  starter_hitch: { heading: 'Cut iron at Helios', tool: 'Drill Amp' },
  starter_pelican: { heading: 'Tow the 44-C buoy', tool: 'Heavy-Duty Winch' },
  starter_wasp: { heading: 'Ram the gate runner', tool: 'Ram Plate' },
});

export function starterWorkPreview(starter) {
  const fallback = ['Dock and pick work', 'Check Contracts at Helios for work your current fit can take.'];
  const job = starterJobForShip(starter?.shipId);
  const route = job && ROUTE[job.id];
  const step = job?.steps?.[0];
  if (!route || !step || starter?.id !== job.id) return fallback;
  if (!shipCarriesModule({ fittings: starter.fittedModules }, job.requiredModule)) {
    return ['Check the local fit', `Helios local work needs a ${route.tool}. Check your fittings and the current Contracts board.`];
  }
  const condition = job.id === 'starter_wasp' ? 'Ram Plate; guns do not count' : route.tool;
  return [route.heading, `First local ticket: “${step.title}.” ${condition}. Check Contracts at Helios.`];
}

// Update the existing row in place. Repeated hull choices cannot accumulate rows,
// controls or listeners, and an unavailable fit replaces the previous hull's job.
export function paintStarterWorkPreview(heading, detail, starter) {
  const [title, text] = starterWorkPreview(starter);
  heading.textContent = title;
  detail.textContent = text;
}
