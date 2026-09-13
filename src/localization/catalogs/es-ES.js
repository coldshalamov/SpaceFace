// Shipped Spanish catalog. Built from the English inventory through the translation pipeline.
import { buildTranslatedCatalog } from '../pipeline.js';

export const locale = 'es-ES';
export const messages = buildTranslatedCatalog('es-ES');
export default messages;
