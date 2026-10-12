// Shipped Brazilian Portuguese catalog. Lazy translation-pipeline catalog; materializes on first use.
import { deferredCatalog } from '../pipeline.js';

export const locale = 'pt-BR';
export const messages = deferredCatalog('pt-BR');
export default messages;
