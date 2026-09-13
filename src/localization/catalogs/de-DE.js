// Shipped German catalog. Built from the English inventory through the translation pipeline.
import { buildTranslatedCatalog } from '../pipeline.js';

export const locale = 'de-DE';
export const messages = buildTranslatedCatalog('de-DE');
export default messages;
