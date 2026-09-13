// Shipped French catalog. Built from the English inventory through the translation pipeline.
import { buildTranslatedCatalog } from '../pipeline.js';

export const locale = 'fr-FR';
export const messages = buildTranslatedCatalog('fr-FR');
export default messages;
