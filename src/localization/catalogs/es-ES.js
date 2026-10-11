// Shipped Spanish catalog. Lazy translation-pipeline catalog; materializes on first use.
import { deferredCatalog } from '../pipeline.js';

export const locale = 'es-ES';
export const messages = deferredCatalog('es-ES');
export default messages;
