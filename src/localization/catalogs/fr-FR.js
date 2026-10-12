// Shipped French catalog. Lazy translation-pipeline catalog; materializes on first use.
import { deferredCatalog } from '../pipeline.js';

export const locale = 'fr-FR';
export const messages = deferredCatalog('fr-FR');
export default messages;
