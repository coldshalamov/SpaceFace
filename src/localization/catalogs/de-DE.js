// Shipped German catalog. Lazy translation-pipeline catalog; materializes on first use.
import { deferredCatalog } from '../pipeline.js';

export const locale = 'de-DE';
export const messages = deferredCatalog('de-DE');
export default messages;
